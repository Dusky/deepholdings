/**
 * Special Assignments: the game you have already beaten, made unfamiliar.
 *
 * ## Where this comes from
 *
 * Antimatter Dimensions' challenges are the best content-per-authored-line
 * mechanic in the genre. They replay the early game a few dozen times with one
 * rule changed each time — no dimension boosts, halved tick speed, a currency
 * that decays — and pay a permanent reward. Nothing new is simulated. What
 * makes it work is that a restriction changes which decisions are good, so
 * systems the player has stopped thinking about become interesting again.
 *
 * That matters here specifically because of what the research already
 * concluded. `mobile-incrementals.md` found that the genre's most common way to
 * lose a player is late-game grind, and set the constraint plainly: **whatever
 * answers month two has to be new, not slower.** A restriction is new without
 * being longer. It is the only mechanic that gets that for free.
 *
 * ## Why they pay Commendations
 *
 * The alternative was a third currency, and a third currency is a third column
 * on a screen that already has three. Commendations are the long arc — the
 * catalogue costs thirty-six and a quarter of engaged play banks ten — so a
 * second source that is *earned by playing differently* rather than by waiting
 * is the one thing that can shorten that arc without touching the pension
 * formula or selling anything.
 *
 * It also answers a thing the design had no answer for: what an engaged officer
 * gets that a patient one does not. Until now, nothing. Attention bought you
 * the same curve slightly sooner. An assignment is optional, costs nothing to
 * decline, and pays the currency that matters most.
 *
 * ## Rules that keep them from becoming a chore
 *
 * - **One at a time**, and taking one is free.
 * - **Abandoning is free**, and forfeits only the progress.
 * - **Failing costs nothing** but the time — there is no penalty state, because
 *   a challenge you can lose *something* on is a challenge people stop taking.
 * - **Each completes once.** They are content, not a daily.
 * - **No timers.** Nothing here expires, so none of it is a reason to open the
 *   app at a particular hour.
 */
import type { LootPriority } from './domain.js';
import type { SiteId } from './sites.js';

export type AssignmentId =
  | 'unassisted'
  | 'skeleton'
  | 'sole-charge'
  | 'cold-start'
  | 'narrow-remit'
  | 'junior';

/**
 * What the assignment takes away.
 *
 * Every one of these is a flag the resolver already branches on, which is the
 * whole point: an assignment is a restriction, not a mode. Anything needing new
 * simulation would be a different feature wearing this one's name.
 */
export interface AssignmentRestriction {
  /** Pension rungs stop applying. The single hardest and cheapest restriction. */
  noUnlocks?: boolean;
  /** The department stands down — no wages, no work. */
  noDepartment?: boolean;
  /** A death ends the assignment. Nothing else is lost. */
  singleRecruit?: boolean;
  /** Recruits cannot be promoted past this grade. */
  gradeCap?: number;
  /** Orders are filed for this site, whatever the officer would prefer. */
  site?: SiteId;
  /** And for this priority. */
  lootPriority?: LootPriority;
}

export type AssignmentMetric = 'depth' | 'floors' | 'files' | 'service' | 'grade';

export interface AssignmentSpec {
  id: AssignmentId;
  name: string;
  /** The Authority's own description, printed on the Bulletin. */
  brief: string;
  restriction: AssignmentRestriction;
  metric: AssignmentMetric;
  target: number;
  /** Commendations paid on completion. */
  reward: number;
}

