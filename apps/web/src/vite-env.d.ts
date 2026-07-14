/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TUNEIN_PROXY?: string;
  readonly VITE_ICY_PROXY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
