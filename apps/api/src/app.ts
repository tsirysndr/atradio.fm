import express, { type Express } from "express";
import cors from "cors";
import { env } from "./env";
import { xrpcRouter } from "./xrpc";
import { proxyRouter } from "./proxy";
import { liveRouter } from "./live";

/** Build the Express app (XRPC read API + media proxies). Open CORS for all. */
export function createApp(): Express {
  const app = express();

  app.use(cors({ origin: "*" }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "atradio-api",
      connectDid: env.CONNECT_SERVICE_DID,
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

  // XRPC query endpoints: /xrpc/fm.atradio.*
  app.use("/xrpc", xrpcRouter);

  // Real-time per-station comment + reaction stream (SSE): /live/:stationId
  app.use("/live", liveRouter);

  // Media proxies: /api/tunein/*, /api/icy
  app.use("/api", proxyRouter);

  return app;
}
