/**
 * Every balance number in one place. The server is the only thing that acts on
 * these; the client may read them to render honest ETAs.
 */
import type {
  RequisitionId,
  RequisitionTrack,
  UnlockId,
  UnlockTrack,
} from './domain.js';
import { endowmentMultiplier, type CommendationId } from './transfer.js';

/** One resolution tick per minute of real time. */
export const TICK_SECONDS = 60;

/**
 * Catch-up ceiling. Beyond this the recruit is treated as having observed
 * mandatory recess — it caps a returning player's journal at something
 * readable and stops a month away from resolving into a wall of text.
 */
export const MAX_CATCHUP_TICKS = 720;

/** World heartbeat: shared state moves on this cadence (spec §3.2). */
export const HEARTBEAT_SECONDS = 300;

export const STARTING_GOLD = 50;
export const STARTING_SUPPLIES = 12;
export const STARTING_HP = 40;
export const STARTING_PERMIT_TIER = 1;

/**
 * Permits are issued against the case file, not the recruit — so a new recruit
 * inherits most of the clearance the office already granted. Re-climbing the
 * whole permit ladder after every death made death a wipe rather than a beat.
 */
export function inheritedPermitTier(previousTier: number): number {
  return Math.max(STARTING_PERMIT_TIER, previousTier - 1);
}

/**
 * Permit D-{tier} authorises descent to this depth.
 *
 * Every rung must authorise something. D-5 used to grant Depth 6, exactly what
 * D-4 already granted, so an officer waited three hours to be told in writing
 * that nothing had changed — a milestone that is legibly worth nothing is worse
 * than no milestone, because the player did the work of noticing it.
 */
export const PERMIT_DEPTH_LIMIT: Record<number, number> = {
  1: 2,
  2: 3,
  3: 5,
  4: 6,
  5: 7,
  6: 8,
  7: 10,
  8: 12,
};

export const MAX_DEPTH = 12;

export function permitDepthLimit(permitTier: number): number {
  return PERMIT_DEPTH_LIMIT[permitTier] ?? MAX_DEPTH;
}

/**
 * Floors beyond their grade the Authority will authorise a recruit to work.
 *
 * Zero, and measured rather than assumed. Every positive value is a disaster:
 * at a stretch of one, balanced play goes from 1.7 deaths a week to 17 and
 * income falls by nearly half, because a flat stretch applies to a Grade I
 * recruit on their first morning as readily as to a veteran. Working below
 * your grade is the right *idea* for aggressive orders — it is just not
 * something that can be granted to everyone at once.
 *
 * Consequence worth stating plainly: with this at zero, `authorisedDepth`
 * clamps depth to grade, so `gradeMismatchMultiplier` can never return
 * anything but 1. The penalty is unreachable. It is kept because it is the
 * mechanism any future version of stretch would use, not because it fires.
 */
export const GRADE_STRETCH = 0;

/**
 * Where the recruit is actually authorised to be.
 *
 * Target Depth is an aspiration, not an instruction to walk to Floor 12 on the
 * first morning. The recruit works up to it as their grade and permits allow,
 * which is both the correct reading of a standing order and the thing that
 * stops a fresh recruit dying on arrival — the death spiral that made
 * aggressive play strictly worse than timid play.
 */
export function authorisedDepth(targetDepth: number, permitTier: number, level: number): number {
  return Math.min(targetDepth, permitDepthLimit(permitTier), level + GRADE_STRETCH, MAX_DEPTH);
}

/**
 * Grade earned beyond the deepest floor the Authority will ever authorise.
 *
 * `authorisedDepth` clamps at `MAX_DEPTH`, so from the moment a recruit passes
 * Grade 12 the `level` term can never bind again. The ninety-day run measured
 * the consequence: a median Grade of **46** at day 90, on a stat line where
 * Grade is the most prominent number, having changed nothing since about day
 * four. A number that visibly climbs while doing nothing is worse than no
 * number — it is a progress bar wired to a disconnected motor.
 *
 * Seniority is what that surplus becomes. It is deliberately *not* another
 * source of power: the ninety-day run also showed that the game's problem is
 * a shortage of new things, and adding survivability to a late-game recruit
 * would suppress the death loop that produces most of the remaining events.
 * It feeds case-file quality instead — an axis already hard-capped in
 * `items.ts`, so it cannot inflate past a known ceiling however long a career
 * runs.
 *
 * In the fiction it is the obvious reading: a senior officer's requisitions
 * get looked at by somebody more senior too.
 */
