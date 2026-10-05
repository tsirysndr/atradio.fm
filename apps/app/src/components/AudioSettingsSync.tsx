import { useEffect, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useQuery } from "@tanstack/react-query";
import type { AudioSettingsData } from "@atradio/lexicons";
import { authAtom } from "../state/app";
import {
	equalizerAtom,
	equalizerRevisionAtom,
	equalizerSyncAtom,
} from "../state/equalizer";
import {
	defaultEqualizer,
	fromRepoEqualizer,
	repoSettingsKey,
} from "../playback/equalizer";
import { radio } from "../native";
import { request } from "../auth/client";

export default function AudioSettingsSync() {
	const auth = useAtomValue(authAtom);
	const did = auth.state === "signedIn" ? auth.profile?.did : undefined;
	const [settings, setSettings] = useAtom(equalizerAtom);
	const revision = useAtomValue(equalizerRevisionAtom);
	const setStatus = useSetAtom(equalizerSyncAtom);
	const restored = useRef<string | undefined>(undefined);
	const baseline = useRef(0);
	const lastSaved = useRef("");
	const writeBusy = useRef(false);
	const [retry, setRetry] = useState(0);
	const engineQueue = useRef(Promise.resolve());
	const current = useRef(settings);
	current.current = settings;
	useEffect(() => {
		let live = true;
		void radio
			.getEqualizer()
			.then((eq) => {
				if (live) setSettings(eq ?? defaultEqualizer());
			})
			.catch(() => {
				if (live) setSettings(defaultEqualizer());
			});
		return () => {
			live = false;
		};
	}, []);
	// The same shared state drives the EQ screen and the native DSP, even if the
	// screen is closed when the user's repository finishes loading.
	useEffect(() => {
		if (!settings) return;
		engineQueue.current = engineQueue.current
			.catch(() => {})
			.then(() => radio.setEqualizer(settings))
			.catch(() => setStatus("Could not apply audio settings to the player."));
	}, [settings]);
	const remote = useQuery({
		queryKey: ["audio-settings", did, auth.canSyncEqualizer],
		enabled: !!did && !!settings,
		queryFn: () =>
			request<AudioSettingsData | null>(
				"stationAction",
				JSON.stringify({ action: "getAudioSettings", actor: did }),
			),
		retry: 2,
		staleTime: 0,
		refetchInterval: (query) =>
			query.state.status === "error" ? 30000 : false,
	});
	useEffect(() => {
		restored.current = undefined;
		baseline.current = revision;
		lastSaved.current = "";
		setStatus(
			did
				? "Loading audio settings from your ATProto repo…"
				: "Saved on this device.",
		);
	}, [did, auth.canSyncEqualizer]);
	useEffect(() => {
		if (
			!did ||
			restored.current === did ||
			!remote.isSuccess ||
			remote.isFetching ||
			!current.current
		)
			return;
		// Remote wins on login, as on web. Failed reads never authorize a save.
		const next = remote.data
			? fromRepoEqualizer(
					remote.data,
					current.current.precut,
					current.current.balance,
				)
			: current.current;
		restored.current = did;
		baseline.current = revision;
		lastSaved.current = repoSettingsKey(next);
		setSettings(next);
		setStatus(
			auth.canSyncEqualizer
				? "Audio settings synced with your ATProto repo."
				: "Reconnect to sync audio changes to your ATProto repo.",
		);
	}, [
		did,
		remote.isSuccess,
		remote.isFetching,
		remote.data,
		auth.canSyncEqualizer,
	]);
	useEffect(() => {
		if (remote.isError && did)
			setStatus(
				"Could not load your saved audio settings. Retrying; your repo settings will not be overwritten.",
			);
	}, [remote.isError, did]);
	useEffect(() => {
		if (
			!did ||
			!auth.canSyncEqualizer ||
			restored.current !== did ||
			!settings ||
			revision === baseline.current
		)
			return;
		const json = repoSettingsKey(settings);
		if (json === lastSaved.current) return;
		let live = true;
		setStatus("Saving audio settings to your ATProto repo…");
		const timer = setTimeout(async () => {
			if (writeBusy.current) {
				if (live) setRetry((n) => n + 1);
				return;
			}
			writeBusy.current = true;
			try {
				await request(
					"stationAction",
					JSON.stringify({ action: "saveEqualizer", actor: did, settings }),
				);
				if (live) {
					lastSaved.current = json;
					setStatus("Audio settings synced with your ATProto repo.");
				}
			} catch {
				if (live)
					setStatus(
						"Audio settings saved on this device. Repo sync failed; retrying automatically.",
					);
			} finally {
				writeBusy.current = false;
				if (live) retryTimer = setTimeout(() => setRetry((n) => n + 1), 15000);
			}
		}, 3000);
		let retryTimer: ReturnType<typeof setTimeout> | undefined;
		return () => {
			live = false;
			clearTimeout(timer);
			clearTimeout(retryTimer);
		};
	}, [did, auth.canSyncEqualizer, settings, revision, remote.isSuccess, retry]);
	return null;
}
