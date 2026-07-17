import type { Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { Redis } from "ioredis";
import { consola } from "consola";
import { env } from "../env";
import { verifyConnectToken } from "./auth";
import type {
  ClientMsg,
  Command,
  DeviceInfo,
  PlaybackState,
  Platform,
  ServerMsg,
} from "./protocol";

/**
 * atradio Connect hub — a WebSocket server that groups every logged-in client
 * by its account DID and routes remote-control commands between the devices on
 * that account (Spotify-Connect style).
 *
 * The in-process registry is authoritative for connections on this instance.
 * When Redis is configured the hub also replicates presence and relays commands
 * across instances, so a horizontally-scaled deployment still lets devices on
 * different processes see and control each other. With no Redis (the default
 * single-process deployment) everything runs locally.
 */

const REDIS_CHANNEL = "atradio:connect";
/** Kill a connection that never sends a valid `hello`. */
const HELLO_TIMEOUT_MS = 10_000;
/** WS ping + remote-presence heartbeat cadence. */
const HEARTBEAT_MS = 30_000;
/** Remote devices unheard-of for this long are dropped. */
const REMOTE_TTL_MS = HEARTBEAT_MS * 3;

/** A device connected to *this* instance. */
interface LocalConn {
  ws: WebSocket;
  did: string;
  deviceId: string;
  name: string;
  platform: Platform;
  state: PlaybackState;
  connectedAt: number;
  alive: boolean;
}

/** A device connected to another instance, learned via Redis. */
interface RemoteDevice {
  did: string;
  deviceId: string;
  name: string;
  platform: Platform;
  state: PlaybackState;
  connectedAt: number;
  origin: string;
  lastSeen: number;
}

type RelayMsg =
  | { type: "join" | "update"; instance: string; device: WireDevice }
  | { type: "leave"; instance: string; did: string; deviceId: string }
  | {
      type: "command";
      instance: string;
      did: string;
      target: string;
      from: string;
      cmd: Command;
    };

interface WireDevice {
  did: string;
  deviceId: string;
  name: string;
  platform: Platform;
  state: PlaybackState;
  connectedAt: number;
}

/** did → deviceId → conn */
const local = new Map<string, Map<string, LocalConn>>();
/** did → deviceId → remote device */
const remote = new Map<string, Map<string, RemoteDevice>>();
/** did → last computed anyPlaying, to detect the true→false transition. */
const lastAnyPlaying = new Map<string, boolean>();

/** A per-process id, so we ignore the echoes of our own Redis publishes. */
const INSTANCE_ID = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

/** Token verifier — swappable in tests via `attachConnectHub`'s options. */
let verifyToken: (token: string) => Promise<string> = verifyConnectToken;

let pub: Redis | null = null;

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function localMap(did: string): Map<string, LocalConn> {
  let m = local.get(did);
  if (!m) {
    m = new Map();
    local.set(did, m);
  }
  return m;
}

function remoteMap(did: string): Map<string, RemoteDevice> {
  let m = remote.get(did);
  if (!m) {
    m = new Map();
    remote.set(did, m);
  }
  return m;
}

function toDeviceInfo(
  d: LocalConn | RemoteDevice,
  selfId: string,
): DeviceInfo {
  return {
    id: d.deviceId,
    name: d.name,
    platform: d.platform,
    self: d.deviceId === selfId,
    state: d.state,
  };
}

/** Merged roster for a DID (local wins over a stale remote copy). */
function roster(did: string): (LocalConn | RemoteDevice)[] {
  const byId = new Map<string, LocalConn | RemoteDevice>();
  for (const d of remoteMap(did).values()) byId.set(d.deviceId, d);
  for (const d of localMap(did).values()) byId.set(d.deviceId, d);
  return [...byId.values()].sort((a, b) => a.connectedAt - b.connectedAt);
}

function anyPlaying(did: string): boolean {
  return roster(did).some((d) => d.state.playing);
}

/** Push a fresh roster to every locally-connected device of this DID. */
function broadcastRoster(did: string): void {
  const all = roster(did);
  for (const conn of localMap(did).values()) {
    send(conn.ws, {
      t: "devices",
      devices: all.map((d) => toDeviceInfo(d, conn.deviceId)),
    });
  }
}

/**
 * The device responsible for cleaning up the durable `actor.status` record when
 * nobody is playing: deterministically the lowest deviceId across the account,
 * so exactly one instance acts. Returns its local conn, or null if that device
 * lives on another instance.
 */
function cleanupOwner(did: string): LocalConn | null {
  const all = roster(did);
  if (all.length === 0) return null;
  const owner = all.reduce((a, b) => (a.deviceId < b.deviceId ? a : b));
  return localMap(did).get(owner.deviceId) ?? null;
}

/**
 * Recompute presence for a DID and, on the true→false transition, ask the
 * cleanup owner to delete the account's `actor.status` record (only a client
 * can write to its own PDS).
 */
function reconcilePresence(did: string): void {
  const now = anyPlaying(did);
  const before = lastAnyPlaying.get(did) ?? false;
  lastAnyPlaying.set(did, now);
  if (before && !now) {
    const owner = cleanupOwner(did);
    if (owner) send(owner.ws, { t: "presence", anyPlaying: false, cleanup: true });
  }
  // Broadcast the summary (without cleanup) to everyone else so UIs update.
  for (const conn of localMap(did).values()) {
    send(conn.ws, { t: "presence", anyPlaying: now });
  }
}

function publish(msg: RelayMsg): void {
  if (pub) void pub.publish(REDIS_CHANNEL, JSON.stringify(msg)).catch(() => {});
}

function wire(conn: LocalConn): WireDevice {
  return {
    did: conn.did,
    deviceId: conn.deviceId,
    name: conn.name,
    platform: conn.platform,
    state: conn.state,
    connectedAt: conn.connectedAt,
  };
}

/** Deliver a command to a locally-connected target; returns whether it landed. */
function deliverCommand(
  did: string,
  target: string,
  from: string,
  cmd: Command,
): boolean {
  const conn = localMap(did).get(target);
  if (!conn) return false;
  send(conn.ws, { t: "command", from, cmd });
  return true;
}

// ---- inbound client message handling --------------------------------------

function handleState(conn: LocalConn, state: PlaybackState): void {
  conn.state = state;
  publish({ type: "update", instance: INSTANCE_ID, device: wire(conn) });
  broadcastRoster(conn.did);
  reconcilePresence(conn.did);
}

function handleCommand(
  conn: LocalConn,
  target: string,
  cmd: Command,
): void {
  if (target === conn.deviceId) return; // no self-commands
  if (deliverCommand(conn.did, target, conn.deviceId, cmd)) return;
  // Target lives elsewhere (or nowhere): relay across instances.
  publish({
    type: "command",
    instance: INSTANCE_ID,
    did: conn.did,
    target,
    from: conn.deviceId,
    cmd,
  });
}

function removeConn(conn: LocalConn): void {
  const m = local.get(conn.did);
  if (!m || m.get(conn.deviceId) !== conn) return;
  m.delete(conn.deviceId);
  if (m.size === 0) local.delete(conn.did);
  publish({
    type: "leave",
    instance: INSTANCE_ID,
    did: conn.did,
    deviceId: conn.deviceId,
  });
  broadcastRoster(conn.did);
  reconcilePresence(conn.did);
}

async function onHello(
  ws: WebSocket,
  raw: Extract<ClientMsg, { t: "hello" }>,
): Promise<LocalConn | null> {
  let did: string;
  try {
    did = await verifyToken(raw.token);
  } catch (err) {
    send(ws, {
      t: "error",
      code: "AuthFailed",
      message: err instanceof Error ? err.message : "invalid token",
    });
    ws.close(4001, "auth failed");
    return null;
  }

  const conn: LocalConn = {
    ws,
    did,
    deviceId: raw.device.id,
    name: raw.device.name || "Unknown device",
    platform: raw.device.platform,
    state: raw.device.state,
    connectedAt: Date.now(),
    alive: true,
  };

  // Replace any prior connection with the same deviceId (reconnect / dup tab).
  const m = localMap(did);
  const prior = m.get(conn.deviceId);
  if (prior && prior.ws !== ws) prior.ws.close(4002, "replaced");
  m.set(conn.deviceId, conn);

  const wasEmpty = roster(did).length === 1; // just us
  send(ws, { t: "welcome", did, deviceId: conn.deviceId });
  publish({ type: "join", instance: INSTANCE_ID, device: wire(conn) });
  broadcastRoster(did);

  const playing = anyPlaying(did);
  lastAnyPlaying.set(did, playing);
  send(ws, { t: "presence", anyPlaying: playing });
  // Fresh, lone session that isn't playing: clear a status record potentially
  // left dangling by a crashed previous session.
  if (wasEmpty && !conn.state.playing && !playing) {
    send(ws, { t: "presence", anyPlaying: false, cleanup: true });
  }
  return conn;
}

// ---- Redis relay (cross-instance) -----------------------------------------

function pruneRemote(did: string): void {
  const m = remote.get(did);
  if (!m) return;
  const cutoff = Date.now() - REMOTE_TTL_MS;
  let changed = false;
  for (const [id, d] of m) {
    if (d.lastSeen < cutoff) {
      m.delete(id);
      changed = true;
    }
  }
  if (m.size === 0) remote.delete(did);
  if (changed) {
    broadcastRoster(did);
    reconcilePresence(did);
  }
}

function onRelay(msg: RelayMsg): void {
  if (msg.instance === INSTANCE_ID) return; // our own echo
  if (msg.type === "command") {
    deliverCommand(msg.did, msg.target, msg.from, msg.cmd);
    return;
  }
  if (msg.type === "leave") {
    const m = remote.get(msg.did);
    if (m?.delete(msg.deviceId)) {
      broadcastRoster(msg.did);
      reconcilePresence(msg.did);
    }
    return;
  }
  // join | update
  const d = msg.device;
  remoteMap(d.did).set(d.deviceId, {
    ...d,
    origin: msg.instance,
    lastSeen: Date.now(),
  });
  broadcastRoster(d.did);
  reconcilePresence(d.did);
}

/** Re-announce our local devices so peers refresh their remote view + TTL. */
function heartbeatRemotePresence(): void {
  for (const m of local.values()) {
    for (const conn of m.values()) {
      publish({ type: "update", instance: INSTANCE_ID, device: wire(conn) });
    }
  }
  for (const did of remote.keys()) pruneRemote(did);
}

function setupRedis(): void {
  if (!env.REDIS_URL) return;
  pub = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    retryStrategy: (n) => Math.min(n * 500, 5000),
  });
  pub.on("error", (e) => consola.warn("[connect pub]", e.message));
  const sub = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    retryStrategy: (n) => Math.min(n * 500, 5000),
  });
  sub.on("error", (e) => consola.warn("[connect sub]", e.message));
  sub.on("ready", () => consola.success("[connect] redis relay ready"));
  void sub.subscribe(REDIS_CHANNEL).catch(() => {});
  sub.on("message", (_ch, payload) => {
    try {
      onRelay(JSON.parse(payload) as RelayMsg);
    } catch {
      /* ignore malformed relay */
    }
  });
}