export function seniority(level: number): number {
  return Math.max(0, level - MAX_DEPTH);
}

/**
 * Grades of case-file quality one full career of surplus seniority is worth.
 * Small on purpose: the ceiling is Grade V, and seniority should shift the
 * distribution rather than guarantee the top of it.
 */
export const SENIORITY_GRADE_DIVISOR = 14;

export function seniorityGradeBonus(level: number): number {
  return Math.min(1.5, seniority(level) / SENIORITY_GRADE_DIVISOR);
}

/**
 * Pension banked on death.
 *
 * It accrues with *service*, which is both what the word means and the only
 * formulation that survives contact with players. Paying out on final state
 * alone made dying profitable: a reckless officer could farm twenty short
 * deaths an hour and out-earn a careful one who never lost anybody. Under
 * service accrual a recruit who lived forty minutes is worth almost nothing,
 * and a long career on deep floors is worth a great deal.
 *
 * ## The above was false for months, and it was measured
 *
 * The formula shipped as `service * 0.06 * depthFactor + goldHandled * 0.4`,
 * and over ninety days the two terms came out at **35,219 against 909,861**.
 * The estate was 96.3% of every award. Service was a rounding error, the
 * comment described a design nobody had implemented, and the anti-farming
 * property it claimed held only by accident — a recruit who died in forty
 * minutes was cheap because they had not accumulated an *estate* either.
 *
 * That mattered well beyond this function, because paying out on the estate
 * makes **every gold sink a pension tax**. Gold spent is gold not in the purse
 * at death, so a recurring cost took 0.4 of itself in pension on top of its
 * face price, and the loss compounded through Service Credit. A department at
 * six gold a minute cost 35% of lifetime pension. Requisitions never showed it
 * because they are bought once. It priced every future system before it was
 * designed, which is a bad thing for a formula to be doing quietly.
 *
 * ## What it is now
 *
 * The two currencies are separated. **Gold is the economy**: earn it, spend it,
 * and spending costs nothing but the gold. **Pension is time and depth**: it
 * accrues by the minute at a rate set by how deep the officer is willing to
 * operate. That is what the word "pension" meant all along.
 *
 * The estate term is reduced rather than removed, which was the alternative.
 * Zero would have made the purse at death worth nothing, and with it the
 * `hoard` spend policy, `HOARD_SALE_BONUS`, and the `insure` bonus — three
 * systems whose entire payoff is a larger estate. A tenth keeps a good haul
 * worth having and leaves a recurring sink costing 10% over its face, which is
 * a drag a wage ought to have rather than one that dominates it.
 *
 * The depth factor nearly doubles at the same time, and has to. Once the award
 * is mostly service, depth is the *only* lever an officer has on the rate, and
 * at `0.3` a timid officer on Floor 2 banked 35% of what a Floor 12 officer did
 * for taking none of the risk. At `0.55` the spread is 2.2x to 7.6x.
 *
 * Calibrated so lifetime pension over ninety days lands where it already was —
 * about 1.55M. The shape changes; the total does not, so every number measured
 * against it stays comparable.
 */
export const PENSION_SERVICE_RATE = 0.75;
export const PENSION_DEPTH_FACTOR = 0.55;
export const PENSION_ESTATE_RATE = 0.1;

export function pensionAward(
  serviceTicks: number,
  depthReached: number,
  goldHandled: number,
  unlocks: readonly UnlockId[] = [],
  /**
   * Commendations, which outlive the pension they multiply.
   *
   * Last and optional so that every existing call site keeps meaning what it
   * meant — an officer who has never filed for a transfer — rather than
   * silently becoming a different measurement.
   */
  commendations: readonly CommendationId[] = [],
): number {
  const service = Math.max(0, serviceTicks);
  const depthFactor = 1 + depthReached * PENSION_DEPTH_FACTOR;
  const credit = SERVICE_CREDIT_BY_TIER[unlockTier(unlocks, 'service')];
  return Math.round(
    (service * PENSION_SERVICE_RATE * depthFactor + goldHandled * PENSION_ESTATE_RATE) *
      credit *
      endowmentMultiplier(commendations),
  );
}

export function xpForLevel(level: number): number {
  return 55 * level * level;
}

