import { createServer } from "node:http";
import { consola } from "consola";
import { env } from "../env";
import { createApp } from "../app";
import { attachConnectHub } from "../connect/hub";

const app = createApp();
const server = createServer(app);
attachConnectHub(server);
server.listen(env.PORT, () => {
  consola.success(`[api] listening on :${env.PORT}`);
});
