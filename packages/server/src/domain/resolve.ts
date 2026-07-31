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
  GRIEVOUS_CHANCE,
  LOOT_EFFECT,
  GRIEVOUS_MAX_FRACTION,
  GRIEVOUS_MULTIPLIER,
  MAX_HIT_FRACTION,
  authorisedDepth,
  gradeMismatchMultiplier,
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

/** Counted as the resolver runs, so it describes what actually happened. */
export interface ResolveCounters {
  goldBefore: number;
  goldAfter: number;
  levelsGained: number;
  deepestFloor: number;
  encounters: number;
  acquisitions: number;
  permitsApproved: number;
  /** Ticks spent working under a permit ceiling, waiting on the office. */
  stalledTicks: number;
}

export interface ResolveResult {
  character: Character;
  counters: ResolveCounters;
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

const ENCOUNTER_CHANCE_BASE = 0.24;
const ENCOUNTER_CHANCE_PER_DEPTH = 0.012;
const SUPPLY_DRAIN_TICKS = 12;
const RESUPPLY_COST_PER_UNIT = 6;
const INSURANCE_PREMIUM_PER_TICK = 1;
const INSURANCE_PENSION_BONUS = 1.25;

/**
 * Deeper floors hit harder, but never harder than MAX_HIT_FRACTION of the
 * recruit's maximum in one blow. Depth is meant to be a risk the officer
 * accepts, not a coin flip that ignores their retreat order.
 */
function encounterDamage(
  depth: number,
  level: number,
  roll: number,
  maxHp: number,
  grievous: boolean,
): number {
  const raw =
    (2 + Math.pow(depth, 1.4) * 1.2) *
    gradeMismatchMultiplier(depth, level) *
    (0.6 + roll * 0.8) *
    (grievous ? GRIEVOUS_MULTIPLIER : 1);
  const cap = maxHp * (grievous ? GRIEVOUS_MAX_FRACTION : MAX_HIT_FRACTION);
  return Math.max(1, Math.round(Math.min(raw, cap)));
}

/**
 * Reward scales faster than danger. Damage is linear in depth; loot is
 * superlinear, so the deep floors are where the money is and the four knobs
 * become a real trade rather than a preference.
 */
function encounterReward(depth: number, roll: number): number {
  return Math.round((6 + Math.pow(depth, 1.5) * 4) * (0.5 + roll));
}

/** Experience follows the same shape, so depth is the fastest way to grade up. */
function encounterXp(depth: number): number {
  return Math.round(5 + Math.pow(depth, 1.4) * 2);
}

export function resolve(options: ResolveOptions): ResolveResult {
  const character: Character = { ...options.character };
  const { orders, unlocks } = options;
  const journal: PendingJournalEntry[] = [];
  let death: DeathOutcome | null = null;
  let permitAppliedTick = options.permitAppliedTick;

  const counters: ResolveCounters = {
    goldBefore: character.gold,
    goldAfter: character.gold,
    levelsGained: 0,
    deepestFloor: character.depth,
    encounters: 0,
    acquisitions: 0,
    permitsApproved: 0,
    stalledTicks: 0,
  };
  const finish = (): ResolveResult => {
    counters.goldAfter = character.gold;
    return { character, counters, journal, death, permitAppliedTick, ticksResolved };
  };

  let ticksResolved = 0;

  if (!character.alive) return finish();

  let fromTick = character.lastResolvedTick + 1;
  const toTick = options.toTick;
  if (toTick < fromTick) return finish();

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

  for (let tick = fromTick; tick <= toTick; tick += 1) {
    ticksResolved += 1;
    const rng = makeRng(tickSeed(character.id, tick));

    if (hasStipend) character.gold += STIPEND_PER_TICK;

    // Permit processing clears on its own schedule, wherever the recruit is.
    if (permitAppliedTick !== null && tick - permitAppliedTick >= processingTicks) {
      character.permitTier += 1;
      permitAppliedTick = null;
      counters.permitsApproved += 1;
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

    // 3. Permit ceiling: the descent stalls, the paperwork begins. The recruit
    //    keeps working the floor they are cleared for — waiting on the permit
    //    office should not mean an hour of nothing happening.
    const limit = permitLimit(character.permitTier);
    // Where the recruit may actually work: the shallower of their permit, their
    // grade, and what the officer asked for.
    const authorised = authorisedDepth(targetDepth, character.permitTier, character.level);
    const gradeLimited = authorised < Math.min(targetDepth, limit);
    const stalled = character.depth >= limit && targetDepth > limit;
    if (stalled) {
      counters.stalledTicks += 1;
      if (permitAppliedTick === null) {
        permitAppliedTick = tick;
        log(tick, `Depth ${limit + 1} reached. Permit D-${character.permitTier} does not cover Depth ${limit + 1}. Descent halted pending Permit D-${character.permitTier + 1}.`);
        log(tick, `Permit D-${character.permitTier + 1} application filed. Estimated processing: 2-4 business days. Delving continues at Floor ${limit}.`);
      }
    }

    if (gradeLimited && character.depth >= authorised && tick % 180 === 0) {
      log(tick, `Floor ${authorised + 1} is not appropriate to a Grade ${character.level} officer. Descent limited pending grade review.`);
    }

    // 4. Descend toward the ordered depth.
    if (!stalled && character.depth < authorised) {
      character.depth += 1;
      counters.deepestFloor = Math.max(counters.deepestFloor, character.depth);
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

    // Deep floors are busier as well as harder, which is most of why they pay.
    if (rngChance(rng, ENCOUNTER_CHANCE_BASE + character.depth * ENCOUNTER_CHANCE_PER_DEPTH)) {
      counters.encounters += 1;
      const loot = LOOT_EFFECT[orders.lootPriority];
      const creature = rngPick(rng, FAUNA);
      const grievous = rngChance(rng, GRIEVOUS_CHANCE);
      const damage = encounterDamage(
        character.depth, character.level, rng(), character.maxHp, grievous,
      );
      character.hp -= damage;
      character.xp += Math.round(encounterXp(character.depth) * loot.xp);

      if (character.hp <= 0) {
        const cause: string =
          character.supplies === 0 ? DEATH_CAUSES[4] : rngPick(rng, COMBAT_DEATH_CAUSES);
        const insured = orders.spendPolicy === 'insure';
        const award = Math.round(
          pensionAward(tick - character.bornTick, counters.deepestFloor, character.gold) *
            (insured ? INSURANCE_PENSION_BONUS : 1),
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
        return finish();
      }

      log(
        tick,
        grievous
          ? `Encountered: ${creature}. Grievous injury sustained. Form 9 (Industrial Injury) filed on the recruit's behalf.`
          : `Encountered: ${creature}. ${rngPick(rng, COMBAT_NOTES)}`,
      );

      if (rngChance(rng, 0.45 * loot.findChance)) {
        const item = rngPick(rng, LOOT_BY_PRIORITY[orders.lootPriority]);
        const value = Math.round(encounterReward(character.depth, rng()) * loot.value);
        character.gold += value;
        counters.acquisitions += 1;
        log(tick, `Acquired: ${item}. ${rngPick(rng, LOOT_NOTES)}`);
      } else if (rngChance(rng, 0.3)) {
        log(tick, `Loot priority: ${orders.lootPriority}. Nothing recovered. Complaint filed against the floor.`);
      }

      const levels = applyLevelUps(character);
      counters.levelsGained += levels;
      if (levels > 0) {
        log(tick, `Grade review passed. Now Level ${character.level}. Union Standing +${levels}.`);
      }
    } else if (rngChance(rng, 0.04)) {
      character.gold += rngInt(rng, 1, 4 + character.depth);
      log(tick, 'Uneventful shift. Per diem claimed.');
    }
  }

  character.lastResolvedTick = toTick;
  return finish();
}

export { permitLimit };
export const RESOLVE_INTERNALS = {
  SUPPLY_DRAIN_TICKS,
  RESUPPLY_COST_PER_UNIT,
  INSURANCE_PENSION_BONUS,
};
