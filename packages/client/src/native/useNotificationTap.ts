import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { HOME_SCREEN, useScreen } from '../state/screenContext';
import { useServer } from '../state/serverContext';
import type { NotificationTarget } from './notifications';
import type { ScreenId } from '../types';

/**
 * Tapping a notification opens the thing it was about.
 *
 * Three parts, and the middle one is the part that is easy to leave out:
 *
 *   1. Route to the screen named in the notification's `extra`.
 *   2. **Refresh first.** A notification is by definition about something that
 *      happened while the app was not looking, so the snapshot on screen is
 *      stale by exactly the amount that matters. Landing on the Terminal
 *      showing the permit still processing is worse than not deep-linking at
 *      all — it reads as the notification having lied.
 *   3. Respect clearance. A notification can outlive the state it was written
 *      in, and the Console already falls back to the Terminal for a screen the
 *      officer cannot open; doing the check here too keeps the intent visible
 *      rather than relying on a silent correction downstream.
 *
 * Cold start is the same path. Capacitor queues the action that launched the
 * app and delivers it once a listener exists, so no separate launch-intent
 * branch is needed — but the listener has to be registered unconditionally on
 * mount rather than behind a "once we have state" guard, or the queued event
 * fires into nothing.
 */
export function useNotificationTap(): void {
  const { goTo } = useScreen();
  const { state, refresh } = useServer();

  // Read clearance through a ref. It is a fresh array on every render, so
  // putting it in the dependency list would tear the listener down and build
  // it again several times a second — and a listener that is absent at the
  // moment Capacitor replays the launch action is a deep link that silently
  // does nothing on cold start, which is the case it exists for.
  const clearanceRef = useRef<readonly ScreenId[]>(state?.clearance ?? [HOME_SCREEN]);
  useEffect(() => {
    clearanceRef.current = state?.clearance ?? [HOME_SCREEN];
  }, [state]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handle = LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (action) => {
        const extra = action.notification.extra as Partial<NotificationTarget> | undefined;
        const wanted = extra?.screen;

        void (async () => {
          // Order matters: refresh, then navigate. Navigating first shows the
          // stale screen for as long as the request takes, which on a cold
          // start is the whole of the first impression. It also means the
          // clearance read below is the one that arrived with this refresh.
          await refresh();
          if (!wanted) return;
          goTo(clearanceRef.current.includes(wanted) ? wanted : HOME_SCREEN);
        })();
      },
    );

    return () => {
      void handle.then((listener) => listener.remove());
    };
  }, [goTo, refresh]);
}
