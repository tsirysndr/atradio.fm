import type { Station } from "../types";

/** Serialize status writes so a slower old station cannot overwrite a new one. */
export class PlayHistorySync {
	private lastWritten = "";
	private busy = false;
	private retryAt = 0;
	private target?: { key: string; did: string; station: Station };
	constructor(
		private write: (did: string, station: Station) => Promise<unknown>,
		private updated: () => void,
		private failed: (error: unknown) => void,
		private now = Date.now,
	) {}
	update(did: string | undefined, state: string, station?: Station) {
		if (!did || state === "stopped") {
			this.target = undefined;
			this.lastWritten = "";
			this.retryAt = 0;
			return;
		}
		if (state !== "playing" || !station) {
			this.target = undefined;
			return;
		}
		const key = `${did}|${station.id}`;
		if (key !== this.target?.key) this.retryAt = 0;
		this.target = { key, did, station };
		void this.flush();
	}
	private async flush() {
		if (
			this.busy ||
			!this.target ||
			this.target.key === this.lastWritten ||
			this.now() < this.retryAt
		)
			return;
		const target = this.target;
		this.busy = true;
		try {
			await this.write(target.did, target.station);
			this.lastWritten = target.key;
			if (this.target?.did === target.did) this.updated();
		} catch (error) {
			if (this.target?.key === target.key) {
				this.retryAt = this.now() + 15000;
				this.failed(error);
			}
		} finally {
			this.busy = false;
			// A station selected during the request is written next, never concurrently.
			if (this.target && this.target.key !== target.key) void this.flush();
		}
	}
}
