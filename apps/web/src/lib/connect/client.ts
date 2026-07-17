import { consola } from "consola";
import { APPVIEW_URL } from "@/lib/appview";
import {
  CONNECT_LXM,
  CONNECT_SERVICE_AUD,
  type Command,
  type DeviceInfo,
  type PlaybackState,
  type Platform,
  type ServerMsg,
} from "./protocol";

export interface ConnectHandlers {
  onStatus?: (status: "connecting" | "online" | "offline") => void;
  onWelcome?: (did: string, deviceId: string) => void;
  onDevices?: (devices: DeviceInfo[]) => void;
  onCommand?: (from: string, cmd: Command) => void;
  onPresence?: (anyPlaying: boolean, cleanup: boolean) => void;
  /**
   * The hub rejected our identity, or we repeatedly failed to mint a
   * service-auth token — i.e. the OAuth session is stale/expired. The user must
   * re-authenticate; retrying won't help. Fired at most once per client.
   */
  onAuthError?: () => void;
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
  /** Consecutive connect attempts that never reached `welcome`. */
  private authFailures = 0;
  /** Guards `onAuthError` so we prompt for re-login only once. */
  private authErrorNotified = false;

  /** How many failed handshakes before we treat it as a dead session. */
  private static readonly AUTH_FAILURE_THRESHOLD = 2;

  constructor(private readonly opts: ConnectOptions) {}

  async start(): Promise<void> {
    this.closed = false;
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
        const token = await this.opts.mintToken(CONNECT_SERVICE_AUD, CONNECT_LXM);
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
        this.noteAuthFailure();
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
          this.authFailures = 0;
          this.authErrorNotified = false;
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
          // The hub verified our token and rejected it: the session is bad and
          // reconnecting with the same one is futile. Stop and prompt re-login.
          if (msg.code === "AuthFailed") {
            this.notifyAuthError();
            this.closed = true;
            this.ws?.close();
          }
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

  /**
   * A handshake never reached `welcome` (token mint threw). After a couple of
   * these in a row, surface a re-login prompt — but keep retrying with backoff
   * in case it was a transient blip that self-heals.
   */
  private noteAuthFailure(): void {
    this.authFailures += 1;
    if (this.authFailures >= ConnectClient.AUTH_FAILURE_THRESHOLD) {
      this.notifyAuthError();
    }
  }

  /** Fire `onAuthError` at most once until the next successful `welcome`. */
  private notifyAuthError(): void {
    if (this.authErrorNotified) return;
    this.authErrorNotified = true;
    this.opts.handlers.onStatus?.("offline");
    this.opts.handlers.onAuthError?.();
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
