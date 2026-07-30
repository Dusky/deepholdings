/**
 * Lazy resolution: the whole point of the architecture.
 *
 * Nothing runs per-player between requests. When a client shows up we replay
 * the ticks it missed, deterministically, and write the resulting journal. The
 * same span resolved twice produces the same result, because every roll is
 * keyed on (character id, tick) rather than on call order or wall-clock.
 */
import {
  MAX_CATCHUP_TICKS,
  MAX_DEPTH,
  PERMIT_PROCESSING_TICKS,
  PERMIT_PROCESSING_TICKS_FAST,
  STIPEND_PER_TICK,
  TICK_SECONDS,
  makeRng,
  pensionAward,
  rngChance,
  rngInt,
  rngPick,
  tickSeed,
  type Character,
  type StandingOrders,
  type UnlockId,
} from '@deepholdings/shared';
import { applyLevelUps, permitLimit } from './character.js';
import {
  COMBAT_DEATH_CAUSES,
  COMBAT_NOTES,
  DEATH_CAUSES,
  FAUNA,
  HOARD_NOTE,
  INSURE_NOTE,
  LOOT_BY_PRIORITY,
  LOOT_NOTES,
  RECESS_NOTE,
  RESUPPLY_NOTE,
} from './flavor.js';

export interface PendingJournalEntry {
  tick: number;
  at: Date;
  text: string;
}

export interface DeathOutcome {
  cause: string;
  depth: number;
  goldHandled: number;
  pensionAwarded: number;
  atTick: number;
}

export interface ResolveResult {
  character: Character;
  journal: PendingJournalEntry[];
  death: DeathOutcome | null;
  /** Carried back to storage so a stalled permit keeps processing. */
  permitAppliedTick: number | null;
  /** Ticks actually simulated, after any catch-up clamp. */
  ticksResolved: number;
}

export interface ResolveOptions {
  character: Character;
  orders: StandingOrders;
  unlocks: readonly UnlockId[];
  /** Absolute tick index for "now". */
  toTick: number;
  /** Permit application watermark, carried between resolutions. */
  permitAppliedTick: number | null;
}

export function tickOf(date: Date): number {
  return Math.floor(date.getTime() / (TICK_SECONDS * 1000));
}

export function tickToDate(tick: number): Date {
  return new Date(tick * TICK_SECONDS * 1000);
}

const SUPPLY_DRAIN_TICKS = 12;
const RESUPPLY_COST_PER_UNIT = 6;
const INSURANCE_PREMIUM_PER_TICK = 1;
const INSURANCE_PENSION_BONUS = 1.25;

/** Deeper floors hit harder; this is the only difficulty curve there is. */
function encounterDamage(depth: number, roll: number): number {
  return Math.max(1, Math.round((3 + depth * 1.6) * (0.6 + roll * 0.8)));
}

function encounterReward(depth: number, roll: number): number {
  return Math.round((8 + depth * 6) * (0.5 + roll));
}

