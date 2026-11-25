/// <reference types="vite/client" />

// vite.config.js -> define
declare const __APP_BUILD__: string;
declare const __APP_BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Dasturchi rejimi: mahalliy server manzili (masalan http://localhost:8080) */
  readonly VITE_HUB_URL?: string;
  readonly VITE_FAKE_SYNC_URL?: string;
}
