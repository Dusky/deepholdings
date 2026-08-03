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
 * A department that cost **35% of lifetime pension** — and the mechanism was
 * structural rather than a bad number. `pensionAward` paid out on the estate at
 * `goldHandled * 0.4`, so **every gold a recurring sink took was 0.4 gold of
 * pension it took with it**, and the loss compounded: less pension bought fewer
 * Service Credit rungs, which lowered the multiplier on every pension after.
 *
 * Requisitions never showed it because they are bought once. Wages are the
 * first cost that keeps arriving, so they were the first thing to hit it — and
 * hitting it is what got the formula measured. The estate turned out to be
 * **96.3% of every award**, so `pensionAward` was pricing systems that had not
 * been designed yet, quietly, on a rule its own comment denied.
 *
 * ## What that changed
 *
 * The formula now accrues on service, with the estate at a tenth rather than
 * two fifths. Gold is the economy and pension is time-and-depth; spending no
 * longer costs pension. The department's price at one a minute each:
 *
 *     ninety days, an officer who hires everything as soon as they can
 *
 *                        no department    3 g/min, old    3 g/min, now
 *     lifetime pension        ~1,590k         1,263k          1,514k
 *     cost of the department      —              16%            4.8%
 *     time unpaid                 —             2.6%            0.7%
 *
 * Wages are now close to what they look like on the tin. That is the right
 * footing to extend the department from, but it also removes the excuse: at 16%
 * a post could be defended as "convenience you pay for", and at 4.8% a post
 * that does nothing but save taps is simply thin. In this genre automation is
 * supposed to *accelerate*, and every tier added past the first has to buy an
 * edge rather than another chore.
 */

import type { LadderEntry } from './tuning.js';
import { payrollShare, type CommendationId } from './transfer.js';

export type StaffRole = 'clerk' | 'officer' | 'archivist';

export interface StaffMember {
  role: StaffRole;
  /** The standing instruction. What it means depends on the role. */
  policy: number;
  /**
   * The post's tier, 1 to 3. Appointment is tier 1; the rest are promotions.
   *
   * Deliberately not called a *grade*. Recruits have grades and so do case
   * files, and a third meaning on a third noun is how "Arbitration" ended up
   * naming a flavour line and a mechanic at the same time. `tier` is what the
   * pension and requisition ladders already call this.
   *
   * Optional on the way in because registries were written before tiers
   * existed, and a row saved then has no field here. Every read goes through
   * `staffTier`, which treats a missing tier as 1 — see migration 010, which
   * backfills the stored rows so the fallback is belt-and-braces rather than
   * the actual mechanism.
   */
  tier?: number;
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
    policyLabel: 'Contest riders from grade',
    policyUnit: '',
    policyMin: 1,
    policyMax: 5,
    policyStep: 1,
    policyDefault: 4,
  },
];

/**
 * The promotion ladder: three posts, three tiers each.
 *
 * ## Why tiers had to buy an edge
 *
 * The department shipped as three flat posts whose only benefit was saving the
 * officer taps. That was defensible while a wage cost 16% of lifetime pension —
 * "convenience you pay for" is a real bargain. Once the pension formula stopped
 * taxing every sink, the wage fell to 4.8%, and a post that only saves taps
 * became thin rather than expensive.
 *
 * It was also backwards. In this genre automation *accelerates*: each rung buys
 * throughput, and the numbers get bigger because of it. Here every rung was a
 * cost against a simulation that cannot value the officer's time, so the
 * harness could only ever report the department making the game slower — which
 * it did, by ten days, and that was recorded as if it were content.
 *
 * So every tier past appointment buys something the officer could not do by
 * hand at all:
 *
 * - **Clerk** realises *above* depot rates. The one post that pays for itself
 *   in gold rather than only in taps, and the reason to raise the threshold
 *   rather than keep it at junk.
 * - **Officer** raises how many rungs clear per visit, and shaves the pension
 *   price of each. Appointment is deliberately capped at one rung a visit —
 *   the post used to redeem *everything* affordable the moment it was hired,
 *   which left its own ladder nothing to sell.
 * - **Archivist** cuts the Form 12-C fee and the Union Standing it costs, so
 *   the crafting layer gets cheaper as the department grows.
 *
 * ## Pricing
 *
 * Upkeep tops out at nine gold a minute for a full department, against a
 * measured peak income of 16.77 g/min with every unlock bought. That is a real
 * bite — more than half of peak — and it is meant to be: the Clerk's own edge
 * returns roughly 2.9 g/min at that income, so a maxed department is close to
 * paying its own wage and the officer's decision is *which* posts to promote
 * rather than whether to bother.
 *
 * The one-off costs total 324,000 gold, which is the first sink in the game
 * large enough to give a late-game purse something to want. Seven requisitions
 * cost 26,700 between them and are done by day four.
 */
export interface StaffRung extends LadderEntry<StaffRungId, StaffRole> {
  /** Gold per minute at this tier. It replaces the previous tier's, not adds. */
  readonly upkeep: number;
}

export type StaffRungId =
  | 'clerk1' | 'clerk2' | 'clerk3'
  | 'officer1' | 'officer2' | 'officer3'
  | 'archivist1' | 'archivist2' | 'archivist3';

