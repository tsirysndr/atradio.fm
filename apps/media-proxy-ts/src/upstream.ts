/**
 * Raw-socket HTTP/1.1 client for the audio proxy.
 *
 * Why not `fetch`? Radio streams need three things a standard HTTP client fights
 * you on:
 *
 *   1. ICY/SHOUTcast servers answer with a non-HTTP status line (`ICY 200 OK`)
 *      that strict parsers reject.
 *   2. Icecast/SHOUTcast bodies carry no `content-length` and no chunked
 *      encoding — they're delimited by the connection closing, so the read must
 *      never impose a total-duration cap that would cut a stream off mid-song.
 *   3. The body is effectively infinite, so it must be streamed chunk-by-chunk,
 *      never buffered.
 *
 * Speaking HTTP by hand over `node:net`/`node:tls` (both first-class in Bun)
 * gives us exactly that: we own the socket, tolerate the `ICY` status line, and
 * hand the live socket back to the caller to pipe or to walk for ICY metadata.
 */

import net from "node:net";
import tls from "node:tls";
import { UPSTREAM_USER_AGENT } from "./config.ts";

const REDIRECT_LIMIT = 5;
const HEADER_TIMEOUT = 8000;

export interface Upstream {
  status: number;
  /** Response headers, keys lowercased. */
  headers: Map<string, string>;
  /** Live socket, positioned immediately after the header block. */
  socket: net.Socket;
  /** Body bytes already buffered while reading the header block. */
  leftover: Buffer<ArrayBufferLike>;
  /** True when no body is expected (empty/`HEAD`-like response). */
  fin: boolean;
  /** True when the body is `Transfer-Encoding: chunked` and must be de-framed. */
  chunked: boolean;
}

interface Target {
  scheme: "http" | "https";
  host: string;
  port: number;
  path: string; // path + query
}

function parseUrl(url: string): Target | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const scheme = u.protocol === "https:" ? "https" : u.protocol === "http:" ? "http" : null;
  if (scheme === null) return null;
  const port = u.port ? Number(u.port) : scheme === "https" ? 443 : 80;
  return { scheme, host: u.hostname, port, path: (u.pathname || "/") + u.search };
}

/**
 * Open an upstream GET, following redirects, and resolve once the response
 * headers are in. The returned socket is live and paused-free — the caller
 * either streams it ({@link streamBody}) or walks it for ICY metadata.
 */
export function open(
  url: string,
  reqHeaders: Record<string, string>,
  headerTimeout = HEADER_TIMEOUT,
  hops = REDIRECT_LIMIT,
): Promise<Upstream> {
  return new Promise((resolve, reject) => {
    if (hops <= 0) return reject(new Error("too many redirects"));
    const target = parseUrl(url);
    if (target === null) return reject(new Error(`bad url: ${url}`));

    const socket =
      target.scheme === "https"
        ? tls.connect({
            host: target.host,
            port: target.port,
            servername: target.host,
            // Radio hosts routinely serve expired/self-signed certs; the payload
            // is public audio, so verification is disabled.
            rejectUnauthorized: false,
          })
        : net.connect({ host: target.host, port: target.port });

    let settled = false;
    let buf: Buffer<ArrayBufferLike> = Buffer.alloc(0);

    const timer = setTimeout(() => fail(new Error("header timeout")), headerTimeout);

    const cleanup = () => {
      clearTimeout(timer);
      socket.removeListener("data", onData);
      socket.removeListener("error", onErr);
      socket.removeListener("close", onClose);
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      socket.destroy();
      reject(err);
    };
    const onErr = (err: Error) => fail(err);
    const onClose = () => fail(new Error("closed before headers"));

    const onData = (chunk: Buffer) => {
      buf = buf.length === 0 ? chunk : Buffer.concat([buf, chunk]);
      const sep = buf.indexOf("\r\n\r\n");
      if (sep === -1) {
        // Guard against a header block that never terminates.
        if (buf.length > 64 * 1024) fail(new Error("headers too large"));
        return;
      }
      if (settled) return;
      settled = true;
      cleanup();

      const head = buf.subarray(0, sep).toString("latin1");
      const leftover = buf.subarray(sep + 4);
      const parsed = parseHead(head);
      if (parsed === null) return void fail(new Error("bad status line"));
      const { status, headers } = parsed;

      // Follow redirects (3xx + Location), bounded by REDIRECT_LIMIT.
      if (status >= 300 && status < 400) {
        const loc = headers.get("location");
        if (loc !== undefined) {
          socket.destroy();
          const next = resolveLocation(url, loc);
          return void open(next, reqHeaders, headerTimeout, hops - 1).then(resolve, reject);
        }
      }

      const fin = isBodiless(status, headers);
      const chunked = (headers.get("transfer-encoding") ?? "")
        .toLowerCase()
        .includes("chunked");
      if (fin) socket.destroy();
      resolve({ status, headers, socket, leftover, fin, chunked });
    };

    socket.on("data", onData);
    socket.on("error", onErr);
    socket.on("close", onClose);

    const connectEvent = target.scheme === "https" ? "secureConnect" : "connect";
    socket.once(connectEvent, () => {
      const lines = [
        `GET ${target.path} HTTP/1.1`,
        `Host: ${hostHeader(target)}`,
        `User-Agent: ${UPSTREAM_USER_AGENT}`,
        "Accept: */*",
      ];
      for (const [k, v] of Object.entries(reqHeaders)) lines.push(`${k}: ${v}`);
      // `close` keeps a well-behaved server from holding the socket in
      // keep-alive after a finite body; live streams close on their own.
      lines.push("Connection: close", "", "");
      socket.write(lines.join("\r\n"));
    });
  });
}

