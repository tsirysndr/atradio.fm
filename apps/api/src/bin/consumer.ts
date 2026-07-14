import { consola } from "consola";
import { startJetstream } from "../jetstream/consumer";

startJetstream().catch((err) => {
  consola.error("[jetstream] failed to start", err);
  process.exit(1);
});
