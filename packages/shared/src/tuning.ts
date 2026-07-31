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

/** Floors beyond their grade the Authority will authorise a recruit to work. */
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
 * Pension banked on death.
 *
 * It accrues with *service*, which is both what the word means and the only
 * formulation that survives contact with players. Paying out on final state
 * alone made dying profitable: a reckless officer could farm twenty short
 * deaths an hour and out-earn a careful one who never lost anybody. Under
 * service accrual a recruit who lived forty minutes is worth almost nothing,
 * and a long career on deep floors is worth a great deal.
 */
export function pensionAward(
  serviceTicks: number,
  depthReached: number,
  goldHandled: number,
  unlocks: readonly UnlockId[] = [],
): number {
  const service = Math.max(0, serviceTicks);
  const depthFactor = 1 + depthReached * 0.3;
  const credit = SERVICE_CREDIT_BY_TIER[unlockTier(unlocks, 'service')];
  return Math.round((service * 0.06 * depthFactor + goldHandled * 0.4) * credit);
}

export function xpForLevel(level: number): number {
  return 55 * level * level;
}

/**
 * A successor is assigned at comparable grade rather than off the street.
 *
 * Resetting to Grade I made death a spiral: an aggressive officer died, came
 * back weaker, and died faster. Halving the grade keeps death a setback with
 * real teeth while leaving a way back up.
 */
export function inheritedLevel(previousLevel: number): number {
  return Math.max(1, Math.floor((previousLevel * 2) / 3));
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

export function maxHpForLevel(level: number): number {
  return STARTING_HP + (level - 1) * 11;
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
export const UNLOCK_CATALOGUE = [
  { id: 'permits1', track: 'permits', tier: 1, label: 'Expedited Permit Processing I', detail: 'Permits clear in 90 minutes instead of 180.', cost: 1200 },
  { id: 'permits2', track: 'permits', tier: 2, label: 'Expedited Permit Processing II', detail: 'Permits clear in 60 minutes.', cost: 3600 },
  { id: 'permits3', track: 'permits', tier: 3, label: 'Expedited Permit Processing III', detail: 'Permits clear in 35 minutes.', cost: 11000 },

  { id: 'recruit1', track: 'recruit', tier: 1, label: 'Improved Intake I', detail: 'New recruits start at Grade 2.', cost: 1800 },
  { id: 'recruit2', track: 'recruit', tier: 2, label: 'Improved Intake II', detail: 'New recruits start at Grade 4.', cost: 5200 },
  { id: 'recruit3', track: 'recruit', tier: 3, label: 'Improved Intake III', detail: 'New recruits start at Grade 7.', cost: 15000 },

  { id: 'estate1', track: 'estate', tier: 1, label: 'Estate Settlement I', detail: 'Successors inherit 120 gold of effects.', cost: 2200 },
  { id: 'estate2', track: 'estate', tier: 2, label: 'Estate Settlement II', detail: 'Successors inherit 400 gold of effects.', cost: 6000 },
  { id: 'estate3', track: 'estate', tier: 3, label: 'Estate Settlement III', detail: 'Successors inherit 1100 gold of effects.', cost: 17000 },

  { id: 'stipend1', track: 'stipend', tier: 1, label: 'Hardship Stipend I', detail: '+2 gold per minute, unconditionally.', cost: 1600 },
  { id: 'stipend2', track: 'stipend', tier: 2, label: 'Hardship Stipend II', detail: '+5 gold per minute.', cost: 4800 },
  { id: 'stipend3', track: 'stipend', tier: 3, label: 'Hardship Stipend III', detail: '+11 gold per minute.', cost: 14000 },

  { id: 'cabinet1', track: 'cabinet', tier: 1, label: 'Filing Cabinet Extension I', detail: 'Four more stacks (16 total).', cost: 1400 },
  { id: 'cabinet2', track: 'cabinet', tier: 2, label: 'Filing Cabinet Extension II', detail: 'Four more stacks (20 total).', cost: 4200 },
  { id: 'cabinet3', track: 'cabinet', tier: 3, label: 'Filing Cabinet Extension III', detail: 'Six more stacks (26 total).', cost: 12000 },

  { id: 'service1', track: 'service', tier: 1, label: 'Service Credit I', detail: 'Pensions accrue 20% faster.', cost: 2600 },
  { id: 'service2', track: 'service', tier: 2, label: 'Service Credit II', detail: 'Pensions accrue 45% faster.', cost: 7500 },
  { id: 'service3', track: 'service', tier: 3, label: 'Service Credit III', detail: 'Pensions accrue 80% faster.', cost: 21000 },

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

  { id: 'journal1', track: 'journal', tier: 1, label: 'Extended Journal Retention I', detail: 'The journal keeps 150 lines instead of 60.', cost: 600 },
  { id: 'journal2', track: 'journal', tier: 2, label: 'Extended Journal Retention II', detail: 'The journal keeps 400 lines.', cost: 6000 },

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
 * Journal lines retained, indexed by owned tier.
 *
 * Sixty lines is about a day of play, which is exactly long enough for a
 * returning player to find the run they wanted to read about already gone.
 */
export const JOURNAL_LINES_BY_TIER = [60, 150, 400] as const;

export function journalLines(owned: readonly RequisitionId[]): number {
  return JOURNAL_LINES_BY_TIER[requisitionTier(owned, 'journal')];
}

/** Hard ceiling on a bulk filing, so one form can never be an unbounded query. */
export const BULK_FILING_MAX_STACKS = 64;