/**
 * A successor is assigned at comparable grade rather than off the street.
 *
 * Resetting to Grade I made death a spiral: an aggressive officer died, came
 * back weaker, and died faster. Keeping most of the grade makes death a
 * setback with real teeth while leaving a way back up.
 *
 * **How much is kept scales with the floor the last recruit reached**, and
 * that is what makes deep play viable rather than merely expensive. A flat
 * two-thirds meant an officer who ordered Floor 9 died at Floor 5, came back
 * three grades down, and never got deep enough to earn what depth pays — they
 * were charged the price of ambition and never delivered the goods. Losing
 * somebody on Floor 10 now says something about the case file that losing
 * somebody in the entrance corridor does not, so the Authority sends a better
 * replacement.
 *
 * It also keeps the incentive pointing the right way: dying deep is still
 * worse than not dying, because the successor starts at Depth 0 either way
 * and has to walk back down.
 */
export const INHERIT_BASE = 0.55;
export const INHERIT_PER_DEPTH = 0.04;

export function inheritedLevel(previousLevel: number, depthReached = 0): number {
  const share = Math.min(1, INHERIT_BASE + Math.max(0, depthReached) * INHERIT_PER_DEPTH);
  return Math.max(1, Math.floor(previousLevel * share));
}

/**
 * Rare, and worse than the cap allows.
 *
 * Without a tail, death becomes a pure function of the retreat threshold: set
 * it above the hit cap and a recruit is arithmetically immortal, which hides
 * the entire prestige loop from anyone who never moves the slider. A grievous
 * hit means any officer can lose a recruit eventually, and a reckless one
 * loses them constantly.
 */
export const GRIEVOUS_CHANCE = 0.03;
export const GRIEVOUS_MULTIPLIER = 1.7;
export const GRIEVOUS_MAX_FRACTION = 0.6;

/**
 * Danger comes from working below your grade, not from depth alone. A Grade 3
 * recruit on Floor 9 is six floors out of their depth, and the Authority has
 * opinions about that. This is the knob that makes Target Depth a decision
 * rather than a slider you push to the right.
 */
export function gradeMismatchMultiplier(depth: number, level: number): number {
  return 1 + Math.max(0, depth - level) * 0.3;
}

/**
 * Maximum HP, and the ceiling that keeps the game from ending itself.
 *
 * **Capped at the grade that matches the deepest floor.** Danger scales with
 * *depth*, which stops at `MAX_DEPTH`; this used to scale with *grade*, which
 * stops at nothing. A ninety-day run measured where that goes:
 *
 * ```
 * days  0-14   deaths 8   pension 67,344
 * days 14-28   deaths 0   pension      0
 * days 28-42   deaths 0   pension      0
 * ```
 *
 * The recruit simply stopped dying. Death is the only source of pension,
 * pension is the only currency the prestige ladders take, so progression
 * halted permanently on about day fourteen and never resumed. The game was
 * not out of content — it had locked the player out of the content it had.
 *
 * The arithmetic, which is worth writing down because it is the same shape as
 * the retreat-threshold bug this file already records: the worst possible
 * single blow is a grievous hit at Floor 12, about 97 damage. A recruit
 * retreats at `retreatPct` of maximum. At Grade 30 that threshold is 126 — so
 * from any point above it, nothing in the game can kill them.
 *
 * So grade stops buying survivability at the point the Authority will not
 * authorise a deeper floor anyway. Past that it buys `seniority` instead,
 * which shifts case-file quality and cannot inflate past a hard cap. A recruit
 * at Grade 40 is *better* than one at Grade 12; they are not *safer*.
 */
export function maxHpForLevel(level: number): number {
  return STARTING_HP + (Math.min(level, MAX_DEPTH) - 1) * 11;
}

/**
 * A single blow can never take more than this share of a recruit's maximum.
 *
 * The cap exists so a deep floor cannot one-shot a healthy recruit — that
 * reads as the retreat order being ignored rather than as a risk taken. But it
 * must stay *above* the retreat thresholds players actually use, or death
 * becomes arithmetically impossible and the prestige loop never fires. At 0.35
 * a recruit retreating at 60% is effectively safe, one retreating at 30% is
 * gambling, and one retreating at 5% is a formality.
 */
export const MAX_HIT_FRACTION = 0.35;

