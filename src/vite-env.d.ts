/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_MODE?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEV_PROXY_TARGET?: string;
  readonly VITE_REALTIME_MODE?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_MOCK_CONTROL_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  webkitAudioContext?: typeof AudioContext;
}
