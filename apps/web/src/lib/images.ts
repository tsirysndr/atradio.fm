import { APPVIEW_URL } from "@/lib/appview";

/**
 * Route an `http://` image through the https API proxy so it isn't blocked as
 * mixed content on an https page. `https://` and `data:` URLs (and any URL on an
 * http page, e.g. dev) are returned unchanged.
 */
export function proxiedImageUrl(url: string): string;
export function proxiedImageUrl(url: string | undefined): string | undefined;
export function proxiedImageUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const isHttp = /^http:\/\//i.test(url);
  const pageHttps =
    typeof window !== "undefined" && window.location.protocol === "https:";
  if (!isHttp || !pageHttps) return url;
  return `${APPVIEW_URL}/api/image?url=${encodeURIComponent(url)}`;
}