/**
 * The standing orders an officer starts with.
 *
 * These were a dead end, and the developer time machine is how that surfaced.
 * The old defaults — Target Depth 3, Retreat 28% — produced a career in which
 * **nothing changed between hour six and day twenty-nine**. Confirmed since on
 * a harness that drives the resolver directly, 20 careers × 14 days: zero
 * deaths in 20 of 20, zero pension in 20 of 20, Permit D-2 in all of them, and
 * three check-ins in five with nothing to show.
 *
 * The two mechanisms:
 *
 * - A permit is only applied for when the recruit *stalls*, and stalling needs
 *   the target to exceed the permit's limit. Target Depth 3 is exactly what
 *   Permit D-2 authorises, so after one promotion the recruit never stalled
 *   again, never applied again, and stayed on Floor 2 for a month.
 * - Retreat at 28% of maximum, on Floor 2, never kills anybody. No death means
 *   no pension, and pension is the only currency the prestige ladders take —
 *   so all nineteen unlocks stayed invisible for the entire run.
 *
 * Target Depth is an *aspiration*: `authorisedDepth` clamps it to the recruit's
 * grade and permit, so the default is the maximum. It means "as deep as I am
 * allowed", which is the only value that lets the permit ladder run its full
 * length. Anything lower silently truncates the ladder at that floor.
 *
 * Retreat is 35. The sweep behind it, 20 careers × 14 days per row:
 *
 * | retreat | deaths | pension | grade | permit | empty check-ins |
 * | --- | --- | --- | --- | --- | --- |
 * | 28 | 20.0 | 34,800 | 6 | D-5 | 0.0% |
 * | 32 | 16.1 | 42,800 | 7 | D-6 | 0.5% |
 * | 35 | 12.3 | 49,200 | 12 | D-8 | 6.1% |
 * | 38 | 6.8 | 49,200 | 17 | D-8 | 21.1% |
 * | 42 | 1.7 | 21,600 | 20 | D-8 | 36.3% |
 * | 45 | 1.1 | 7,100 | 20 | D-8 | 37.5% |
 *
 * Below 35 the recruit treads water — 20 deaths a fortnight at 28, and still
 * Grade 6 on Permit D-5, because deaths knock grade back faster than it
 * climbs. 35 and 38 tie on pension, and 35 wins on cadence by a factor of
 * three: an empty check-in about once a fortnight against three a week. Above
 * 42 the game goes quiet and careers start banking nothing at all — 4 in 20 at
 * retreat 42, 8 in 20 at 45.
 *
 * **The earlier justification for this same number was wrong**, and it is worth
 * knowing why, because it read as careful. It said 38 was *bimodal* — two
 * sampled careers in three never dying — and that above `MAX_HIT_FRACTION`
 * death collapses to the 3% grievous tail. Neither is true. Both came from
 * measurements taken through `/v1/dev/advance`, which wound the character
 * backwards against a fixed clock and so replayed one hour on a loop. The
 * sweep above is monotone in every column. See `docs/design/balance.md`.
 */
export const DEFAULT_ORDERS = {
  targetDepth: MAX_DEPTH,
  retreatPct: 35,
  lootPriority: 'gear',
  spendPolicy: 'resupply',
} as const;

/**
 * The usable ends of the Retreat Threshold slider.
 *
 * The control used to run 5–80, and a sweep at Target Depth 6 showed that most
 * of it was scenery:
 *
 * | retreat | 60 | 50 | 40 | 35 | 30 | 25 | 20 | 15 | 10 | 5 |
 * | deaths/wk | 0.0 | 0.0 | 0.0 | 0.2 | 1.7 | 9.2 | 17.4 | 27.6 | 49.4 | 148 |
 * | value/h | 279 | 279 | 281 | 280 | 271 | 212 | 154 | 116 | 96 | 108 |
 *
 * Below 10 the recruit dies before they can descend, which makes the numbers
 * non-monotonic nonsense rather than a harder difficulty. Above 45 nothing
 * moves. So the meaning of the slider lived in about twenty of its
 * seventy-five points, and 10–45 is where moving it changes something.
 *
 * **The reason for the top end was wrong.** It read: everything from 35 upward
 * is the same setting, because a recruit withdrawing above `MAX_HIT_FRACTION`
 * can only be reached by the rare grievous tail. The table above is at Target
 * Depth 6, where that is true of the *numbers* — but Target Depth is the
 * default now, and re-measured there (12 careers × 14 days per point) 35, 38,
 * 42 and 45 give 12.3, 6.8, 1.7 and 1.3 deaths a fortnight. Not one setting;
 * four. The genuine collapse starts near 55: retreat 60 and 80 are identical,
 * zero deaths in 12 of 12 with every career finishing Grade 21.
 *
 * 45 is still the right ceiling, for a better reason than sameness — it is
 * where careers begin banking nothing at all, 8 in 20 over a fortnight, and
 * beyond it the pension half of the game stops existing.
 */
