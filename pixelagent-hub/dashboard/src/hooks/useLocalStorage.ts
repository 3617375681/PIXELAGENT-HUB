import { useCallback, useEffect, useState } from 'react';

/**
 * Persist a piece of state into `localStorage` under a stable key.
 *
 * - Synchronously hydrates from storage on first render (no flash of default).
 * - Tolerates SSR / disabled storage (try/catch around all reads & writes).
 * - Mirrors `useState`'s setter API, including the functional form.
 * - Listens for `storage` events so two tabs stay in sync.
 */
export function useLocalStorage<T>(
  key: string,
  initial: T | (() => T),
): [T, (value: T | ((prev: T) => T)) => void] {
  const readInitial = useCallback((): T => {
    if (typeof window === 'undefined') {
      return typeof initial === 'function' ? (initial as () => T)() : initial;
    }
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) {
        return typeof initial === 'function' ? (initial as () => T)() : initial;
      }
      return JSON.parse(raw) as T;
    } catch {
      return typeof initial === 'function' ? (initial as () => T)() : initial;
    }
  }, [key, initial]);

  const [value, setValue] = useState<T>(readInitial);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // Storage may be unavailable (private mode, quota). Ignore.
        }
        return resolved;
      });
    },
    [key],
  );

  // Cross-tab sync
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: StorageEvent) => {
      if (e.key !== key || e.newValue === null) return;
      try {
        setValue(JSON.parse(e.newValue) as T);
      } catch {
        // Ignore unparseable values from other tabs.
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [key]);

  return [value, set];
}
