import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { StandingOrders, StateResponse, UnlockId } from '@deepholdings/shared';
import { api, ApiRequestError } from '../api/client';
import { useInterval } from '../hooks/useInterval';
import { ServerContext, type LinkStatus, type ServerState } from './serverContext';

/** Background refresh cadence. The server resolves one tick per minute. */
const POLL_MS = 20_000;

export function ServerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StateResponse | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [link, setLink] = useState<LinkStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    // One refresh at a time: a slow request must not queue up behind a poll.
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await api.getState();
      setState(next);
      setReceivedAt(Date.now());
      setLink('online');
      setError(null);
    } catch (cause) {
      const message =
        cause instanceof ApiRequestError ? cause.message : 'unexpected fault';
      setError(message);
      // A failed refresh on top of good data is degraded, not dead: the last
      // snapshot stays on screen rather than dumping the player back to boot.
      setLink((current) => (current === 'connecting' ? 'offline' : 'degraded'));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useInterval(() => void refresh(), POLL_MS);

  // Coming back to the app is the moment the journal is most out of date.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [refresh]);

  const fileOrders = useCallback(
    async (orders: StandingOrders) => {
      const response = await api.updateOrders(orders);
      await refresh();
      return response.filedAt;
    },
    [refresh],
  );

  const purchaseUnlock = useCallback(
    async (id: UnlockId) => {
      await api.purchaseUnlock(id);
      await refresh();
    },
    [refresh],
  );

  const claimPension = useCallback(async () => {
    await api.claimPension();
    await refresh();
  }, [refresh]);

  const value = useMemo<ServerState>(
    () => ({ state, receivedAt, link, error, refresh, fileOrders, purchaseUnlock, claimPension }),
    [state, receivedAt, link, error, refresh, fileOrders, purchaseUnlock, claimPension],
  );

  return <ServerContext.Provider value={value}>{children}</ServerContext.Provider>;
}