export const RETREAT_MIN_PCT = 10;
export const RETREAT_MAX_PCT = 45;

/** Old orders were stored anywhere in 5–80; above 55 nothing changes. */
export function clampRetreatPct(pct: number): number {
  return Math.min(RETREAT_MAX_PCT, Math.max(RETREAT_MIN_PCT, Math.round(pct)));
}

/**
 * Prestige ladders.
 *
 * Every track is bought in order, so the Ledger only ever offers one rung per
 * track and there is always a visible next step. Costs roughly triple per tier:
 * the first is one or two recruits' work, the third is a project.
 *
 * Tier III of every functional track lands well beyond a fortnight of play,
 * which is the M4 exit criterion — a tester should still have something they
 * are working toward when the two weeks are up.
 */
/**
 * The prestige ladders.
 *
 * **Tier 2 and 3 costs were re-priced after the ninety-day run**, which found
 * that the entire nineteen-rung catalogue cost about 2.6 fortnights of
 * pension — and since income accelerates, a player bought seventeen of the
 * nineteen by day 19.2 and the game had nothing new left.
 *
 * Worse than the total was the *shape*. Pension only arrives in lumps, on
 * death, and the six tracks were priced in flat bands — so a payout that
 * crossed one tier threshold crossed all six at once. The measured timeline
 * was two rungs on day 1.7, then nothing for five and a half days, then
 * **eight rungs in the same minute**, then eight more empty days, then six
 * more at once. Nineteen unlocks was never too little content; it was being
 * paid out in three instalments.
 *
 * So the rungs within a tier are now spread far apart as well as raised. The
 * target is that one payout buys roughly one thing, which turns "everything
 * unlocked at once" into a sequence of choices about what to unlock first —
 * and that is scarcity creating decisions, not grind. The events are
 * identical; only what the player can afford at any moment has changed.
 */
export const UNLOCK_CATALOGUE = [
  { id: 'permits1', track: 'permits', tier: 1, label: 'Expedited Permit Processing I', detail: 'Permits clear in 90 minutes instead of 180.', cost: 1200 },
  { id: 'permits2', track: 'permits', tier: 2, label: 'Expedited Permit Processing II', detail: 'Permits clear in 60 minutes.', cost: 7000 },
  { id: 'permits3', track: 'permits', tier: 3, label: 'Expedited Permit Processing III', detail: 'Permits clear in 35 minutes.', cost: 41000 },

  { id: 'recruit1', track: 'recruit', tier: 1, label: 'Improved Intake I', detail: 'New recruits start at Grade 2.', cost: 1800 },
  { id: 'recruit2', track: 'recruit', tier: 2, label: 'Improved Intake II', detail: 'New recruits start at Grade 4.', cost: 11500 },
  { id: 'recruit3', track: 'recruit', tier: 3, label: 'Improved Intake III', detail: 'New recruits start at Grade 7.', cost: 62000 },

  { id: 'estate1', track: 'estate', tier: 1, label: 'Estate Settlement I', detail: 'Successors inherit 120 gold of effects.', cost: 2200 },
  { id: 'estate2', track: 'estate', tier: 2, label: 'Estate Settlement II', detail: 'Successors inherit 400 gold of effects.', cost: 13500 },
  { id: 'estate3', track: 'estate', tier: 3, label: 'Estate Settlement III', detail: 'Successors inherit 1100 gold of effects.', cost: 74000 },

  { id: 'stipend1', track: 'stipend', tier: 1, label: 'Hardship Stipend I', detail: '+2 gold per minute, unconditionally.', cost: 1600 },
  { id: 'stipend2', track: 'stipend', tier: 2, label: 'Hardship Stipend II', detail: '+5 gold per minute.', cost: 9000 },
  { id: 'stipend3', track: 'stipend', tier: 3, label: 'Hardship Stipend III', detail: '+11 gold per minute.', cost: 52000 },

  { id: 'cabinet1', track: 'cabinet', tier: 1, label: 'Filing Cabinet Extension I', detail: 'Four more stacks (16 total).', cost: 1400 },
  { id: 'cabinet2', track: 'cabinet', tier: 2, label: 'Filing Cabinet Extension II', detail: 'Four more stacks (20 total).', cost: 8000 },
  { id: 'cabinet3', track: 'cabinet', tier: 3, label: 'Filing Cabinet Extension III', detail: 'Six more stacks (26 total).', cost: 46000 },

  { id: 'service1', track: 'service', tier: 1, label: 'Service Credit I', detail: 'Pensions accrue 20% faster.', cost: 2600 },
  { id: 'service2', track: 'service', tier: 2, label: 'Service Credit II', detail: 'Pensions accrue 45% faster.', cost: 15500 },
  { id: 'service3', track: 'service', tier: 3, label: 'Service Credit III', detail: 'Pensions accrue 80% faster.', cost: 88000 },

  { id: 'phosphor1', track: 'phosphor', tier: 1, label: 'Monitor Swap: Green Phosphor', detail: 'Cosmetic. The Authority does not know why you want this.', cost: 900 },
] as const;

