import express, { type Express } from "express";
import cors from "cors";
import { xrpcRouter } from "./xrpc";
import { proxyRouter } from "./proxy";
import { liveRouter } from "./live";

/** Build the Express app (XRPC read API + media proxies). Open CORS for all. */
export function createApp(): Express {
  const app = express();

  app.use(cors({ origin: "*" }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "atradio-api" });
  });

  // XRPC query endpoints: /xrpc/fm.atradio.*
  app.use("/xrpc", xrpcRouter);

  // Real-time per-station comment + reaction stream (SSE): /live/:stationId
  app.use("/live", liveRouter);

  // Media proxies: /api/tunein/*, /api/icy
  app.use("/api", proxyRouter);

  return app;
}
