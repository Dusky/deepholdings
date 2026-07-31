import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { StateResponse } from '@deepholdings/shared';

/**
 * Scheduled notifications, without a push server.
 *
 * Most of what this game has to say is predictable: a permit clears at a known
 * tick, and a shift is worth reading after a few hours. Those are local
 * notifications — no FCM project, no credentials, no delivery cost, and they
 * work with the app closed and offline. Push (and the Firebase project that
 * implies) is only needed for the genuinely unpredictable event, which is death.
 */

export interface NotificationPrefs {
  enabled: boolean;
  permitReady: boolean;
  shiftReady: boolean;
  /** Local hours during which nothing is delivered. */
  quietFrom: number;
  quietTo: number;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: true,
  permitReady: true,
  shiftReady: true,
  quietFrom: 23,
  quietTo: 8,
};

/** Stable ids so rescheduling replaces rather than duplicates. */
const ID_PERMIT = 1001;
const ID_SHIFT = 1002;

/** How long unattended before a shift is worth coming back to read. */
const SHIFT_REMINDER_HOURS = 6;

export function isSupported(): boolean {
  return Capacitor.isNativePlatform();
}

function inQuietHours(at: Date, prefs: NotificationPrefs): boolean {
  const hour = at.getHours();
  // Quiet hours usually straddle midnight, so the window wraps.
  return prefs.quietFrom > prefs.quietTo
    ? hour >= prefs.quietFrom || hour < prefs.quietTo
    : hour >= prefs.quietFrom && hour < prefs.quietTo;
}

/** Pushes a delivery out of the quiet window rather than dropping it. */
function afterQuietHours(at: Date, prefs: NotificationPrefs): Date {
  if (!inQuietHours(at, prefs)) return at;
  const out = new Date(at);
  if (out.getHours() >= prefs.quietFrom) out.setDate(out.getDate() + 1);
  out.setHours(prefs.quietTo, 0, 0, 0);
  return out;
}

export async function ensurePermission(): Promise<boolean> {
  if (!isSupported()) return false;
  const current = await LocalNotifications.checkPermissions();
  if (current.display === 'granted') return true;
  if (current.display === 'denied') return false;
  const asked = await LocalNotifications.requestPermissions();
  return asked.display === 'granted';
}

/**
 * Re-derives the whole schedule from the current snapshot.
 *
 * Called on every refresh: cancelling and rescheduling is cheap, and it keeps
 * the schedule honest when orders change, a permit clears early, or the recruit
 * dies. Anything already in the past is simply not scheduled.
 */
export async function syncNotifications(
  state: StateResponse,
  prefs: NotificationPrefs,
): Promise<void> {
  if (!isSupported()) return;

  await LocalNotifications.cancel({
    notifications: [{ id: ID_PERMIT }, { id: ID_SHIFT }],
  }).catch(() => undefined);

  if (!prefs.enabled) return;
  if (!(await ensurePermission())) return;

  const now = Date.now();
  const scheduled: Parameters<typeof LocalNotifications.schedule>[0]['notifications'] = [];

  if (prefs.permitReady && state.pendingPermit) {
    const readyAt = new Date(state.pendingPermit.readyAt);
    if (readyAt.getTime() > now) {
      scheduled.push({
        id: ID_PERMIT,
        title: `Permit D-${state.pendingPermit.tier} approved`,
        body: `Descent authorised to Depth ${state.pendingPermit.authorisesDepth}. The office regrets the delay.`,
        schedule: { at: afterQuietHours(readyAt, prefs) },
        extra: { screen: 'terminal' },
      });
    }
  }

  // Only worth reminding a living recruit's officer; a pending death is
  // already waiting on screen.
  if (prefs.shiftReady && state.character.alive && !state.pendingDeath) {
    const at = afterQuietHours(new Date(now + SHIFT_REMINDER_HOURS * 3600 * 1000), prefs);
    scheduled.push({
      id: ID_SHIFT,
      title: 'Shift report available',
      body: `${state.character.name} has been working. The log is not going to read itself.`,
      schedule: { at },
      extra: { screen: 'terminal' },
    });
  }

  if (scheduled.length > 0) {
    await LocalNotifications.schedule({ notifications: scheduled }).catch(() => undefined);
  }
}

export async function cancelAll(): Promise<void> {
  if (!isSupported()) return;
  await LocalNotifications.cancel({
    notifications: [{ id: ID_PERMIT }, { id: ID_SHIFT }],
  }).catch(() => undefined);
}