/** One rung of a ladder, whatever currency buys it. */
export interface LadderEntry<Id extends string, Track extends string> {
  readonly id: Id;
  readonly track: Track;
  readonly tier: number;
  readonly label: string;
  readonly detail: string;
  readonly cost: number;
}

/**
 * How many tiers of a track are owned. Every effect reads this, not an id —
 * so adding a tier is a catalogue edit rather than a hunt for `includes`.
 */
export function ownedTier<Id extends string, Track extends string>(
  catalogue: readonly LadderEntry<Id, Track>[],
  owned: readonly Id[],
  track: Track,
): number {
  let tier = 0;
  for (const entry of catalogue) {
    if (entry.track === track && owned.includes(entry.id)) tier = Math.max(tier, entry.tier);
  }
  return tier;
}

export function unlockTier(unlocks: readonly UnlockId[], track: UnlockTrack): number {
  return ownedTier(UNLOCK_CATALOGUE, unlocks, track);
}

/**
 * Per-tier effects, indexed by owned tier — index 0 is "not bought".
 *
 * Kept beside the catalogue so a balance change is one edit rather than a hunt
 * through the resolver.
 */
export const PERMIT_TICKS_BY_TIER = [180, 90, 60, 35] as const;
export const RECRUIT_GRADE_BY_TIER = [1, 2, 4, 7] as const;
export const ESTATE_GOLD_BY_TIER = [0, 120, 400, 1100] as const;
export const STIPEND_BY_TIER = [0, 2, 5, 11] as const;
export const CABINET_SLOTS_BY_TIER = [12, 16, 20, 26] as const;
export const SERVICE_CREDIT_BY_TIER = [1, 1.2, 1.45, 1.8] as const;

/**
 * What Loot Priority actually does.
 *
 * Until the crafting system lands this is the whole of its effect, and it has
 * to be a real trade or the knob is decoration: gold is the safe yield,
 * knowledge buys grade instead of coin, relics are a gamble, and gear splits
 * the difference. Crafting will layer clause pools on top without changing
 * these.
 */
export const LOOT_EFFECT = {
  gold: { value: 1.25, xp: 1, findChance: 1 },
  gear: { value: 1.1, xp: 1.1, findChance: 1 },
  relics: { value: 2.1, xp: 1, findChance: 0.55 },
  knowledge: { value: 0.8, xp: 1.35, findChance: 1 },
} as const;

/**
 * Distinct stacks a recruit can carry before the filing cabinet is full.
 *
 * At capacity, further loot is liquidated at depot rates rather than lost —
 * nothing a player earned ever evaporates. Extra capacity is the one storage
 * convenience we are willing to sell (see docs/design/monetization.md), and it
 * sells nothing but the choice of what to keep.
 */
export function cabinetSlots(unlocks: readonly UnlockId[]): number {
  return CABINET_SLOTS_BY_TIER[unlockTier(unlocks, 'cabinet')];
}

/**
 * Spend Policy: three genuinely different bargains.
 *
 * `hoard` was close to strictly worse — it saved gold and risked unsupplied
 * descent, which mostly just kills you. Holding out for the right buyer gives
 * it an edge to pay for that risk.
 */
export const HOARD_SALE_BONUS = 1.15;

