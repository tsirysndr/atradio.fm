/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APPVIEW_URL?: string;
  /** Base origin of the dedicated media proxy (apps/media-proxy). Serves
   *  /api/stream, /api/tunein, /api/image, /api/icy. Falls back to
   *  VITE_APPVIEW_URL when unset. */
  readonly VITE_MEDIA_PROXY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
