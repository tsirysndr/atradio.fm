import {
  LocalActorResolver,
  CompositeHandleResolver,
  WellKnownHandleResolver,
  DohJsonHandleResolver,
  CompositeDidDocumentResolver,
  PlcDidDocumentResolver,
  WebDidDocumentResolver,
} from "@atcute/identity-resolver";
import type { ActorIdentifier } from "@atcute/lexicons";

/** Shared handle→DID→PDS resolver used by OAuth config and public reads. */
export const actorResolver = new LocalActorResolver({
  handleResolver: new CompositeHandleResolver({
    strategy: "race",
    methods: {
      http: new WellKnownHandleResolver(),
      dns: new DohJsonHandleResolver({
        dohUrl: "https://mozilla.cloudflare-dns.com/dns-query",
      }),
    },
  }),
  didDocumentResolver: new CompositeDidDocumentResolver({
    methods: {
      plc: new PlcDidDocumentResolver(),
      web: new WebDidDocumentResolver(),
    },
  }),
});

/** Resolve a handle or DID into `{ did, handle, pds }`. */
export function resolveActor(actor: string) {
  return actorResolver.resolve(actor as ActorIdentifier);
}
