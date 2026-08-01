import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import type { StandingOrders, StateResponse, UnlockId } from '@deepholdings/shared';
import { api, ApiRequestError } from '../api/client';
import { useInterval } from '../hooks/useInterval';
import { syncNotifications } from '../native/notifications';
import { useSettings } from './settingsContext';
import { ServerContext, type LinkStatus, type ServerState } from './serverContext';

/** Background refresh cadence. The server resolves one tick per minute. */
const POLL_MS = 20_000;

export function ServerProvider({ children }: { children: ReactNode }) {
  const { notifications } = useSettings();
  const [state, setState] = useState<StateResponse | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [link, setLink] = useState<LinkStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  // Read through a ref so changing preferences does not rebuild `refresh`
  // and restart the poll.
  const notificationsRef = useRef(notifications);
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const refresh = useCallback(async () => {
    // One refresh at a time: a slow request must not queue up behind a poll.
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await api.getState();
      setState(next);
      // Re-derived from every snapshot: cheap, and it keeps the schedule
      // honest when orders change or a permit clears early. No-ops off-device.
      void syncNotifications(next, notificationsRef.current);
      setReceivedAt(Date.now());
      setLink('online');
      setError(null);
    } catch (cause) {
      console.error('refresh failed', cause);
      const message =
        cause instanceof ApiRequestError
          ? cause.message
          : cause instanceof Error
            ? cause.message || cause.constructor.name
            : `unexpected: ${String(cause)}`;
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
  //
  // Three signals, because no one of them is reliable everywhere. `focus` and
  // `visibilitychange` cover the browser. On Android the WebView is not
  // reliably told it became visible when the app returns from the background —
  // and worse, `useInterval`'s timer does not run at all while the device is
  // asleep, so a phone that slept through eight hours of ticks wakes with a
  // snapshot eight hours old and no scheduled poll to correct it. Capacitor's
  // `appStateChange` is the signal that actually fires there.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    let native: Promise<PluginListenerHandle> | null = null;
    if (Capacitor.isNativePlatform()) {
      native = App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void refresh();
      });
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      void native?.then((listener) => listener.remove());
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
