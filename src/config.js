// Only public frontend settings are exposed by Vite. Never add server secrets here.
const runtime = typeof window === 'undefined' ? {} : window.__BURHANTV_CONFIG__ || {};
export const companionUrl = String(runtime.companionUrl || import.meta.env?.VITE_COMPANION_URL || '').trim().replace(/\/+$/, '');
export const backendUrl = String(runtime.backendUrl || import.meta.env?.VITE_BACKEND_URL || '').trim().replace(/\/+$/, '');
export const tvBootstrap = runtime;