/**
 * Market demand band: 0.8x to 1.2x book value, redrawn each world heartbeat.
 *
 * Wide enough that checking the market before clearing the cabinet is worth
 * doing, narrow enough that it never beats simply descending again. The band
 * is centred on par on purpose — an officer who ignores the market entirely
 * averages exactly book value, so timing is an option and never a tax on
 * people who don't want one.
 */
export const MARKET_DEMAND_FLOOR = 0.8;
export const MARKET_DEMAND_SPREAD = 0.4;

/** Ticks a permit application spends "processing" before it clears. */
export function permitProcessingTicks(unlocks: readonly UnlockId[]): number {
  return PERMIT_TICKS_BY_TIER[unlockTier(unlocks, 'permits')];
}

/**
 * Minimum service before Form R-1 (Voluntary Retirement) may be filed.
 *
 * Retirement is meant to replace suicide-by-standing-order as the way to
 * prestige, not to become a churn button: pensions accrue with service, so a
 * recruit retired at two hours has earned about two hours of pension. The floor
 * exists so the Ledger never shows a retirement offer that pays nothing.
 */
export const RETIREMENT_MIN_SERVICE_TICKS = 120;

/**
 * How often a long-serving recruit is reminded that Form R-1 exists.
 *
 * Twelve hours, matching the design's assumption of two check-ins a day.
 *
 * Death is otherwise the *only* way a pension ever appears, and whether it
 * appears is not something the officer controls. A cautious retreat threshold
 * is a legitimate way to play and it can run a long time without a funeral;
 * the officer should still be told what a separation is worth, with the
 * number, rather than having to guess the Ledger has one.
 *
 * **The measurement this constant was first justified by was wrong**, and the
 * correction is worth keeping because it explains why the reasoning above no
 * longer mentions rare events. It read: eight fourteen-day careers on the
 * default orders, deaths 0, 1, 2, 2, 6, 10, 10, 10, one career in eight
 * banking nothing — from which I concluded that death above `MAX_HIT_FRACTION`
 * collapses to the 3% grievous tail. Those careers were fast-forwarded through
 * `/v1/dev/advance`, which wound the character backwards against a fixed clock
 * and so replayed one hour on a loop. Re-measured against a clock that moves:
 * forty careers over a week bank a pension in forty of forty, at 4.75 deaths
 * each, agreeing with the resolver harness's 5.35 for the same orders and
 * span. Death at the default threshold is ordinary, not rare.
 *
 * The reminder stays anyway. It is not load-bearing for mortality, it is
 * load-bearing for *choice*: an officer who never sees the number never knows
 * retiring was an option.
 */
export const RETIREMENT_REMINDER_TICKS = 720;

/**
 * Requisitions: what gold buys, once supplies are paid for.
 *
 * Every entry is a tap-saver, a reading aid or a cosmetic. None of them changes
 * what the recruit does underground, and that is the test — if a requisition
 * would show up in the simulation harness as a different number, it is not a
 * requisition, it is power with a receipt.
 *
 * Costs are set against roughly 255 gold/hour of balanced play: a first rung is
 * three or four hours, and clearing the catalogue is several days of
 * deliberate saving. The first draft was a third of this and the harness
 * cleared all seven rungs inside a week on two different profiles — a sink
 * that empties is a purchase, not a decision.
 *
 * The point is not that it is expensive. It is that gold now competes with the
 * pension it would otherwise have converted into on Form R-1: buying the
 * catalogue costs a daily retirer about a quarter of their pension rate.
 */
export const REQUISITION_CATALOGUE = [
  { id: 'bulk1', track: 'bulk', tier: 1, label: 'Bulk Filing Authorisation I', detail: 'Sell an entire loot category on one form.', cost: 900 },
  { id: 'bulk2', track: 'bulk', tier: 2, label: 'Bulk Filing Authorisation II', detail: 'Also clear every stack under a value you set.', cost: 9000 },

  { id: 'index1', track: 'index', tier: 1, label: 'Cabinet Index I', detail: 'Sort the filing cabinet by value, category or demand.', cost: 700 },
  { id: 'index2', track: 'index', tier: 2, label: 'Cabinet Index II', detail: 'Filter to a single category, remembered between visits.', cost: 7000 },

  { id: 'journal1', track: 'journal', tier: 1, label: 'Extended Journal Retention I', detail: 'The Terminal opens with 150 lines instead of 60.', cost: 600 },
  { id: 'journal2', track: 'journal', tier: 2, label: 'Extended Journal Retention II', detail: 'The Terminal opens with 400 lines.', cost: 6000 },

  { id: 'readouts1', track: 'readouts', tier: 1, label: 'Pinned Readouts', detail: 'Depth and permit ETA stay on the strip, on every screen.', cost: 2500 },
] as const satisfies readonly LadderEntry<RequisitionId, RequisitionTrack>[];

