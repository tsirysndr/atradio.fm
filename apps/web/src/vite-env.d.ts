/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TUNEIN_PROXY?: string;
  readonly VITE_ICY_PROXY?: string;
  readonly VITE_APPVIEW_URL?: string;
  /** Base origin of the dedicated media proxy (apps/media-proxy). Falls back to
   *  VITE_APPVIEW_URL when unset. */
  readonly VITE_MEDIA_PROXY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
