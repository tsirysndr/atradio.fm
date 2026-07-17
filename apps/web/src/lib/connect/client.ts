import { consola } from "consola";
import { APPVIEW_URL } from "@/lib/appview";
import {
  CONNECT_LXM,
  type Command,
  type DeviceInfo,
  type PlaybackState,
  type Platform,
  type ServerMsg,
} from "./protocol";

const DEFAULT_SERVICE_DID = "did:web:api.atradio.fm";

export interface ConnectHandlers {
  onStatus?: (status: "connecting" | "online" | "offline") => void;
  onWelcome?: (did: string, deviceId: string) => void;
  onDevices?: (devices: DeviceInfo[]) => void;
  onCommand?: (from: string, cmd: Command) => void;
  onPresence?: (anyPlaying: boolean, cleanup: boolean) => void;
}

export interface ConnectOptions {
  device: { id: string; name: string; platform: Platform };
  /** Mint a fresh service-auth JWT bound to `aud` + `CONNECT_LXM`. */
  mintToken: (aud: string, lxm: string) => Promise<string>;
  /** Snapshot of this device's current playback, sent on (re)connect. */
  getState: () => PlaybackState;
  handlers: ConnectHandlers;
}

/**
 * A resilient WebSocket client for the Connect hub. Mints a service-auth token,
 * connects, identifies this device, and relays roster / command / presence
 * events back to the caller. Auto-reconnects with backoff.
 */
export class ConnectClient {
  private ws: WebSocket | null = null;
  private closed = false;
  private backoff = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private serviceDid = DEFAULT_SERVICE_DID;

  constructor(private readonly opts: ConnectOptions) {}

  async start(): Promise<void> {
    this.closed = false;
    // Discover the AppView's Connect DID (the token audience); fall back to the
    // production default if /health is unreachable.
    try {
      const res = await fetch(`${APPVIEW_URL}/health`);
      const data = (await res.json()) as { connectDid?: string };
      if (data.connectDid) this.serviceDid = data.connectDid;
    } catch {
      /* keep default */
    }
    this.connect();
  }

  private connect(): void {
    if (this.closed) return;
    this.opts.handlers.onStatus?.("connecting");
    const url = `${APPVIEW_URL.replace(/^http/, "ws")}/connect`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      consola.warn("[connect] socket construct failed", err);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = async () => {
      try {
        const token = await this.opts.mintToken(this.serviceDid, CONNECT_LXM);
        if (this.ws !== ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(
          JSON.stringify({
            t: "hello",
            token,
            device: {
              id: this.opts.device.id,
              name: this.opts.device.name,
              platform: this.opts.device.platform,
              state: this.opts.getState(),
            },
          }),
        );
      } catch (err) {
        consola.warn("[connect] token mint failed", err);
        ws.close();
      }
    };

    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data as string) as ServerMsg;
      } catch {
        return;
      }
      switch (msg.t) {
        case "welcome":
          this.backoff = 1000;
          this.opts.handlers.onStatus?.("online");
          this.opts.handlers.onWelcome?.(msg.did, msg.deviceId);
          break;
        case "devices":
          this.opts.handlers.onDevices?.(msg.devices);
          break;
        case "command":
          this.opts.handlers.onCommand?.(msg.from, msg.cmd);
          break;
        case "presence":
          this.opts.handlers.onPresence?.(msg.anyPlaying, !!msg.cleanup);
          break;
        case "error":
          consola.warn("[connect] hub error", msg.code, msg.message);
          break;
      }
    };

    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      this.opts.handlers.onStatus?.("offline");
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      /* onclose does the reconnect */
    };
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, 15000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /** Broadcast this device's current playback state to peers. */
  sendState(state: PlaybackState): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ t: "state", state }));
    }
  }

  /** Send a control command to a peer device. */
  command(target: string, cmd: Command): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ t: "command", target, cmd }));
    }
  }

  stop(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ t: "bye" }));
    }
    this.ws?.close();
    this.ws = null;
  }
}

/** Module-level handle so atoms/components can send commands without prop drilling. */
let current: ConnectClient | null = null;
export function setConnectClient(c: ConnectClient | null): void {
  current = c;
}
export function getConnectClient(): ConnectClient | null {
  return current;
}
