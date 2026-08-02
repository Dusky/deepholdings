/**
 * The Registry: staff, and the chores they take off your desk.
 *
 * ## Why this exists
 *
 * Deep Holdings inverted the genre's automation ladder and then never built
 * one. A normal incremental starts you tapping and sells you automation; each
 * rung removes a chore and replaces it with a number to tune. Here the
 * *recruit* was automated from the first minute — that is the premise, and it
 * is right — but the *officer's* work stayed manual forever, with nothing in
 * either catalogue that reduced it. Selling, redeeming, filing: all of it by
 * hand, every session, for as long as you play.
 *
 * So the automation ladder is staff, which is the reading the fiction was
 * already asking for. You are a case officer in a bureaucracy: you start doing
 * your own filing and you end up running a department.
 *
 * ## Policies, not switches
 *
 * Every hire takes a standing instruction rather than an on/off toggle. That is
 * the load-bearing part. Automation that removes the decision removes the game
 * — the point is to delegate *with instructions*, so what you are choosing
 * moves up a level rather than disappearing. A Filing Clerk does not sell your
 * cabinet; they sell everything under a figure you set, and picking that figure
 * is the new decision.
 *
 * ## Wages
 *
 * Hiring costs gold once; keeping them costs gold every minute. The economy had
 * no recurring sink at all — seven requisitions, bought once, and then gold
 * accumulated with nothing to want. Wages are the first cost that keeps
 * arriving, which is what makes income something to manage rather than
 * something to watch.
 *
 * Measured, so the numbers mean something. Gold generated per minute, including
 * what is sitting unrealised in the cabinet:
 *
 *     day one, no unlocks     4.59 g/min   (only 0.24 of it in the purse)
 *     stipend I               6.70 g/min
 *     stipend II              9.49 g/min
 *     every unlock bought    16.77 g/min
 *
 * The gap on the first line is the whole argument for the Filing Clerk: on day
 * one, **95% of what a recruit earns is sitting in the cabinet** waiting for
 * the officer to go and sell it.
 *
 * ## Why the wage is one gold a minute and not three
 *
 * It shipped at 1/2/3 — six a minute for the department — reasoned against the
 * income curve above and nothing else. Then the harness learned about staff and
 * said what that actually cost:
 *
 *     ninety days, an officer who hires everything as soon as they can
 *
 *                        no department      6 g/min       3 g/min
 *     lifetime pension        ~1,503k          982k        1,263k
 *     last new thing         day 39.5      day 58.8      day 50.2
 *
 * A department that cost **35% of lifetime pension** — and the mechanism is
 * structural rather than a bad number. `pensionAward` pays out on the estate at
 * `goldHandled * 0.4`, so **every gold a recurring sink takes is 0.4 gold of
 * pension it takes with it**, and the loss compounds: less pension buys fewer
 * Service Credit rungs, which lowers the multiplier on every pension after.
 *
 * That is worth knowing about far beyond this file. Requisitions never showed
 * it because they are bought once; wages are the first cost that keeps
 * arriving, so they are the first thing to run into it. Any recurring sink
 * added after this one is a pension tax at the same rate, and has to be priced
 * knowing that.
 *
 * At one a minute each the tax is about 16% and the curve stretches by ten days
 * rather than nineteen. Still a real cost — which is the point, an automation
 * you do not feel is not a decision — but no longer a feature that mostly makes
 * the game slower. Note the direction of that trade before extending the
 * department: in this genre automation is supposed to *accelerate*, and a post
 * whose only benefit is convenience will always read as a tax in a simulation
 * that cannot value the officer's time.
 */

export type StaffRole = 'clerk' | 'officer' | 'archivist';

export interface StaffMember {
  role: StaffRole;
  /** The standing instruction. What it means depends on the role. */
  policy: number;
}

/** Account-level, like the office. Staff outlive recruits; they work for you. */
export interface Registry {
  staff: StaffMember[];
  /** Gold spent on hiring and wages, ever. A total, never re-credited. */
  spent: number;
  /**
   * True when the last payroll could not be met.
   *
   * Unpaid staff stop working rather than going into debt — a negative purse
   * would be a death spiral with no way out, and "they downed tools" is both
   * recoverable and funnier.
   */
  unpaid: boolean;
}

export interface StaffSpec {
  role: StaffRole;
  title: string;
  detail: string;
  /** One-off, in gold. */
  hire: number;
  /** Gold per minute, for as long as they are on the books. */
  upkeep: number;
  policyLabel: string;
  /** Rendered after the number: "gold", "grade", "". */
  policyUnit: string;
  policyMin: number;
  policyMax: number;
  policyStep: number;
  policyDefault: number;
}

export const STAFF_CATALOGUE: readonly StaffSpec[] = [
  {
    role: 'clerk',
    title: 'Filing Clerk',
    // Depot rates rather than the day's demand, and that is a design choice
    // rather than a limitation: a clerk clearing junk does not shop for the
    // best price. Demand runs 0.8–1.2 around par, so this costs nothing on
    // average and costs you the *timing* — which is the part worth keeping for
    // the stacks you care about, and the reason the threshold exists.
    detail: 'Liquidates any stack worth less than the figure you set, at depot rates.',
    hire: 800,
    upkeep: 1,
    policyLabel: 'Liquidate stacks under',
    policyUnit: 'gold',
    policyMin: 0,
    policyMax: 600,
    policyStep: 25,
    policyDefault: 120,
  },
  {
    role: 'officer',
    title: 'Junior Officer',
    detail: 'Redeems the cheapest rung you can afford, never taking the pension below your reserve.',
    hire: 2400,
    upkeep: 1,
    // A reserve rather than a track preference. The ladders are bought in tier
    // order anyway, so "which one next" is nearly always "the cheapest" — what
    // an officer actually wants to protect is the ability to buy something
    // expensive later, and a floor says that in one number.
    policyLabel: 'Keep a pension reserve of',
    policyUnit: '',
    policyMin: 0,
    policyMax: 60000,
    policyStep: 2500,
    policyDefault: 0,
  },
  {
    role: 'archivist',
    title: 'Archivist',
    detail: 'Files Form 12-C against riders on files at or above the grade you set. Fees are paid as usual.',
    hire: 4800,
    upkeep: 1,
    policyLabel: 'Contest riders from grade',
    policyUnit: '',
    policyMin: 1,
    policyMax: 5,
    policyStep: 1,
    policyDefault: 4,
  },
];

export function staffSpec(role: StaffRole): StaffSpec | undefined {
  return STAFF_CATALOGUE.find((entry) => entry.role === role);
}

export function isHired(registry: Registry, role: StaffRole): boolean {
  return registry.staff.some((member) => member.role === role);
}

export function policyOf(registry: Registry, role: StaffRole): number | null {
  return registry.staff.find((member) => member.role === role)?.policy ?? null;
}

/** Gold per minute for everyone on the books. */
export function payrollPerTick(registry: Registry): number {
  return registry.staff.reduce((total, member) => total + (staffSpec(member.role)?.upkeep ?? 0), 0);
}

/** Clamped to the role's own range, so a stale client cannot file nonsense. */
export function clampPolicy(role: StaffRole, value: number): number {
  const spec = staffSpec(role);
  if (!spec) return 0;
  if (!Number.isFinite(value)) return spec.policyDefault;
  return Math.max(spec.policyMin, Math.min(spec.policyMax, Math.round(value)));
}

export const EMPTY_REGISTRY: Registry = { staff: [], spent: 0, unpaid: false };