export const STAFF_LADDER: readonly StaffRung[] = [
  { id: 'clerk1', track: 'clerk', tier: 1, label: 'Filing Clerk', cost: 800, upkeep: 1,
    detail: 'Liquidates stacks under your threshold at depot rates.' },
  { id: 'clerk2', track: 'clerk', tier: 2, label: 'Senior Filing Clerk', cost: 6000, upkeep: 2,
    detail: 'Knows which depot is paying. Realises 8% over book value.' },
  { id: 'clerk3', track: 'clerk', tier: 3, label: 'Chief Filing Clerk', cost: 40000, upkeep: 3,
    detail: 'Realises 18% over book value.' },

  { id: 'officer1', track: 'officer', tier: 1, label: 'Junior Officer', cost: 2400, upkeep: 1,
    detail: 'Redeems one rung a visit, cheapest first, above your reserve.' },
  { id: 'officer2', track: 'officer', tier: 2, label: 'Staff Officer', cost: 15000, upkeep: 2,
    detail: 'Three rungs a visit, and the Authority rounds 5% in your favour.' },
  { id: 'officer3', track: 'officer', tier: 3, label: 'Senior Staff Officer', cost: 90000, upkeep: 3,
    detail: 'Redeems without limit, at 12% off.' },

  { id: 'archivist1', track: 'archivist', tier: 1, label: 'Archivist', cost: 4800, upkeep: 1,
    detail: 'Files one Form 12-C a visit against a rider at or above your grade.' },
  { id: 'archivist2', track: 'archivist', tier: 2, label: 'Senior Archivist', cost: 25000, upkeep: 2,
    detail: 'Fees 30% lower, and files two forms a visit.' },
  { id: 'archivist3', track: 'archivist', tier: 3, label: 'Keeper of the Rolls', cost: 140000, upkeep: 3,
    detail: 'Fees 55% lower, and one less Union Standing per form.' },
];

export function staffSpec(role: StaffRole): StaffSpec | undefined {
  return STAFF_CATALOGUE.find((entry) => entry.role === role);
}

/**
 * What tier a post is filled at: 0 for vacant, 1 to 3 otherwise.
 *
 * Not `ownedTier` from `tuning.ts`, and the difference is real rather than
 * duplication. That function counts how many rungs of a track appear in a list
 * of things bought, because a pension track *is* a set of purchases. A post is
 * one thing that gets promoted — there is only ever one Filing Clerk — so the
 * registry stores a rank, and reading it is reading a field.
 */
export function staffTier(registry: Registry, role: StaffRole): number {
  const member = registry.staff.find((entry) => entry.role === role);
  if (!member) return 0;
  // Registries written before promotions existed have no tier at all.
  return member.tier ?? 1;
}

export function staffRung(role: StaffRole, tier: number): StaffRung | undefined {
  return STAFF_LADDER.find((rung) => rung.track === role && rung.tier === tier);
}

/** The promotion available next, or null when the post is at the top. */
export function nextStaffRung(registry: Registry, role: StaffRole): StaffRung | null {
  return staffRung(role, staffTier(registry, role) + 1) ?? null;
}

/** The post's current title. Vacant posts read as the appointment they'd be. */
export function staffTitle(registry: Registry, role: StaffRole): string {
  return staffRung(role, Math.max(1, staffTier(registry, role)))?.label ?? role;
}

export function isHired(registry: Registry, role: StaffRole): boolean {
  return staffTier(registry, role) > 0;
}

export function policyOf(registry: Registry, role: StaffRole): number | null {
  return registry.staff.find((member) => member.role === role)?.policy ?? null;
}

/**
 * Gold per minute for everyone on the books, at the tier they hold.
 *
 * Departmental Patronage is applied here rather than at the call site so that
 * every reader of the payroll — the wage charge, the Ledger heading, the
 * harness — agrees about what the officer actually pays. Rounded up, so a
 * department can never become free while still working.
 */
export function payrollPerTick(
  registry: Registry,
  commendations: readonly CommendationId[] = [],
): number {
  const gross = registry.staff.reduce(
    (total, member) => total + (staffRung(member.role, member.tier ?? 1)?.upkeep ?? 0),
    0,
  );
  return gross === 0 ? 0 : Math.max(1, Math.ceil(gross * payrollShare(commendations)));
}

/**
 * What the Filing Clerk gets over book value, as a multiplier.
 *
 * Deliberately above 1 rather than "sells at the day's demand". Demand is
 * centred on par, so paying market rates would average exactly book value and
 * the promotion would buy variance instead of income — an upgrade whose benefit
 * you cannot feel is not an upgrade.
 */
export function clerkRealisation(tier: number): number {
  return [1, 1, 1.08, 1.18][Math.min(3, Math.max(0, tier))];
}

/** Rungs the Junior Officer clears in one visit. */
export function officerThroughput(tier: number): number {
  return [0, 1, 3, Number.POSITIVE_INFINITY][Math.min(3, Math.max(0, tier))];
}

/** What the officer pays for a rung, as a share of its listed cost. */
export function officerDiscount(tier: number): number {
  return [1, 1, 0.95, 0.88][Math.min(3, Math.max(0, tier))];
}

/** What the Archivist pays of a form's gold fee. */
export function archivistFeeShare(tier: number): number {
  return [1, 1, 0.7, 0.45][Math.min(3, Math.max(0, tier))];
}

/** Forms the Archivist files in one visit. */
export function archivistThroughput(tier: number): number {
  return [0, 1, 2, 2][Math.min(3, Math.max(0, tier))];
}

/** Union Standing the Archivist saves per form. Never below one. */
export function archivistStandingRelief(tier: number): number {
  return tier >= 3 ? 1 : 0;
}

/** Clamped to the role's own range, so a stale client cannot file nonsense. */
export function clampPolicy(role: StaffRole, value: number): number {
  const spec = staffSpec(role);
  if (!spec) return 0;
  if (!Number.isFinite(value)) return spec.policyDefault;
  return Math.max(spec.policyMin, Math.min(spec.policyMax, Math.round(value)));
}

export const EMPTY_REGISTRY: Registry = { staff: [], spent: 0, unpaid: false };
