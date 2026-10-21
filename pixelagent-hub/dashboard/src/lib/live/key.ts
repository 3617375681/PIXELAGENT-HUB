/**
 * The visitor's own model key for PLAY LIVE. Kept in sessionStorage (this tab only) unless the
 * visitor asks to remember it on this device. Storage can be unavailable; then it lives in memory.
 */
export type LiveCredentials = { provider: string; key: string; model: string; testerModel?: string; baseUrl?: string };
const KEY = 'pixelagent:live-key';
const MODEL = 'pixelagent:live-model';
const TESTER_MODEL = 'pixelagent:live-tester-model';
const PROVIDER = 'pixelagent:live-provider';
const BASE_URL = 'pixelagent:live-base-url';
let memory: LiveCredentials | null = null;

const read = (storage: () => Storage, name: string) => { try { return storage().getItem(name) || ''; } catch { return ''; } };
const write = (storage: () => Storage, name: string, value: string | null) => {
  try { if (value === null) storage().removeItem(name); else storage().setItem(name, value); } catch { /* memory fallback */ }
};
const fromStorage = (storage: () => Storage): LiveCredentials | null => {
  const key = read(storage, KEY);
  const provider = read(storage, PROVIDER);
  // Keys saved before providers existed were DeepSeek keys; a local server may need no key at all.
  if (!key && provider !== 'custom') return null;
  const baseUrl = read(storage, BASE_URL);
  const testerModel = read(storage, TESTER_MODEL);
  return { key, provider: provider || 'deepseek', model: read(storage, MODEL) || 'deepseek-chat', ...(baseUrl ? { baseUrl } : {}), ...(testerModel ? { testerModel } : {}) };
};

export function liveCredentials(): LiveCredentials | null {
  return memory || fromStorage(() => sessionStorage) || fromStorage(() => localStorage);
}

export function saveLiveCredentials(credentials: LiveCredentials, remember: boolean) {
  memory = credentials;
  for (const [storage, keep] of [[() => sessionStorage, true], [() => localStorage, remember]] as const) {
    write(storage, KEY, keep ? credentials.key : null);
    write(storage, MODEL, keep ? credentials.model : null);
    write(storage, TESTER_MODEL, keep && credentials.testerModel ? credentials.testerModel : null);
    write(storage, PROVIDER, keep ? credentials.provider : null);
    write(storage, BASE_URL, keep && credentials.baseUrl ? credentials.baseUrl : null);
  }
}

export function forgetLiveCredentials() {
  memory = null;
  for (const storage of [() => sessionStorage, () => localStorage]) for (const name of [KEY, MODEL, TESTER_MODEL, PROVIDER, BASE_URL]) write(storage, name, null);
}
