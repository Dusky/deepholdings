import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { ScreenId, StateResponse } from '@deepholdings/shared';
import { canSend, refund, spend } from './sendBudget';

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

/**
 * What a tap should open. The slot id says *which notification*; this says
 * *which thing happened*, which is what the send budget dedupes on and what
 * the deep link routes on.
 *
 * Screen only. An earlier draft carried a `focus` hint — scroll to the permit
 * line, open the death card — and nothing read it: the death card is an
 * overlay that appears on its own once the refresh lands, and the journal
 * already opens at the newest line. A field describing intent that no screen
 * acts on is worse than not having one, because the next person to read it
 * will assume the behaviour exists.
 */
export interface NotificationTarget {
  /** Dedupe key, unique per real-world event rather than per slot. */
  key: string;
  screen: ScreenId;
}

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

  // Cancelling refunds the budget: re-deriving the schedule on every refresh
  // must not charge the officer again for a delivery that never fired.
  await cancelAll(state);

  if (!prefs.enabled) return;
  if (!(await ensurePermission())) return;

  const now = Date.now();
  const scheduled: Parameters<typeof LocalNotifications.schedule>[0]['notifications'] = [];

  if (prefs.permitReady && state.pendingPermit) {
    const readyAt = new Date(state.pendingPermit.readyAt);
    // Keyed on the tier, not the slot: D-4 and D-5 reuse id 1001 and are
    // different events, and both are worth being told about.
    const target: NotificationTarget = {
      key: `permit:${state.pendingPermit.tier}`,
      screen: 'terminal',
    };
    if (readyAt.getTime() > now && canSend(target.key) && spend(target.key)) {
      scheduled.push({
        id: ID_PERMIT,
        title: `Permit D-${state.pendingPermit.tier} approved`,
        body: `Descent authorised to Depth ${state.pendingPermit.authorisesDepth}. The office regrets the delay.`,
        schedule: { at: afterQuietHours(readyAt, prefs) },
        extra: target,
      });
    }
  }

  // Only worth reminding a living recruit's officer; a pending death is
  // already waiting on screen.
  if (prefs.shiftReady && state.character.alive && !state.pendingDeath) {
    // One shift reminder per recruit per day. Without the recruit in the key
    // an officer who loses three in a day is reminded three times about a log
    // they are plainly already reading.
    const target: NotificationTarget = {
      key: `shift:${state.character.id}:${new Date().toDateString()}`,
      screen: 'terminal',
    };
    const at = afterQuietHours(new Date(now + SHIFT_REMINDER_HOURS * 3600 * 1000), prefs);
    if (canSend(target.key) && spend(target.key)) {
      scheduled.push({
        id: ID_SHIFT,
        title: 'Shift report available',
        body: `${state.character.name} has been working. The log is not going to read itself.`,
        schedule: { at },
        extra: target,
      });
    }
  }

  if (scheduled.length > 0) {
    await LocalNotifications.schedule({ notifications: scheduled }).catch(() => undefined);
  }
}

/**
 * Clears the schedule and gives the budget back.
 *
 * The state is optional because the settings panel cancels without one. When
 * it is present the pending keys are refunded, which is what makes it safe to
 * cancel-and-re-derive on every single refresh: an officer who opens the app
 * five times in an hour would otherwise spend the day's budget on one permit.
 */
export async function cancelAll(state?: StateResponse): Promise<void> {
  if (state?.pendingPermit) refund(`permit:${state.pendingPermit.tier}`);
  if (state) refund(`shift:${state.character.id}:${new Date().toDateString()}`);
  if (!isSupported()) return;
  await LocalNotifications.cancel({
    notifications: [{ id: ID_PERMIT }, { id: ID_SHIFT }],
  }).catch(() => undefined);
}
