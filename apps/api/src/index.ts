import { consola } from "consola";
import { env } from "./env";
import { createApp } from "./app";
import { startJetstream } from "./jetstream/consumer";

/** Combined entrypoint: Express server + Jetstream consumer in one process. */
const app = createApp();
app.listen(env.PORT, () => {
  consola.success(`[api] listening on :${env.PORT}`);
});

startJetstream().catch((err) => {
  consola.error("[jetstream] failed to start", err);
});
