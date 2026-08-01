/**
 * Send-rate discipline.
 *
 * A notification the player did not want is worse than none — an idle game
 * that nags is uninstalled faster than one that is quiet. Two rules, both
 * enforced here rather than at each call site, because the call sites are
 * where the temptation to add "just one more" lives:
 *
 *   1. A calendar day carries at most `DAILY_CAP` deliveries.
 *   2. The same event is never delivered twice.
 *
 * Rule 2 needs a *key for the event*, not for the notification slot. "Permit
 * D-4 approved" and "Permit D-5 approved" share a slot id — ids are reused so
 * rescheduling replaces rather than duplicates — but they are different events
 * and both deserve to arrive. `permit:4` and `permit:5` say that; id `1001`
 * cannot.
 *
 * Today there are two local notification types and the cap is not binding.
 * It is written now because the thing that makes it binding is FCM, and a
 * budget added *after* push is a budget added after the first complaint.
 */

const STORAGE_KEY = 'deepholdings.sendBudget';

/**
 * The two localStorage methods this needs, so the budget can be exercised
 * without a browser. Same shape as `api/baseUrl.ts` uses, for the same reason:
 * the rules are worth testing and `window` is not worth simulating.
 */
export interface BudgetStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStore(): BudgetStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Four a day. The design promises two check-ins are plenty, so more than two
 * unprompted interruptions a day is the app arguing with its own premise —
 * doubled, because a permit clearing and a recruit dying on the same day are
 * both genuinely worth knowing.
 */
export const DAILY_CAP = 4;

interface Budget {
  /** Local calendar day, `YYYY-MM-DD`. Resets the count when it changes. */
  day: string;
  count: number;
  /** Event keys already spent, this day only. */
  sent: string[];
}

function today(at: Date): string {
  // Local date, not UTC: a cap that resets at midnight UTC resets in the
  // middle of someone's evening.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

function read(at: Date, store: BudgetStore | null): Budget {
  const fresh: Budget = { day: today(at), count: 0, sent: [] };
  try {
    const raw = store?.getItem(STORAGE_KEY);
    if (!raw) return fresh;
    const parsed = JSON.parse(raw) as Partial<Budget>;
    if (parsed.day !== fresh.day) return fresh;
    return {
      day: fresh.day,
      count: typeof parsed.count === 'number' ? parsed.count : 0,
      sent: Array.isArray(parsed.sent) ? parsed.sent.filter((k) => typeof k === 'string') : [],
    };
  } catch {
    return fresh;
  }
}

function write(budget: Budget, store: BudgetStore | null): void {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(budget));
  } catch {
    // A device that cannot persist the budget gets an unbudgeted day rather
    // than a broken schedule. Silence here is deliberate: the alternative is
    // refusing to notify at all because we cannot remember that we did.
  }
}

/**
 * Whether this event may be scheduled, without spending anything.
 *
 * Scheduling and delivery are different moments — a permit notification is
 * scheduled hours before it fires, and may be replaced or cancelled in
 * between. The budget is spent at schedule time anyway, because the
 * alternative is a client that cannot tell whether it already promised
 * something while the app was closed.
 */
export function canSend(key: string, at = new Date(), store = defaultStore()): boolean {
  const budget = read(at, store);
  if (budget.sent.includes(key)) return false;
  return budget.count < DAILY_CAP;
}

/** Records a scheduled delivery. Returns false if the budget refused it. */
export function spend(key: string, at = new Date(), store = defaultStore()): boolean {
  const budget = read(at, store);
  if (budget.sent.includes(key)) return false;
  if (budget.count >= DAILY_CAP) return false;
  write({ day: budget.day, count: budget.count + 1, sent: [...budget.sent, key] }, store);
  return true;
}

/**
 * Gives a key back, for a scheduled delivery that was cancelled before it
 * could fire. Without this, an officer who opens the app twice while a permit
 * is processing pays for the same permit twice — `syncNotifications` cancels
 * and re-derives the whole schedule on every refresh.
 */
export function refund(key: string, at = new Date(), store = defaultStore()): void {
  const budget = read(at, store);
  if (!budget.sent.includes(key)) return;
  write(
    {
      day: budget.day,
      count: Math.max(0, budget.count - 1),
      sent: budget.sent.filter((k) => k !== key),
    },
    store,
  );
}

/** Test and settings support. */
export function budgetState(
  at = new Date(),
  store = defaultStore(),
): { spent: number; remaining: number } {
  const budget = read(at, store);
  return { spent: budget.count, remaining: Math.max(0, DAILY_CAP - budget.count) };
}

export function resetBudget(store = defaultStore()): void {
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to reset */
  }
}
