import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { attachConnectHub, _resetConnectState } from "./hub";
import type { PlaybackState, ServerMsg } from "./protocol";

/**
 * End-to-end tests for the Connect hub over a real WebSocket server. The
 * service-auth verifier is stubbed to treat the token as the account DID, so
 * we exercise routing/roster/presence without real atproto crypto.
 */

let server: Server;
let url: string;

beforeAll(async () => {
  server = createServer();
  // Token === DID: lets tests group devices by choosing the token they send.
  // An empty token "fails verification" so we can test rejection.
  attachConnectHub(server, {
    verifyToken: async (token) => {
      if (!token) throw new Error("invalid token");
      return token;
    },
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  url = `ws://127.0.0.1:${port}/connect`;
});

afterAll(() => {
  server.close();
});

const open: TestClient[] = [];

afterEach(() => {
  for (const c of open.splice(0)) c.close();
  _resetConnectState();
});

const state = (over: Partial<PlaybackState> = {}): PlaybackState => ({
  playing: false,
  station: null,
  volume: 0.5,
  muted: false,
  ...over,
});

interface TestClient {
  send: (o: unknown) => void;
  next: () => Promise<ServerMsg>;
  until: (pred: (m: ServerMsg) => boolean) => Promise<ServerMsg>;
  close: () => void;
}

function makeClient(): Promise<TestClient> {
  const ws = new WebSocket(url);
  const inbox: ServerMsg[] = [];
  const waiters: ((m: ServerMsg) => void)[] = [];
  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString()) as ServerMsg;
    const w = waiters.shift();
    if (w) w(msg);
    else inbox.push(msg);
  });
  const next = () =>
    new Promise<ServerMsg>((resolve) => {
      const m = inbox.shift();
      if (m) resolve(m);
      else waiters.push(resolve);
    });
  const client: TestClient = {
    send: (o) => ws.send(JSON.stringify(o)),
    next,
    until: async (pred) => {
      for (;;) {
        const m = await withTimeout(next());
        if (pred(m)) return m;
      }
    },
    close: () => ws.close(),
  };
  open.push(client);
  return new Promise((resolve) => ws.on("open", () => resolve(client)));
}

function withTimeout<T>(p: Promise<T>, ms = 2000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout waiting for message")), ms),
    ),
  ]);
}

async function hello(
  did: string,
  id: string,
  st: PlaybackState = state(),
): Promise<TestClient> {
  const c = await makeClient();
  c.send({
    t: "hello",
    token: did,
    device: { id, name: id, platform: "web", state: st },
  });
  await c.until((m) => m.t === "welcome");
  return c;
}

describe("connect hub", () => {
  it("acknowledges a device and reports it in the roster", async () => {
    const a = await hello("did:test:alice", "A");
    const devices = await a.until((m) => m.t === "devices");
    if (devices.t !== "devices") throw new Error("unreachable");
    expect(devices.devices.map((d) => d.id)).toContain("A");
    expect(devices.devices.find((d) => d.id === "A")?.self).toBe(true);
  });

  it("shows both devices of the same account to each other", async () => {
    const a = await hello("did:test:alice", "A");
    await hello("did:test:alice", "B");
    const roster = await a.until(
      (m) => m.t === "devices" && m.devices.length === 2,
    );
    if (roster.t !== "devices") throw new Error("unreachable");
    expect(roster.devices.map((d) => d.id).sort()).toEqual(["A", "B"]);
  });

  it("routes a command from one device to the targeted peer", async () => {
    const a = await hello("did:test:alice", "A");
    const b = await hello("did:test:alice", "B");
    a.send({ t: "command", target: "B", cmd: { action: "play" } });
    const cmd = await b.until((m) => m.t === "command");
    if (cmd.t !== "command") throw new Error("unreachable");
    expect(cmd.cmd).toEqual({ action: "play" });
    expect(cmd.from).toBe("A");
  });

  it("broadcasts a peer's playback state to the roster", async () => {
    const a = await hello("did:test:alice", "A");
    const b = await hello("did:test:alice", "B");
    b.send({
      t: "state",
      state: state({
        playing: true,
        station: { id: "rb:1", name: "Synthwave FM", url: "http://x/s" },
      }),
    });
    const roster = await a.until(
      (m) =>
        m.t === "devices" &&
        !!m.devices.find((d) => d.id === "B")?.state.playing,
    );
    if (roster.t !== "devices") throw new Error("unreachable");
    expect(roster.devices.find((d) => d.id === "B")?.state.station?.name).toBe(
      "Synthwave FM",
    );
  });

  it("asks a device to clean up status when playback stops everywhere", async () => {
    const a = await hello("did:test:alice", "A", state({ playing: true }));
    // Stop playing → presence transitions true→false → cleanup request.
    a.send({ t: "state", state: state({ playing: false }) });
    const presence = await a.until((m) => m.t === "presence" && !!m.cleanup);
    expect(presence.t).toBe("presence");
  });

  it("isolates devices across different accounts", async () => {
    await hello("did:test:alice", "A");
    const bob = await hello("did:test:bob", "Z");
    const roster = await bob.until((m) => m.t === "devices");
    if (roster.t !== "devices") throw new Error("unreachable");
    expect(roster.devices.map((d) => d.id)).toEqual(["Z"]);
    expect(roster.devices.map((d) => d.id)).not.toContain("A");
  });

  it("rejects a device whose token fails verification", async () => {
    // The stub verifier throws on an empty token.
    const c = await makeClient();
    c.send({
      t: "hello",
      token: "",
      device: { id: "bad", name: "bad", platform: "web", state: state() },
    });
    const err = await c.until((m) => m.t === "error");
    if (err.t !== "error") throw new Error("unreachable");
    expect(err.code).toBe("AuthFailed");
  });
});
