/**
 * Every balance number in one place. The server is the only thing that acts on
 * these; the client may read them to render honest ETAs.
 */

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

/** Permit D-{tier} authorises descent to this depth. */
export const PERMIT_DEPTH_LIMIT: Record<number, number> = {
  1: 2,
  2: 3,
  3: 5,
  4: 6,
  5: 6,
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
): number {
  const service = Math.max(0, serviceTicks);
  const depthFactor = 1 + depthReached * 0.3;
  return Math.round(service * 0.06 * depthFactor + goldHandled * 0.4);
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

export const UNLOCK_CATALOGUE = [
  { id: 'permits', label: 'Faster Permit Processing (Tier I)', cost: 1200 },
  { id: 'recruit', label: 'Better Starting Recruit (Tier I)', cost: 1800 },
  { id: 'inherit', label: 'Inherited Gear Slot', cost: 2200 },
  { id: 'green', label: 'Monitor Swap: Green Phosphor', cost: 900 },
  { id: 'stipend', label: 'Passive Gold Stipend (+2/tick)', cost: 1600 },
] as const;

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
export const INVENTORY_CAP = 12;

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

/** Gold per tick granted by the stipend unlock. */
export const STIPEND_PER_TICK = 2;

/** Ticks a permit application spends "processing" before it clears. */
export const PERMIT_PROCESSING_TICKS = 180;
export const PERMIT_PROCESSING_TICKS_FAST = 90;
