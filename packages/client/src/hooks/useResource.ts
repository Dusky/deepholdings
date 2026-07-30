import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError } from '../api/client';

export interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

/**
 * Fetch-on-mount with optional polling, for the screens that own their data
 * (ledger, bulletin, tavern). The main snapshot lives in ServerProvider; this
 * is for everything a screen only needs while it is on.
 */
export function useResource<T>(load: () => Promise<T>, pollMs?: number): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loader = useRef(load);
  const alive = useRef(true);

  useEffect(() => {
    loader.current = load;
  }, [load]);

  const reload = useCallback(async () => {
    try {
      const next = await loader.current();
      if (!alive.current) return;
      setData(next);
      setError(null);
    } catch (cause) {
      if (!alive.current) return;
      setError(cause instanceof ApiRequestError ? cause.message : 'unexpected fault');
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void reload();
    const timer = pollMs ? setInterval(() => void reload(), pollMs) : null;
    return () => {
      alive.current = false;
      if (timer) clearInterval(timer);
    };
  }, [reload, pollMs]);

  return { data, error, loading, reload };
}
