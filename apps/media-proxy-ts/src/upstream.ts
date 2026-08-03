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
      if (fin) socket.destroy();
      resolve({ status, headers, socket, leftover, fin });
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
 * disconnects (`cancel` → `socket.destroy`).
 */
export function streamBody(up: Upstream): ReadableStream<Uint8Array> {
  const { socket, leftover } = up;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (leftover.length > 0) controller.enqueue(leftover);
      socket.on("data", (chunk: Buffer) => {
        controller.enqueue(chunk);
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