// ---- server attach ---------------------------------------------------------

/** Options for {@link attachConnectHub}. */
export interface ConnectHubOptions {
  /** Override the service-auth token verifier (used by tests). */
  verifyToken?: (token: string) => Promise<string>;
}

/**
 * Attach the Connect hub to an HTTP server, handling `upgrade` requests for the
 * `/connect` path. Call once at boot with the same server Express listens on.
 */
export function attachConnectHub(
  server: Server,
  opts: ConnectHubOptions = {},
): void {
  if (opts.verifyToken) verifyToken = opts.verifyToken;
  setupRedis();
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket: Duplex, head) => {
    let pathname = "";
    try {
      pathname = new URL(req.url ?? "", "http://localhost").pathname;
    } catch {
      /* ignore */
    }
    if (pathname !== "/connect") return; // not ours; leave for others
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  });

  wss.on("connection", (ws: WebSocket) => {
    let conn: LocalConn | null = null;

    const helloTimer = setTimeout(() => {
      if (!conn) ws.close(4008, "hello timeout");
    }, HELLO_TIMEOUT_MS);

    ws.on("message", (data) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(data.toString()) as ClientMsg;
      } catch {
        return;
      }
      if (!conn) {
        if (msg.t !== "hello") return;
        void onHello(ws, msg).then((c) => {
          clearTimeout(helloTimer);
          conn = c;
        });
        return;
      }
      switch (msg.t) {
        case "state":
          handleState(conn, msg.state);
          break;
        case "command":
          handleCommand(conn, msg.target, msg.cmd);
          break;
        case "bye":
          ws.close(1000, "bye");
          break;
      }
    });

    ws.on("pong", () => {
      if (conn) conn.alive = true;
    });

    ws.on("close", () => {
      clearTimeout(helloTimer);
      if (conn) removeConn(conn);
    });

    ws.on("error", () => {
      /* close handler does the cleanup */
    });
  });

  // Liveness ping + remote-presence heartbeat.
  const timer = setInterval(() => {
    for (const m of local.values()) {
      for (const conn of m.values()) {
        if (!conn.alive) {
          conn.ws.terminate();
          continue;
        }
        conn.alive = false;
        conn.ws.ping();
      }
    }
    heartbeatRemotePresence();
  }, HEARTBEAT_MS);
  timer.unref?.();

  consola.success("[connect] hub attached at /connect");
}

/** Clear all in-memory registries. Test-only. */
export function _resetConnectState(): void {
  local.clear();
  remote.clear();
  lastAnyPlaying.clear();
}
