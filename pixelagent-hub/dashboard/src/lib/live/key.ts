/**
 * The visitor's own model key for PLAY LIVE. Kept in sessionStorage (this tab only) unless the
 * visitor asks to remember it on this device. Storage can be unavailable; then it lives in memory.
 */
export type LiveCredentials = { provider: string; key: string; model: string };
const KEY = 'pixelagent:live-key';
const MODEL = 'pixelagent:live-model';
const PROVIDER = 'pixelagent:live-provider';
let memory: LiveCredentials | null = null;

const read = (storage: () => Storage, name: string) => { try { return storage().getItem(name) || ''; } catch { return ''; } };
const write = (storage: () => Storage, name: string, value: string | null) => {
  try { if (value === null) storage().removeItem(name); else storage().setItem(name, value); } catch { /* memory fallback */ }
};
const fromStorage = (storage: () => Storage): LiveCredentials | null => {
  const key = read(storage, KEY);
  // Keys saved before providers existed were DeepSeek keys.
  return key ? { key, provider: read(storage, PROVIDER) || 'deepseek', model: read(storage, MODEL) || 'deepseek-chat' } : null;
};

export function liveCredentials(): LiveCredentials | null {
  return memory || fromStorage(() => sessionStorage) || fromStorage(() => localStorage);
}

export function saveLiveCredentials(credentials: LiveCredentials, remember: boolean) {
  memory = credentials;
  for (const [storage, keep] of [[() => sessionStorage, true], [() => localStorage, remember]] as const) {
    write(storage, KEY, keep ? credentials.key : null);
    write(storage, MODEL, keep ? credentials.model : null);
    write(storage, PROVIDER, keep ? credentials.provider : null);
  }
}

export function forgetLiveCredentials() {
  memory = null;
  for (const storage of [() => sessionStorage, () => localStorage]) for (const name of [KEY, MODEL, PROVIDER]) write(storage, name, null);
}
