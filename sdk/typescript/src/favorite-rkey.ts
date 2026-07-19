/**
 * Deterministic record key for a favorite: the first 8 bytes (64 bits) of
 * `sha256(stationId)` as lowercase hex — a stable 16-char rkey.
 *
 * Byte-for-byte identical to the atradio Rust SDK (`favorite_rkey`) and the web
 * client, so a given station maps to the same favorite record everywhere:
 * favoriting it is idempotent (putRecord overwrites the one record) and can
 * never duplicate, even across devices.
 */
export async function favoriteRkey(stationId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(stationId),
  );
  const bytes = new Uint8Array(digest).subarray(0, 8);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
