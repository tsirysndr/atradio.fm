import { useEffect, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { consola } from "consola";
import {
  DEFAULT_AUDIO_SETTINGS,
  audioSettingsRecordToData,
} from "@atradio/lexicons";
import { clientAtom, didAtom } from "@/atoms/auth";
import {
  applyAudioSettings,
  applyRemoteAudioSettingsAtom,
  fromAudioSettingsData,
  toAudioSettingsData,
  useAudioSettingsSnapshot,
} from "@/atoms/audioSettings";
import { getRockboxPlayer } from "@/lib/audio/rockbox";
import { getAudioSettings, putAudioSettings } from "@/lib/atproto/records";

/** How long a settings change must sit still before it's written to the PDS.
 *  Slider drags emit dozens of values per second — one record write per
 *  pause keeps well clear of PDS rate limits. */
const WRITE_DEBOUNCE_MS = 3000;

/**
 * Syncs the audio settings (EQ + DSP chain) with the logged-in user's
 * fm.atradio.audio.settings record; renders nothing.
 *
 * On login the remote record wins: it's applied to the local atoms (and the
 * live engine). After that, local changes are debounced and written back, so
 * settings follow the account across devices/browsers.
 */
export function AudioSettingsSync() {
  const client = useAtomValue(clientAtom);
  const did = useAtomValue(didAtom);
  const settings = useAudioSettingsSnapshot();
  const applyRemote = useSetAtom(applyRemoteAudioSettingsAtom);

  const [restored, setRestored] = useState(false);
  /** JSON of the last state known to match the PDS record (null = none). */
  const lastSyncedRef = useRef<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Restore from the PDS on login.
  useEffect(() => {
    setRestored(false);
    lastSyncedRef.current = null;
    if (!client || !did) return;
    let cancelled = false;
    (async () => {
      try {
        const record = await getAudioSettings(client, did);
        if (cancelled) return;
        if (record) {
          const data = fromAudioSettingsData(audioSettingsRecordToData(record));
          lastSyncedRef.current = JSON.stringify(toAudioSettingsData(data));
          applyRemote(data);
          // Push straight into the engine if it's already playing.
          const p = getRockboxPlayer();
          if (p.ready) applyAudioSettings(p, data);
        } else {
          // No record yet. Treat untouched defaults as already-synced so we
          // don't write a record for users who never opened the equalizer;
          // customized local settings seed the record via the push effect.
          const localJson = JSON.stringify(
            toAudioSettingsData(settingsRef.current),
          );
          lastSyncedRef.current =
            localJson === JSON.stringify(DEFAULT_AUDIO_SETTINGS)
              ? localJson
              : null;
        }
      } catch (err) {
        consola.error("[audio-sync] failed to load settings record", err);
        // Leave lastSynced at the local state so we don't clobber the remote
        // record with local values after a transient read failure.
        lastSyncedRef.current = JSON.stringify(
          toAudioSettingsData(settingsRef.current),
        );
      } finally {
        if (!cancelled) setRestored(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, did, applyRemote]);

  // Debounced write-back of local changes.
  useEffect(() => {
    if (!client || !did || !restored) return;
    const data = toAudioSettingsData(settings);
    const json = JSON.stringify(data);
    if (json === lastSyncedRef.current) return;
    const timer = setTimeout(async () => {
      try {
        await putAudioSettings(client, did, data);
        lastSyncedRef.current = json;
      } catch (err) {
        consola.error("[audio-sync] failed to save settings record", err);
      }
    }, WRITE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [client, did, restored, settings]);

  return null;
}
