/**
 * Teaching the game by having it played, rather than by describing it.
 *
 * ## What this replaces, and why that had to go
 *
 * The previous attempt was a card on the Terminal headed HOW THIS WORKS, with
 * four beats of exposition — "You are the case officer, not the recruit", "Your
 * recruit will die, and that is the mechanic". It was accurate and it was slop.
 * Two specific faults, both worth naming so they do not come back:
 *
 * 1. **It narrated the design document.** "That is the mechanic" is a sentence
 *    about the game addressed to someone evaluating the game. A player is
 *    inside it; telling them which parts are mechanics is the writing equivalent
 *    of pointing at the camera.
 * 2. **It front-loaded facts with nothing to attach them to.** "Gold is for now,
 *    pension is for good" means nothing to somebody who has never held either.
 *    Read before the first sale it is a slogan; discovered at the moment of
 *    spending it is a rule you now know.
 *
 * ## The shape
 *
 * Three steps, each ending in an action the player takes, each teaching one of
 * the three currencies. Every completion test is an **irreversible fact already
 * in the state** — orders filed, first equipment owned, first upgrade redeemed
 * — so there is no tutorial progress to persist, nothing to get out of step
 * with a save, and no way to be shown a step you have already done.
 *
 * A step appears only once it is actually doable. The third needs a pension,
 * which needs a death, which happens on its own — so the death is not
 * pre-announced in a paragraph. It arrives, the overlay says what it paid, and
 * the step that follows spends it. That is the lesson landing at the only
 * moment it can mean anything.
 *
 * When no step applies the tutorial is silent and `guidance.ts` takes over.
 * Silence is the normal state of this file after the first day or so.
 */
import {
  REQUISITION_CATALOGUE,
  UNLOCK_CATALOGUE,
  type Office,
  type Pension,
  type ScreenId,
} from '@deepholdings/shared';

export interface TutorialStep {
  /** Stable id, for tests and for telling steps apart in a log. */
  id: 'orders' | 'equipment' | 'upgrade';
  /** The instruction. Imperative, one line, names the thing to press. */
  instruction: string;
  /**
   * Why it is worth doing — one clause, concrete, about this player's actual
   * position. Never a general statement about how the game is designed.
   */
  because: string;
  screen: ScreenId;
  /** 1-based, so the player can see the end of it from the start. */
  index: number;
  total: number;
}

export const TUTORIAL_STEPS = 3;

export interface TutorialInput {
  ordersFiled: boolean;
  office: Office;
  pension: Pension;
  clearance: readonly ScreenId[];
  /** Name of the last recruit to die, used to make step three concrete. */
  predecessorName: string | null;
}

function cheapest(catalogue: readonly { cost: number; label: string }[]) {
  return catalogue.reduce((low, entry) => (entry.cost < low.cost ? entry : low));
}

export function tutorialStep(input: TutorialInput): TutorialStep | null {
  const { ordersFiled, office, pension, clearance, predecessorName } = input;

  // 1. The core verb. Everything the recruit does traces back to this form, so
  //    nothing else is worth teaching first.
  if (!ordersFiled) {
    return {
      id: 'orders',
      instruction: 'Open Orders and file your standing orders',
      because: 'Your recruit is working to the defaults until you do',
      screen: 'orders',
      index: 1,
      total: TUTORIAL_STEPS,
    };
  }

  // The Ledger is where the remaining two steps happen. Before it is cleared
  // there is nothing to point at, so the tutorial waits rather than naming a
  // screen the officer has no clearance for.
  if (!clearance.includes('ledger')) return null;

  // 2. Gold, taught by spending it on the one thing gold buys that outlives the
  //    recruit who earned it. Selling is the means and is named as such — a
  //    separate "now sell something" step would be a chore with no payoff
  //    attached, and the cabinet refills forever so it could never complete.
  if (office.requisitions.length === 0) {
    const kit = cheapest(REQUISITION_CATALOGUE);
    return {
      id: 'equipment',
      instruction: `Sell your cabinet, then requisition ${kit.label}`,
      because: `It costs ${kit.cost.toLocaleString('en-GB')} gold and stays on your desk when your recruit does not`,
      screen: 'ledger',
      index: 2,
      total: TUTORIAL_STEPS,
    };
  }

  // 3. Pension, which cannot exist until somebody has died. Held back until it
  //    is affordable so the step is never an instruction the player cannot
  //    follow — and so the first death arrives unheralded and does its own
  //    teaching.
  const unlock = cheapest(UNLOCK_CATALOGUE);
  if (pension.unlocks.length === 0 && pension.total >= unlock.cost) {
    return {
      id: 'upgrade',
      instruction: `Redeem ${unlock.label}`,
      because: predecessorName
        ? `${predecessorName} paid for it by dying, and every recruit after them keeps it`
        : 'Pension upgrades apply to every recruit you are assigned from now on',
      screen: 'ledger',
      index: 3,
      total: TUTORIAL_STEPS,
    };
  }

  return null;
}
