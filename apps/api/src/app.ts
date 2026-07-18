import express, { type Express } from "express";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { env } from "./env";
import { xrpcRouter } from "./xrpc";
import { proxyRouter } from "./proxy";
import { liveRouter } from "./live";

/** Per-IP rate limit for the read API. Fixed window, in-memory (per node —
 *  behind a load balancer the effective limit is replicas x limit). Configurable
 *  via XRPC_RATE_LIMIT / XRPC_RATE_WINDOW_MS. */
const xrpcLimiter = rateLimit({
  windowMs: Number(process.env.XRPC_RATE_WINDOW_MS) || 60_000,
  limit: Number(process.env.XRPC_RATE_LIMIT) || 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "TooManyRequests" },
});

/** Build the Express app (XRPC read API + Connect). Open CORS for all. */
export function createApp(): Express {
  const app = express();

  // Caddy sits in front, so trust one proxy hop for the real client IP
  // (req.ip / X-Forwarded-For), which the rate limiter keys on.
  app.set("trust proxy", 1);
  app.use(cors({ origin: "*" }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "atradio-api",
      connectDid: env.CONNECT_SERVICE_DID,
      connectAud: env.CONNECT_SERVICE_AUD,
    });
  });

  // did:web document for the Connect service DID, so the `aud` clients bind
  // their service-auth tokens to is a resolvable identifier.
  app.get("/.well-known/did.json", (_req, res) => {
    res.json({
      "@context": ["https://www.w3.org/ns/did/v1"],
      id: env.CONNECT_SERVICE_DID,
      service: [
        {
          id: "#atradio_appview",
          type: "AtradioAppView",
          serviceEndpoint: "https://api.atradio.fm",
        },
      ],
    });
  });

  // XRPC query endpoints: /xrpc/fm.atradio.* (rate-limited per IP)
  app.use("/xrpc", xrpcLimiter, xrpcRouter);

  // Real-time per-station comment + reaction stream (SSE): /live/:stationId
  app.use("/live", liveRouter);

  // The media proxies moved to apps/media-proxy; redirect any lingering
  // /api/* requests (e.g. stale favorite stream URLs) to the new host.
  app.use("/api", proxyRouter);

  return app;
}
