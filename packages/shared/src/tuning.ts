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

/** Pension banked on death: the meta-currency (spec's `pensions` table). */
export function pensionAward(goldHandled: number, depthReached: number): number {
  return Math.round(goldHandled * 1.4 + depthReached * 60);
}

export function xpForLevel(level: number): number {
  return 40 * level * level;
}

export function maxHpForLevel(level: number): number {
  return STARTING_HP + (level - 1) * 9;
}

export const UNLOCK_CATALOGUE = [
  { id: 'permits', label: 'Faster Permit Processing (Tier I)', cost: 1200 },
  { id: 'recruit', label: 'Better Starting Recruit (Tier I)', cost: 1800 },
  { id: 'inherit', label: 'Inherited Gear Slot', cost: 2200 },
  { id: 'green', label: 'Monitor Swap: Green Phosphor', cost: 900 },
  { id: 'stipend', label: 'Passive Gold Stipend (+2/tick)', cost: 1600 },
] as const;

/** Gold per tick granted by the stipend unlock. */
export const STIPEND_PER_TICK = 2;

/** Ticks a permit application spends "processing" before it clears. */
export const PERMIT_PROCESSING_TICKS = 45;
export const PERMIT_PROCESSING_TICKS_FAST = 20;
