import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { api } from '../api/client';
import { HOME_SCREEN, useScreen } from '../state/screenContext';
import { useServer } from '../state/serverContext';
import { useSettings } from '../state/settingsContext';
import type { ScreenId } from '../types';

/**
 * FCM registration, and what happens when a push is tapped.
 *
 * Push carries exactly one thing local notifications cannot: death. Everything
 * else this game has to say is predictable from a tick — a permit clears at a
 * known time, a shift is worth reading after a few hours — and a scheduled
 * local notification says it without a server, credentials, or a delivery cost.
 * Death is a die roll, and the server only discovers it by replaying ticks
 * nobody has read, which is what `push/sweep.ts` exists to do.
 *
 * Registration is conditional on the player's notification preferences, and
 * turning them off unregisters rather than merely ignoring what arrives — an
 * app that keeps a live token after being told to be quiet is one Play policy
 * complaint away from a problem, and it is rude besides.
 */
export function usePush(): void {
  const { goTo } = useScreen();
  const { state, refresh } = useServer();
  const { notifications } = useSettings();

  // Same reasoning as useNotificationTap: clearance is a new array every
  // render, and a listener that rebuilds constantly is a listener that is
  // absent when a queued cold-start tap arrives.
  const clearanceRef = useRef<readonly ScreenId[]>(state?.clearance ?? [HOME_SCREEN]);
  useEffect(() => {
    clearanceRef.current = state?.clearance ?? [HOME_SCREEN];
  }, [state]);

  // The registered token, so switching notifications off can hand it back.
  const tokenRef = useRef<string | null>(null);

  // Death is the only thing push carries, so the death toggle *is* the push
  // subscription. Off means hand the token back, not filter on arrival.
  const wanted = notifications.enabled && notifications.deathPush;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    if (!wanted) {
      const held = tokenRef.current;
      tokenRef.current = null;
      if (held) void api.unregisterPush(held).catch(() => undefined);
      return;
    }

    let cancelled = false;
    const handles: Promise<{ remove(): Promise<void> }>[] = [];

    handles.push(
      PushNotifications.addListener('registration', (info) => {
        if (cancelled) return;
        tokenRef.current = info.value;
        // A failure here is not worth surfacing: the game is entirely playable
        // without push, and a modal about notification plumbing on first boot
        // is a worse first impression than a missed death alert.
        void api
          .registerPush(info.value, Capacitor.getPlatform())
          .catch(() => undefined);
      }),
    );

    handles.push(
      PushNotifications.addListener('registrationError', () => {
        // Silent by design, same reasoning.
      }),
    );

    handles.push(
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        // FCM data values are always strings, so this is the same shape the
        // local notifications put in `extra` and is routed identically — a
        // push and a scheduled reminder should be indistinguishable once
        // tapped.
        const data = action.notification.data as { screen?: ScreenId } | undefined;
        void (async () => {
          // Refresh before navigating. The push is about something that
          // happened while the app was closed, so the snapshot on screen is
          // stale by exactly the amount that matters — and for a death, the
          // refresh is what makes the overlay appear at all.
          await refresh();
          const screen = data?.screen;
          if (!screen) return;
          goTo(clearanceRef.current.includes(screen) ? screen : HOME_SCREEN);
        })();
      }),
    );

    void (async () => {
      const permission = await PushNotifications.checkPermissions();
      const granted =
        permission.receive === 'granted'
          ? true
          : permission.receive === 'denied'
            ? false
            : (await PushNotifications.requestPermissions()).receive === 'granted';
      if (granted && !cancelled) await PushNotifications.register();
    })();

    return () => {
      cancelled = true;
      for (const handle of handles) void handle.then((listener) => listener.remove());
    };
  }, [wanted, goTo, refresh]);
}
