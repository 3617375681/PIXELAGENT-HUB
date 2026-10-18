/**
 * The visitor's own DeepSeek key for PLAY LIVE. Kept in sessionStorage (this tab only) unless the
 * visitor asks to remember it on this device. Storage can be unavailable; then it lives in memory.
 */
const KEY = 'pixelagent:live-key';
const MODEL = 'pixelagent:live-model';
let memory: { key: string; model: string } | null = null;

const read = (storage: () => Storage, name: string) => { try { return storage().getItem(name) || ''; } catch { return ''; } };
const write = (storage: () => Storage, name: string, value: string | null) => {
  try { if (value === null) storage().removeItem(name); else storage().setItem(name, value); } catch { /* memory fallback below */ }
};

export function liveCredentials(): { key: string; model: string } | null {
  const key = memory?.key || read(() => sessionStorage, KEY) || read(() => localStorage, KEY);
  if (!key) return null;
  return { key, model: memory?.model || read(() => sessionStorage, MODEL) || read(() => localStorage, MODEL) || 'deepseek-chat' };
}

export function saveLiveCredentials(key: string, model: string, remember: boolean) {
  memory = { key, model };
  write(() => sessionStorage, KEY, key); write(() => sessionStorage, MODEL, model);
  write(() => localStorage, KEY, remember ? key : null); write(() => localStorage, MODEL, remember ? model : null);
}

export function forgetLiveCredentials() {
  memory = null;
  for (const storage of [() => sessionStorage, () => localStorage]) { write(storage, KEY, null); write(storage, MODEL, null); }
}
