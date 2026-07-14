/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TUNEIN_PROXY?: string;
  readonly VITE_ICY_PROXY?: string;
  readonly VITE_APPVIEW_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
