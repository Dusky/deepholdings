import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * useState mirrored into localStorage. Stored values are merged over the
 * defaults so adding a new setting later doesn't break existing clients.
 * In production these belong on the account, not the device.
 */
export function usePersistentState<T extends object>(
  key: string,
  makeDefault: () => T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const fallback = makeDefault();
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return fallback;
      return { ...fallback, ...(parsed as Partial<T>) };
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Private-mode or quota failures are not worth breaking the UI over.
    }
  }, [key, value]);

  const set = useCallback<Dispatch<SetStateAction<T>>>((next) => setValue(next), []);

  return [value, set];
}