export function resolve(options: ResolveOptions): ResolveResult {
  const character: Character = { ...options.character };
  const { orders, unlocks } = options;
  const journal: PendingJournalEntry[] = [];
  let death: DeathOutcome | null = null;
  let permitAppliedTick = options.permitAppliedTick;

  if (!character.alive) {
    return { character, journal, death: null, permitAppliedTick, ticksResolved: 0 };
  }

  let fromTick = character.lastResolvedTick + 1;
  const toTick = options.toTick;
  if (toTick < fromTick) {
    return { character, journal, death: null, permitAppliedTick, ticksResolved: 0 };
  }

  // A player gone for a month gets a readable summary, not 40,000 lines.
  if (toTick - fromTick + 1 > MAX_CATCHUP_TICKS) {
    fromTick = toTick - MAX_CATCHUP_TICKS + 1;
    journal.push({ tick: fromTick - 1, at: tickToDate(fromTick - 1), text: RECESS_NOTE });
  }

  const hasStipend = unlocks.includes('stipend');
  const fastPermits = unlocks.includes('permits');
  const processingTicks = fastPermits ? PERMIT_PROCESSING_TICKS_FAST : PERMIT_PROCESSING_TICKS;
  const targetDepth = Math.min(Math.max(1, orders.targetDepth), MAX_DEPTH);
  const retreatHp = () => Math.ceil((character.maxHp * orders.retreatPct) / 100);

  const log = (tick: number, text: string) => {
    journal.push({ tick, at: tickToDate(tick), text });
  };

  let ticksResolved = 0;

  for (let tick = fromTick; tick <= toTick; tick += 1) {
    ticksResolved += 1;
    const rng = makeRng(tickSeed(character.id, tick));

    if (hasStipend) character.gold += STIPEND_PER_TICK;

    // Permit processing clears on its own schedule, wherever the recruit is.
    if (permitAppliedTick !== null && tick - permitAppliedTick >= processingTicks) {
      character.permitTier += 1;
      permitAppliedTick = null;
      log(tick, `Permit D-${character.permitTier} approved. Descent authorized to Depth ${permitLimit(character.permitTier)}.`);
    }

    // 1. Retreat threshold wins over everything else.
    if (character.hp <= retreatHp() && character.depth > 0) {
      character.depth -= 1;
      character.hp = Math.min(character.maxHp, character.hp + Math.round(character.maxHp * 0.06));
      if (character.depth === 0) {
        log(tick, `Ascended to surface at ${Math.round((character.hp / character.maxHp) * 100)}% HP. Logged against your quarterly bravery metric.`);
      }
      continue;
    }

    // 2. Resting at the surface: recover, resupply per spend policy.
    if (character.depth === 0 && character.hp < character.maxHp) {
      character.hp = Math.min(character.maxHp, character.hp + Math.round(character.maxHp * 0.04));
      if (character.hp >= character.maxHp) {
        log(tick, 'Rest concluded at Depot 3. Standing orders unchanged.');
      }
      if (orders.spendPolicy === 'resupply' && character.supplies < 6) {
        const affordable = Math.floor(character.gold / RESUPPLY_COST_PER_UNIT);
        const wanted = 12 - character.supplies;
        const bought = Math.min(affordable, wanted);
        if (bought > 0) {
          character.supplies += bought;
          character.gold -= bought * RESUPPLY_COST_PER_UNIT;
          log(tick, `${RESUPPLY_NOTE} ${bought} supplies, ${bought * RESUPPLY_COST_PER_UNIT} gold.`);
        }
      }
      continue;
    }

    // 3. Permit ceiling: the descent stalls, the paperwork begins.
    const limit = permitLimit(character.permitTier);
    if (character.depth >= limit && targetDepth > limit) {
      if (permitAppliedTick === null) {
        permitAppliedTick = tick;
        log(tick, `Depth ${limit + 1} reached. Permit D-${character.permitTier} does not cover Depth ${limit + 1}. Descent halted pending Permit D-${character.permitTier + 1}.`);
        log(tick, `Permit D-${character.permitTier + 1} application filed. Estimated processing: 2-4 business days.`);
      }
      if (orders.spendPolicy === 'insure' && character.gold >= INSURANCE_PREMIUM_PER_TICK) {
        character.gold -= INSURANCE_PREMIUM_PER_TICK;
      }
      continue;
    }

    // 4. Descend toward the ordered depth.
    if (character.depth < Math.min(targetDepth, limit)) {
      character.depth += 1;
      log(tick, `Descending. Floor ${character.depth} reached. Permit D-${character.permitTier} verified.`);
    }

    // 5. Delving: supplies burn, things happen.
    if (tick % SUPPLY_DRAIN_TICKS === 0) {
      character.supplies = Math.max(0, character.supplies - 1);
    }
    if (character.supplies === 0 && rngChance(rng, 0.3)) {
      character.hp -= Math.max(1, Math.round(character.maxHp * 0.04));
      log(tick, 'Descending unsupplied. Class C filing violation noted. Condition deteriorating.');
    }
    if (orders.spendPolicy === 'insure' && character.gold >= INSURANCE_PREMIUM_PER_TICK) {
      character.gold -= INSURANCE_PREMIUM_PER_TICK;
      if (tick % 120 === 0) log(tick, INSURE_NOTE);
    }
    if (orders.spendPolicy === 'hoard' && character.supplies === 0 && tick % 60 === 0) {
      log(tick, HOARD_NOTE);
    }

    if (rngChance(rng, 0.28)) {
      const creature = rngPick(rng, FAUNA);
      const damage = encounterDamage(character.depth, rng());
      character.hp -= damage;
      character.xp += 6 + character.depth * 3;

      if (character.hp <= 0) {
        const cause: string =
          character.supplies === 0 ? DEATH_CAUSES[4] : rngPick(rng, COMBAT_DEATH_CAUSES);
        const insured = orders.spendPolicy === 'insure';
        const award = Math.round(
          pensionAward(character.gold, character.depth) * (insured ? INSURANCE_PENSION_BONUS : 1),
        );
        character.hp = 0;
        character.alive = false;
        death = {
          cause,
          depth: character.depth,
          goldHandled: character.gold,
          pensionAwarded: award,
          atTick: tick,
        };
        log(tick, `Encountered: ${creature}. Combat not resolved.`);
        log(tick, `${character.name} died on Floor ${character.depth}. Cause of death: ${cause}. Next of kin notified by form letter.`);
        character.lastResolvedTick = tick;
        return { character, journal, death, permitAppliedTick, ticksResolved };
      }

      log(tick, `Encountered: ${creature}. ${rngPick(rng, COMBAT_NOTES)}`);

      if (rngChance(rng, 0.45)) {
        const item = rngPick(rng, LOOT_BY_PRIORITY[orders.lootPriority]);
        const value = encounterReward(character.depth, rng());
        character.gold += value;
        log(tick, `Acquired: ${item}. ${rngPick(rng, LOOT_NOTES)}`);
      } else if (rngChance(rng, 0.3)) {
        log(tick, `Loot priority: ${orders.lootPriority}. Nothing recovered. Complaint filed against the floor.`);
      }

      const levels = applyLevelUps(character);
      if (levels > 0) {
        log(tick, `Grade review passed. Now Level ${character.level}. Union Standing +${levels}.`);
      }
    } else if (rngChance(rng, 0.04)) {
      character.gold += rngInt(rng, 1, 4 + character.depth);
      log(tick, 'Uneventful shift. Per diem claimed.');
    }
  }

  character.lastResolvedTick = toTick;
  return { character, journal, death, permitAppliedTick, ticksResolved };
}

export { permitLimit };
export const RESOLVE_INTERNALS = {
  SUPPLY_DRAIN_TICKS,
  RESUPPLY_COST_PER_UNIT,
  INSURANCE_PENSION_BONUS,
};
