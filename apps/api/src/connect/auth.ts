import { IdResolver } from "@atproto/identity";
import { verifyJwt } from "@atproto/xrpc-server";
import { env } from "../env";
import { CONNECT_LXM } from "./protocol";

/**
 * Verifies an atproto **service-auth JWT** and returns the issuer DID.
 *
 * The token is minted by the client's PDS (`com.atproto.server.getServiceAuth`)
 * and signed with the account's signing key. We resolve that key from the
 * issuer's DID document and check the signature, the audience (must be this
 * AppView's DID), the expiry, and the method binding (`lxm`). This is the only
 * proof a WebSocket connection genuinely belongs to the DID it claims — without
 * it, anyone could watch or hijack another user's playback.
 */
const idResolver = new IdResolver();

async function getSigningKey(
  did: string,
  forceRefresh: boolean,
): Promise<string> {
  const data = await idResolver.did.resolveAtprotoData(did, forceRefresh);
  return data.signingKey;
}

/** Verify a service-auth JWT; returns the issuer DID or throws. */
export async function verifyConnectToken(token: string): Promise<string> {
  const payload = await verifyJwt(
    token,
    env.CONNECT_SERVICE_AUD,
    CONNECT_LXM,
    getSigningKey,
  );
  return payload.iss;
}
