import type { Station } from "../types";

export function playlistStream(body: string): string | undefined {
	const pls = body.match(/^\s*File\d+\s*=\s*(https?:\/\/\S+)/im)?.[1];
	return (
		pls ??
		body
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find((line) => /^https?:\/\//i.test(line))
	);
}

export async function resolveStation(
	station: Station,
	signal?: AbortSignal,
): Promise<Station> {
	const url = new URL(station.streamUrl.trim());
	if (!["http:", "https:"].includes(url.protocol))
		throw new Error("Invalid station stream URL.");
	// TuneIn returns a finite text playlist. The media proxy only unwraps .pls
	// and .m3u URLs, so feeding Tune.ashx directly to Rockbox decodes text.
	if (!/\/Tune\.ashx$/i.test(url.pathname))
		return { ...station, streamUrl: url.href };
	const controller = new AbortController();
	const abort = () => controller.abort();
	signal?.addEventListener("abort", abort, { once: true });
	if (signal?.aborted) controller.abort();
	const timer = setTimeout(abort, 10000);
	try {
		// Resolve saved TuneIn references through the same atradio media API as web.
		const endpoint = `https://media.atradio.fm/api/tunein/Tune.ashx${url.search}`;
		const response = await fetch(endpoint, { signal: controller.signal });
		if (!response.ok)
			throw new Error("Could not resolve this station. Please try again.");
		const streamUrl = playlistStream(await response.text());
		if (!streamUrl)
			throw new Error("This station did not provide a playable stream.");
		return { ...station, streamUrl };
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", abort);
	}
}
