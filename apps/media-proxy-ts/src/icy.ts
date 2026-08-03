/**
 * ICY (Icecast/SHOUTcast) "now playing" title reader.
 *
 * Asks the stream to interleave metadata (`Icy-MetaData: 1`), then walks the
 * blocks: every `icy-metaint` audio bytes there's a length byte (*16) followed
 * by that many metadata bytes containing `StreamTitle='…'`. Bounded to
 * `metaint*2 + 4096` bytes so an endless stream can't hang us.
 */

import { open, type Upstream } from "./upstream.ts";

const ICY_TIMEOUT = 8000;
const ICY_EXTRA = 4096;

/** The current `StreamTitle` for a stream, or `null` if it exposes none. */
export async function readTitle(url: string): Promise<string | null> {
  let up: Upstream;
  try {
    up = await open(url, { "icy-metadata": "1" }, ICY_TIMEOUT);
  } catch {
    return null;
  }

  const metaint = Number.parseInt(up.headers.get("icy-metaint") ?? "", 10);
  if (!Number.isInteger(metaint) || metaint <= 0) {
    up.socket.destroy();
    return null;
  }

  const cap = metaint * 2 + ICY_EXTRA;
  try {
    return await scan(up, metaint, cap);
  } finally {
    up.socket.destroy();
  }
}

function scan(up: Upstream, metaint: number, cap: number): Promise<string | null> {
  const { socket } = up;
  return new Promise((resolve) => {
    let buf = up.leftover;
    let consumed = up.leftover.length;
    let done = false;

    const finish = (title: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.removeListener("data", onData);
      socket.removeListener("error", onErr);
      socket.removeListener("close", onErr);
      resolve(title);
    };

    const timer = setTimeout(() => finish(null), ICY_TIMEOUT);
    const onErr = () => finish(null);

    const tryParse = () => {
      // Walk whole `metaint`-audio + length-byte(+meta) blocks out of `buf`.
      for (;;) {
        if (consumed >= cap) return finish(null);
        // Need the audio run plus the length byte.
        if (buf.length < metaint + 1) return; // await more data
        const len = buf[metaint] * 16;
        if (len === 0) {
          // Empty block (common right after connect) — skip to the next one.
          buf = buf.subarray(metaint + 1);
          continue;
        }
        if (buf.length < metaint + 1 + len) return; // await the metadata bytes
        const meta = buf.subarray(metaint + 1, metaint + 1 + len);
        return finish(parseStreamTitle(meta));
      }
    };

    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      consumed += chunk.length;
      tryParse();
    };

    socket.on("data", onData);
    socket.on("error", onErr);
    socket.on("close", onErr);

    // The header read may already have buffered a full block.
    tryParse();
  });
}

function parseStreamTitle(meta: Buffer): string | null {
  const text = meta.toString("latin1");
  // `StreamTitle='…'` where a literal `'` inside the title is not followed by `;`.
  const m = text.match(/StreamTitle='((?:[^']|'(?!;))*)'/);
  if (m === null) return null;
  const title = m[1].trim();
  return title === "" ? null : title;
}