export function requisitionTier(
  owned: readonly RequisitionId[],
  track: RequisitionTrack,
): number {
  return ownedTier(REQUISITION_CATALOGUE, owned, track);
}

export function hasRequisition(
  owned: readonly RequisitionId[],
  id: RequisitionId,
): boolean {
  return owned.includes(id);
}

/**
 * Journal lines the Terminal opens with, indexed by owned tier.
 *
 * Sixty is about a day of play, which is exactly long enough for a returning
 * player to have to go looking for the run they wanted to read about. Nothing
 * is deleted at any tier — paging back is free and unlimited for everyone, so
 * what this buys is arriving with more already on screen.
 */
export const JOURNAL_LINES_BY_TIER = [60, 150, 400] as const;

export function journalLines(owned: readonly RequisitionId[]): number {
  return JOURNAL_LINES_BY_TIER[requisitionTier(owned, 'journal')];
}

/**
 * Lines fetched per "earlier" request.
 *
 * Fixed for everybody. The requisition changes how much arrives without
 * asking; it does not change how much an officer may read.
 */
export const JOURNAL_PAGE_SIZE = 60;

/** Hard ceiling on a bulk filing, so one form can never be an unbounded query. */
export const BULK_FILING_MAX_STACKS = 64;

/**
 * Case files: how often one turns up, and how many a recruit can carry.
 *
 * Per *acquisition*, not per tick — a case file arrives instead of ordinary
 * loot, so this is a share of finds rather than a new source of them.
 *
 * **The first value here was twenty times too high**, and the mistake is worth
 * keeping because it is easy to repeat: 0.07 was chosen as "about one find in
 * fourteen", which sounds rare and is not. A recruit on Floor 8 has an
 * encounter about a third of all ticks and finds something on roughly half of
 * those, which is on the order of two hundred acquisitions a day — so one in
 * fourteen is forty case files a day, every stat cap pinned within hours, and
 * a balance run reporting zero deaths in thirty careers of thirty.
 *
 * A rate is not rare because the denominator sounds big. It is rare when the
 * measured count is small: these numbers put a case file at roughly two or
 * three a day at depth, which is a thing you read about rather than a feed.
 */
export const CASE_FILE_CHANCE_BASE = 0.004;
export const CASE_FILE_CHANCE_PER_DEPTH = 0.0005;
/**
 * Three, not six. Six carried files stacked up to twenty-four clauses, which
 * is how the first version of this reached +254 vigour and killed the death
 * loop outright. Three is a set the player can hold in their head, and it is
 * what the equipment slots in `crafting.md` were always going to be.
 */
export const CASE_FILE_SLOTS = 3;

/**
 * What Loot Priority does to case files, layered on top of `LOOT_EFFECT`
 * rather than replacing it.
 *
 * This is the knob's second job and the reason the crafting slice was worth
 * building before the forms: Loot Priority was measured as a real but small
 * trade — 4% of income for triple the pension rate — and "still thin" has been
 * the last open item on M4 for as long as M4 has existed.
 *
 *   find     multiplies the chance a find is a case file
 *   grade    added to the grade roll, so relics skew to better files
 *   riders   share of clauses drawn from the rider pool, where the drawbacks
 *            live. Relics are the gamble: better clauses, more strings.
 */
export const CASE_FILE_BIAS = {
  gold: { find: 0.5, grade: 0, riders: 0.2 },
  gear: { find: 1.6, grade: 0.4, riders: 0.3 },
  // `find` compounds with LOOT_EFFECT.findChance, and relics only finds
  // anything 55% as often — so a 1.3 bias made the *relic* hunter carry fewer
  // and worse case files than the gear hunter, which is the opposite of the
  // design. 2.4 puts its effective rate a little under gear's while the grade
  // bias keeps what it does find better: fewer, richer, and stringier.
  relics: { find: 2.4, grade: 1.1, riders: 0.6 },
  knowledge: { find: 0.9, grade: 0.6, riders: 0.25 },
} as const;

/** Case files are worth more than the stack they displaced. */
export const CASE_FILE_VALUE_MULTIPLIER = 3.2;
