import { consola } from "consola";
import { env } from "../env";
import { createApp } from "../app";

const app = createApp();
app.listen(env.PORT, () => {
  consola.success(`[api] listening on :${env.PORT}`);
});
