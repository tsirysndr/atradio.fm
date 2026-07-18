import { Router, type Request, type Response } from "express";

/**
 * The media proxies (`/api/stream`, `/api/tunein`, `/api/image`, `/api/icy`)
 * moved to their own service (apps/media-proxy). Some data — notably TuneIn
 * stream URLs baked into favorites saved by older builds — still points at
 * `api.atradio.fm/api/*`. Redirect those to the new host so stale links keep
 * working without a rebuild or data migration.
 */
export const proxyRouter = Router();

const MEDIA_PROXY_URL = (
  process.env.MEDIA_PROXY_URL ?? "https://media.atradio.fm"
).replace(/\/$/, "");

// Catch-all under the `/api` mount: preserve the full path + query.
proxyRouter.use((req: Request, res: Response) => {
  res.redirect(`${MEDIA_PROXY_URL}${req.originalUrl}`);
});
