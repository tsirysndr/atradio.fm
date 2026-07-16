import { Router, type Request, type Response } from "express";
import type { LiveEvent } from "@atradio/lexicons";
import { subscribeLive } from "./bus";

export const liveRouter = Router();

/**
 * GET /live/:stationId — Server-Sent Events stream of live comments + emoji
 * reactions for one station. The Jetstream consumer publishes events onto the
 * bus; each connected client gets them pushed here in ~real time.
 */
liveRouter.get("/:stationId", (req: Request, res: Response) => {
  const stationId = req.params.stationId;
  if (!stationId) {
    res.status(400).json({ error: "InvalidRequest", message: "station required" });
    return;
  }

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Disable proxy buffering (nginx) so events flush immediately.
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.write(": connected\n\n");

  const send = (event: LiveEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  const unsubscribe = subscribeLive(stationId, send);

  // Comment/heartbeat keeps intermediaries from closing an idle connection.
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});
