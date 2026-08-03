/**
 * "What am I working toward, and what should I do now?"
 *
 * ## Why this exists
 *
 * Nothing in the product answered either question. An audit of every screen
 * found no objective, no next step, no target and no win condition stated
 * anywhere — the closest thing was a journal line at account creation, which
 * scrolls away within the hour and cannot be recalled. A player who put the app
 * down for a week came back to a countdown, a log, and no indication of what
 * any of it was for.
 *
 * ## Two fields, and why the second is allowed to be empty
 *
 * `aim` is the nearest concrete thing arriving. It is never null: there is
 * always a next permit, and "nothing is ahead of me" is the genre's
 * hundred-hour churn.
 *
 * `action` is the one most useful thing to do *right now*, and it **is**
 * allowed to be null. This game's second product goal is that absence is never
 * punished and two check-ins a day should be plenty; the honest answer most of
 * the time is that nothing needs you. A next-step line that manufactured a
 * chore to fill the space would be a daily obligation in disguise, which
 * `docs/research/genre-cues.md` lists under what not to copy. So when there is
 * nothing worth doing it says so, and that is a feature.
 *
 * ## Ordering
 *
 * One action, not a list, chosen by what it costs the player to miss. Something
 * actively broken (staff who have stopped work) beats something merely
 * available (an affordable upgrade), because the first is losing them value
 * every minute and the second will still be there tomorrow.
 */
import {
  REQUISITION_CATALOGUE,
  UNLOCK_CATALOGUE,
  type Character,
  type Guidance,
  type Office,
  type PendingPermit,
  type Pension,
  type Registry,
  type RetirementOffer,
  type ScreenId,
} from '@deepholdings/shared';

export type { Guidance };

export interface GuidanceInput {
  character: Character;
  pension: Pension;
  office: Office;
  registry: Registry;
  pendingPermit: PendingPermit | null;
  retirement: RetirementOffer | null;
  ordersFiled: boolean;
  clearance: readonly ScreenId[];
}

/** Cheapest rung on any track the officer has not bought yet. */
function cheapestUnbought(
  catalogue: readonly { id: string; cost: number; label: string }[],
  owned: readonly string[],
): { cost: number; label: string } | null {
  const available = catalogue.filter((entry) => !owned.includes(entry.id));
  if (available.length === 0) return null;
  return available.reduce((low, entry) => (entry.cost < low.cost ? entry : low));
}

function hours(seconds: number): string {
  if (seconds < 90) return 'any moment';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `in about ${minutes} minutes`;
  return `in about ${Math.round(minutes / 60)} hours`;
}

export function guidanceFor(input: GuidanceInput): Guidance {
  const { character, pension, office, registry, pendingPermit, retirement, clearance } = input;

  return { aim: aimFor(input), action: actionFor(input) };

  function aimFor({ ordersFiled }: GuidanceInput): string {
    if (pendingPermit) {
      return (
        `Permit D-${pendingPermit.tier} clears ${hours(pendingPermit.secondsRemaining)}. ` +
        `It lets your recruit work down to Floor ${pendingPermit.authorisesDepth}.`
      );
    }

    // No permit in flight means the ladder is topped out for this recruit, so
    // the horizon is the pension — which is the game's actual long arc and the
    // thing a player is least likely to have worked out on their own.
    if (retirement?.eligible && retirement.award > 0) {
      return (
        `${character.name} is at the top of the permit ladder. Their pension is ` +
        `worth ${retirement.award.toLocaleString('en-GB')} and grows the longer they serve.`
      );
    }

    if (!ordersFiled) {
      return 'Your recruit is working underground on the default orders. Everything else follows from those.';
    }

    return `${character.name} is working underground. Pension builds while they serve, and is paid when they die.`;
  }

  function actionFor({ ordersFiled }: GuidanceInput): Guidance['action'] {
    // 1. Never filed. The core verb of the game, untouched.
    if (!ordersFiled) return { text: 'Set your standing orders', screen: 'orders' };

    // 2. Actively broken and costing gold every minute. The player cannot see
    //    why the cabinet stopped emptying itself without being told.
    if (registry.unpaid && clearance.includes('ledger')) {
      return { text: 'Your staff have stopped work — the payroll is short', screen: 'ledger' };
    }

    // 3. A permanent upgrade is affordable. Pension before gold: it is the
    //    scarcer currency and the one players sit on without realising.
    const unlock = cheapestUnbought(UNLOCK_CATALOGUE, pension.unlocks);
    if (unlock && pension.total >= unlock.cost && clearance.includes('ledger')) {
      return { text: `You can afford a permanent upgrade: ${unlock.label}`, screen: 'ledger' };
    }

    const kit = cheapestUnbought(REQUISITION_CATALOGUE, office.requisitions);
    if (kit && character.gold >= kit.cost && clearance.includes('ledger')) {
      return { text: `You can afford office equipment: ${kit.label}`, screen: 'ledger' };
    }

    // 4. Chasing paperwork — the one thing attention buys. Last, because it is
    //    additive: the permit clears either way and missing it costs nothing.
    if (pendingPermit && !pendingPermit.expedited && character.gold >= pendingPermit.expediteCost) {
      return {
        text: `You can halve the permit wait for ${pendingPermit.expediteCost} gold`,
        screen: 'terminal',
      };
    }

    return null;
  }
}