export const ASSIGNMENT_CATALOGUE: readonly AssignmentSpec[] = [
  {
    id: 'unassisted',
    name: 'Unassisted Survey',
    brief:
      'Your pension entitlements are suspended for the duration. The Authority ' +
      'wishes to establish what the floors are like without them.',
    restriction: { noUnlocks: true },
    metric: 'depth',
    target: 10,
    reward: 1,
  },
  {
    id: 'skeleton',
    name: 'Skeleton Staff',
    brief:
      'The registry is required elsewhere. You will be doing your own filing ' +
      'again. Payroll is suspended, which is the only good news in this notice.',
    restriction: { noDepartment: true },
    metric: 'files',
    target: 40,
    reward: 1,
  },
  {
    id: 'sole-charge',
    name: 'Sole Charge',
    brief:
      'No replacement will be issued. If the recruit is lost, the assignment ' +
      'is closed and the file returned without prejudice.',
    restriction: { singleRecruit: true },
    metric: 'service',
    target: 4320,
    reward: 2,
  },
  {
    id: 'cold-start',
    name: 'Cold Start',
    brief:
      'The Annexe, without entitlements and without staff. The Authority is ' +
      'aware this is a great deal to ask and has authorised no additional funds.',
    restriction: { noUnlocks: true, noDepartment: true, site: 'annexe' },
    metric: 'depth',
    target: 8,
    reward: 3,
  },
  {
    id: 'narrow-remit',
    name: 'Narrow Remit',
    brief:
      'Documents and intelligence only. Coin, equipment and relics are to be ' +
      'left where they lie, and yes, the Authority has considered the cost.',
    restriction: { lootPriority: 'knowledge' },
    metric: 'grade',
    target: 12,
    reward: 1,
  },
  {
    id: 'junior',
    name: "Junior Officer's Burden",
    brief:
      'Promotions are frozen at Grade 6. The regional office would like to know ' +
      'how much of your record is you and how much of it is the grade.',
    restriction: { gradeCap: 6 },
    metric: 'floors',
    target: 300,
    reward: 2,
  },
];

export function assignmentSpec(id: AssignmentId): AssignmentSpec | undefined {
  return ASSIGNMENT_CATALOGUE.find((entry) => entry.id === id);
}

/** What the officer is doing now, and what they have already done. */
export interface AssignmentState {
  active: AssignmentId | null;
  /** Progress toward the active assignment's target. */
  progress: number;
  /** The tick the active assignment was accepted, for `service`. */
  startedTick: number;
  completed: AssignmentId[];
}

export const EMPTY_ASSIGNMENTS: AssignmentState = {
  active: null,
  progress: 0,
  startedTick: 0,
  completed: [],
};

/**
 * Progress after one resolved span.
 *
 * `depth` and `grade` are watermarks and `service` is measured from the start
 * tick, so all three are *replacements* rather than sums — adding them up would
 * report an officer who reached Floor 6 twice as having reached Floor 12.
 */
export function assignmentProgress(
  spec: AssignmentSpec,
  current: number,
  counters: { deepestFloor: number; floorsDescended: number; caseFilesFound: number },
  character: { level: number; bornTick: number; lastResolvedTick: number },
  startedTick: number,
): number {
  switch (spec.metric) {
    case 'depth':
      return Math.max(current, counters.deepestFloor);
    case 'grade':
      return Math.max(current, character.level);
    case 'service':
      // Service on *this* assignment, and it is deliberately the recruit's own
      // life rather than wall-clock since acceptance: `sole-charge` is about
      // keeping somebody alive, and measuring elapsed time would let an officer
      // pass it by leaving a corpse on the desk.
      return Math.max(0, character.lastResolvedTick - Math.max(startedTick, character.bornTick));
    case 'floors':
      return current + counters.floorsDescended;
    case 'files':
      return current + counters.caseFilesFound;
  }
}

export function assignmentComplete(spec: AssignmentSpec, progress: number): boolean {
  return progress >= spec.target;
}

/** How the Bulletin renders progress, without inventing units it does not have. */
export function assignmentProgressText(spec: AssignmentSpec, progress: number): string {
  switch (spec.metric) {
    case 'depth':
      return `Floor ${Math.min(progress, spec.target)} of ${spec.target}`;
    case 'grade':
      return `Grade ${Math.min(progress, spec.target)} of ${spec.target}`;
    case 'service':
      return `${Math.floor(progress / 60)}h of ${Math.floor(spec.target / 60)}h served`;
    case 'floors':
      return `${Math.min(progress, spec.target)} of ${spec.target} floors`;
    case 'files':
      return `${Math.min(progress, spec.target)} of ${spec.target} files`;
  }
}