/**
 * Wrap a live upstream socket as a Web `ReadableStream` for `Response`, applying
 * socket-level backpressure and tearing the upstream down when the client
 * disconnects (`cancel` → `socket.destroy`). When the upstream is
 * `Transfer-Encoding: chunked` the framing is stripped so only the payload
 * bytes reach the client — otherwise the hex chunk-size lines would land in the
 * audio decoder as garbage and stutter playback.
 */
export function streamBody(up: Upstream): ReadableStream<Uint8Array> {
  const { socket, leftover } = up;
  const decoder = up.chunked ? new ChunkedDecoder() : null;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (raw: Buffer) => {
        if (decoder === null) {
          controller.enqueue(raw);
          return;
        }
        for (const payload of decoder.push(raw)) controller.enqueue(payload);
        if (decoder.done) safeClose(controller);
      };
      if (leftover.length > 0) emit(leftover);
      socket.on("data", (chunk: Buffer) => {
        emit(chunk);
        // Pause the socket while the client's queue is full.
        if (controller.desiredSize !== null && controller.desiredSize <= 0) socket.pause();
      });
      socket.on("end", () => safeClose(controller));
      socket.on("close", () => safeClose(controller));
      socket.on("error", () => {
        try {
          controller.error(new Error("upstream error"));
        } catch {
          // Already closed.
        }
      });
    },
    pull() {
      socket.resume();
    },
    cancel() {
      // Client went away — stop the upstream instead of streaming into a void.
      socket.destroy();
    },
  });
}

/**
 * Incremental `Transfer-Encoding: chunked` decoder. Feed it raw socket bytes;
 * it returns the payload bytes of any complete chunk data it can extract,
 * buffering partial framing across calls. `done` flips true at the terminating
 * `0\r\n` chunk. Trailers (and any bytes after them) are ignored.
 */
export class ChunkedDecoder {
  private buf: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private state: "size" | "data" | "crlf" = "size";
  private remaining = 0;
  done = false;

  push(data: Buffer): Buffer[] {
    this.buf = this.buf.length === 0 ? data : Buffer.concat([this.buf, data]);
    const out: Buffer[] = [];
    while (!this.done) {
      if (this.state === "size") {
        const nl = this.buf.indexOf("\r\n");
        if (nl === -1) break; // size line not fully arrived yet
        const line = this.buf.subarray(0, nl).toString("latin1");
        // Strip any chunk extensions (`;name=value`) before the hex size.
        const size = Number.parseInt(line.split(";")[0].trim(), 16);
        this.buf = this.buf.subarray(nl + 2);
        if (!Number.isFinite(size) || size < 0) {
          this.done = true; // malformed framing — stop cleanly
          break;
        }
        if (size === 0) {
          this.done = true; // terminating chunk
          break;
        }
        this.remaining = size;
        this.state = "data";
      } else if (this.state === "data") {
        if (this.buf.length === 0) break;
        const take = Math.min(this.remaining, this.buf.length);
        out.push(this.buf.subarray(0, take));
        this.buf = this.buf.subarray(take);
        this.remaining -= take;
        if (this.remaining === 0) this.state = "crlf";
      } else {
        // Skip the CRLF that terminates a chunk's data.
        if (this.buf.length < 2) break;
        this.buf = this.buf.subarray(2);
        this.state = "size";
      }
    }
    return out;
  }
}

function safeClose(controller: ReadableStreamDefaultController<Uint8Array>): void {
  try {
    controller.close();
  } catch {
    // Already closed/errored.
  }
}

// ---- header parsing --------------------------------------------------------

function parseHead(head: string): { status: number; headers: Map<string, string> } | null {
  const lines = head.split("\r\n");
  const statusLine = lines.shift();
  if (statusLine === undefined) return null;
  // Accept both `HTTP/1.x NNN ...` and SHOUTcast's `ICY NNN ...`.
  const m = statusLine.match(/^(?:HTTP\/\d(?:\.\d)?|ICY)\s+(\d{3})/i);
  if (m === null) return null;
  const status = Number(m[1]);
  const headers = new Map<string, string>();
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    // First value wins.
    if (!headers.has(name)) headers.set(name, value);
  }
  return { status, headers };
}

function isBodiless(status: number, headers: Map<string, string>): boolean {
  if (status === 204 || status === 304) return true;
  return headers.get("content-length") === "0";
}

function hostHeader(t: Target): string {
  const isDefault = (t.scheme === "https" && t.port === 443) || (t.scheme === "http" && t.port === 80);
  return isDefault ? t.host : `${t.host}:${t.port}`;
}

function resolveLocation(base: string, loc: string): string {
  try {
    return new URL(loc, base).toString();
  } catch {
    return loc;
  }
}
