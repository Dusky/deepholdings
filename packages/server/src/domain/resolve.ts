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
  authorisedSite,
  permitDepthLimit,
  siteSpec,
  GRIEVOUS_CHANCE,
  LOOT_EFFECT,
  GRIEVOUS_MAX_FRACTION,
  GRIEVOUS_MULTIPLIER,
  HOARD_SALE_BONUS,
  MAX_HIT_FRACTION,
  authorisedDepth,
  gradeMismatchMultiplier,
  STIPEND_BY_TIER,
  cabinetSlots,
  permitProcessingTicks,
  unlockTier,
  TICK_SECONDS,
  makeRng,
  pensionAward,
  type CommendationId,
  RETIREMENT_REMINDER_TICKS,
  rngChance,
  rngInt,
  rngPick,
  tickSeed,
  maxHpForLevel,
  caseFileTitle,
  clauseLine,
  statsOf,
  STANDING_PER_GRADE,
  type CaseFile,
  type Character,
  type Filing,
  type InventoryItem,
  type LootPriority,
  type StandingOrders,
  type UnlockId,
} from '@deepholdings/shared';
import { concludeFiling } from './filings.js';
import { file as fileCaseFile, rollCaseFile, rollsCaseFile } from './caseFiles.js';
import { applyLevelUps, permitLimit } from './character.js';
import {
  caseRef,
  COMBAT_DEATH_CAUSES,
  combatNote,
  emptyHandedNote,
  faunaFor,
  lootFor,
  lootNote,
  quietNote,
  STARVATION_CAUSE,
  HOARD_NOTE,
  INSURE_NOTE,
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
  /** Case files opened in this span. */
  caseFilesFound: number;
  /** Forms that concluded in this span, ruled either way. */
  filingsConcluded: number;
}

export interface ResolveResult {
  character: Character;
  inventory: InventoryItem[];
  /** Case files the recruit is carrying, after this span. */
  caseFiles: CaseFile[];
  /** Forms still processing, after this span. */
  filings: Filing[];
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
  /** Carried through resolution: acquisitions land here, not just in the log. */
  inventory: InventoryItem[];
  /** Case files carried in. Their clauses feed the stat block below. */
  caseFiles?: readonly CaseFile[];
  /** Forms filed and not yet due. Resolved in the loop, at their tick. */
  filings?: readonly Filing[];
  orders: StandingOrders;
  unlocks: readonly UnlockId[];
  /** Absolute tick index for "now". */
  toTick: number;
  /** Permit application watermark, carried between resolutions. */
  permitAppliedTick: number | null;
  /**
   * Commendations held by the officer, for the Service Endowment multiplier.
   *
   * Optional and defaulting to none, so every harness that models an officer on
   * their first posting keeps saying exactly what it said before. The server
   * always passes the row it loaded.
   */
  commendations?: readonly CommendationId[];
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
export function encounterDamage(
  depth: number,
  level: number,
  roll: number,
  maxHp: number,
  grievous: boolean,
  survival = 0,
  /**
   * The site's hazard multiplier, applied *before* the cap.
   *
   * That placement is the whole safety argument. `MAX_HIT_FRACTION` is what
   * stops a deep floor one-shotting a healthy recruit, and a site multiplier
   * applied after it would raise the ceiling instead of the floor — which is
   * how the retreat threshold stopped meaning anything the last time something
   * was multiplied in the wrong order. A harder site should land more blows
   * near the cap, never blows above it.
   */
  danger = 1,
): number {
  const raw =
    (2 + Math.pow(depth, 1.4) * 1.2) *
    danger *
    gradeMismatchMultiplier(depth, level) *
    (0.6 + roll * 0.8) *
    (grievous ? GRIEVOUS_MULTIPLIER : 1) *
    // Clause survival, applied before the cap rather than after: a case file
    // should soften an ordinary blow, not raise the ceiling on the worst one.
    // Clamped in statsOf, so this can never reach zero.
    (1 - survival);
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

/**
 * Puts an acquisition in the filing cabinet, or sells it if there is no room.
 *
 * Nothing a player earned is ever destroyed: at capacity the item is liquidated
 * at depot rates and the gold banked instead. `hoard` holds out for a better
 * buyer, which is what pays for its refusal to resupply.
 */
function stow(
  inventory: InventoryItem[],
  item: string,
  category: LootPriority,
  value: number,
  hoarding: boolean,
  slots: number,
): { gold: number; liquidated: boolean } {
  const existing = inventory.find((entry) => entry.name === item);
  if (existing) {
    // Re-appraise the stack: the same base found on Floor 9 is worth more than
    // the one from Floor 2, and a stack frozen at its first price would value
    // deep work at shallow rates.
    const total = existing.unitValue * existing.quantity + value;
    existing.quantity += 1;
    existing.unitValue = Math.round(total / existing.quantity);
    existing.note = `x${existing.quantity}`;
    return { gold: 0, liquidated: false };
  }

  if (inventory.length >= slots) {
    return { gold: Math.round(value * (hoarding ? HOARD_SALE_BONUS : 1)), liquidated: true };
  }

  inventory.push({ name: item, note: 'x1', quantity: 1, unitValue: value, category });
  return { gold: 0, liquidated: false };
}

export function resolve(options: ResolveOptions): ResolveResult {
  const character: Character = { ...options.character };
  const inventory: InventoryItem[] = options.inventory.map((item) => ({ ...item }));
  let caseFiles: CaseFile[] = (options.caseFiles ?? []).map((f) => ({ ...f }));
  const { orders, unlocks } = options;
  const commendations = options.commendations ?? [];

  /**
   * The carried stat block, recomputed whenever the files change.
   *
   * Held in a variable rather than derived at each use so the cost is paid
   * once per acquisition instead of once per tick — this runs inside the tick
   * loop, and the loop runs up to MAX_CATCHUP_TICKS times per read.
   *
   * **The base passed is the recruit's own maximum before clauses**, which is
   * what `statsOf` documents its vigour ceiling as a share of. The first
   * version omitted it and took the default, so every recruit shared a Grade
   * 12 recruit's ceiling: at Grade 2 that is +19 on a 72-point maximum, a 26%
   * swing from a system whose whole justification is a 12% one. Carried
   * effect is now worth the same *proportion* at every grade, which is the
   * only version the ARMOURY screen can state honestly.
   */
  const carried = () => statsOf(caseFiles, maxHpForLevel(character.level));
  let stats = carried();

  /**
   * Forms in processing, soonest first.
   *
   * Sorted once and walked with a pointer rather than filtered every tick: the
   * list is tiny, but this loop runs up to MAX_CATCHUP_TICKS times per read
   * and a per-tick scan over a list that is almost always empty is exactly the
   * kind of cost that is invisible until a month-long catch-up.
   */
  let filings: Filing[] = [...(options.filings ?? [])]
    .map((f) => ({ ...f }))
    .sort((a, b) => a.resolvesTick - b.resolvesTick || a.id.localeCompare(b.id));
  let nextFiling = 0;

  /**
   * Keeps `maxHp` equal to level plus carried vigour, and hp inside it.
   *
   * `maxHp` is nine different reads in the loop below — the retreat threshold,
   * the damage cap, every "% HP" line — so vigour is folded into the field
   * rather than threaded through all of them as an effective value. That is
   * the version that cannot be got wrong in one place and right in eight.
   *
   * Must run after anything that changes level *or* the carried files:
   * `applyLevelUps` recomputes maxHp from level alone and would otherwise wipe
   * the vigour, and releasing a file can lower the ceiling below current hp.
   */
  const syncVitals = () => {
    character.maxHp = Math.max(1, maxHpForLevel(character.level) + stats.vigour);
    if (character.hp > character.maxHp) character.hp = character.maxHp;
  };
  syncVitals();
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
    caseFilesFound: 0,
    filingsConcluded: 0,
  };
  const finish = (): ResolveResult => {
    counters.goldAfter = character.gold;
    return {
      character, inventory, caseFiles, filings, counters, journal, death, permitAppliedTick,
      ticksResolved,
    };
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

  const stipendPerTick = STIPEND_BY_TIER[unlockTier(unlocks, 'stipend')];
  const processingTicks = permitProcessingTicks(unlocks);
  const slots = cabinetSlots(unlocks);
  /**
   * Where this recruit is working, and what it is like there.
   *
   * Read once per resolution rather than per tick: an officer cannot move a
   * recruit mid-span, and the standing order is fixed for the whole replay.
   * Falls back to the home site when the stored order names one the officer is
   * no longer authorised for — a lapsed Commendation should send the recruit
   * somewhere safe, not fail the read that noticed.
   */
  const site = siteSpec(authorisedSite(orders.site ?? 'holdings', commendations));
  const targetDepth = Math.min(Math.max(1, orders.targetDepth), site.maxDepth);
  const retreatHp = () => Math.ceil((character.maxHp * orders.retreatPct) / 100);

  const log = (tick: number, text: string) => {
    journal.push({ tick, at: tickToDate(tick), text });
  };

  for (let tick = fromTick; tick <= toTick; tick += 1) {
    ticksResolved += 1;
    const rng = makeRng(tickSeed(character.id, tick));
    // Prose draws from its own stream, so writing never moves the simulation.
    // Sharing one stream meant a note that mentioned a form number consumed an
    // extra value and re-rolled that tick's combat — the balance table shifted
    // by a third the first time the journal copy was expanded.
    const prose = makeRng(tickSeed(character.id, tick, 'prose'));

    /**
     * Forms due this minute, ruled before anything else happens in it.
     *
     * Before, because an amended clause changes the stat block, and a recruit
     * who is fighting at this tick should fight with the ruling that has
     * already been handed down. The alternative — resolve the encounter, then
     * apply the paperwork — means the Terminal shows a clause taking effect
     * one minute after the log says it was granted.
     */
    while (nextFiling < filings.length && filings[nextFiling].resolvesTick <= tick) {
      const filing = filings[nextFiling];
      nextFiling += 1;
      const outcome = concludeFiling(filing, caseFiles);
      caseFiles = outcome.files;
      if (outcome.changed) {
        stats = carried();
        syncVitals();
      }
      counters.filingsConcluded += 1;
      log(tick, outcome.text);
    }
    if (nextFiling > 0) {
      filings = filings.slice(nextFiling);
      nextFiling = 0;
    }

    if (stipendPerTick > 0) character.gold += stipendPerTick;

    // Death is not the only way to bank a pension, but it is the only one the
    // game ever mentions. A recruit who is not dying earns nothing and is
    // never told why — so the pension office writes, with the figure.
    const served = tick - character.bornTick;
    if (served > 0 && served % RETIREMENT_REMINDER_TICKS === 0) {
      const estate =
        character.gold +
        inventory.reduce((total, item) => total + item.unitValue * item.quantity, 0);
      // Current depth, not the deepest reached: this line is about Form R-1,
      // and R-1 pays on where the recruit is standing. Death pays on the
      // deepest floor. Quoting the wrong one makes the Ledger a liar.
      const award = pensionAward(served, character.depth, estate, unlocks, commendations);
      log(
        tick,
        `Service review: ${character.name} has served ${Math.round(served / 60)} hours. ` +
          `Form R-1 (Voluntary Retirement) remains available; the pension office ` +
          `assesses the separation at ${award}. No action is required. None ever is.`,
      );
    }

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
        log(tick, `Back at the surface. ${Math.round((character.hp / character.maxHp) * 100)}% HP.`);
      } else {
        // Retreating a single floor used to be silent, so the log showed
        // "Down to Floor 2" three times with nothing between — which reads as
        // a repeated line rather than a recruit going up and down.
        log(tick, `Pulled back to Floor ${character.depth}. ${Math.round((character.hp / character.maxHp) * 100)}% HP.`);
      }
      continue;
    }

    // 2. Resting at the surface: recover, resupply per spend policy.
    if (character.depth === 0 && character.hp < character.maxHp) {
      character.hp = Math.min(character.maxHp, character.hp + Math.round(character.maxHp * 0.04));
      if (character.hp >= character.maxHp) {
        log(tick, 'Rested at Depot 3.');
      }
      if (orders.spendPolicy === 'resupply' && character.supplies < 6) {
        // Short of coin at the depot? The quartermaster buys the cheapest thing
        // on the cart. Loot is stock now, and a recruit should not starve
        // beside a full filing cabinet.
        const needed = (12 - character.supplies) * RESUPPLY_COST_PER_UNIT;
        while (character.gold < needed && inventory.length > 0) {
          const cheapest = inventory.reduce((low, item) =>
            item.unitValue < low.unitValue ? item : low,
          );
          character.gold += cheapest.unitValue * cheapest.quantity;
          log(tick, `Sold ${cheapest.quantity} x ${cheapest.name} at Depot 3 to cover supplies.`);
          inventory.splice(inventory.indexOf(cheapest), 1);
        }

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
    const limit = permitDepthLimit(character.permitTier, site.id);
    // Where the recruit may actually work: the shallower of their permit, their
    // grade, and what the officer asked for.
    const authorised = authorisedDepth(targetDepth, character.permitTier, character.level, site.id);
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
      log(tick, `Down to Floor ${character.depth}.`);
    }

    // 5. Delving: supplies burn, things happen.
    if (tick % SUPPLY_DRAIN_TICKS === 0) {
      character.supplies = Math.max(0, character.supplies - 1);
    }
    if (character.supplies === 0 && rngChance(rng, 0.3)) {
      character.hp -= Math.max(1, Math.round(character.maxHp * 0.04));
      log(tick, 'Out of supplies, still descending. The recruit is not eating.');
    }
    if (orders.spendPolicy === 'insure' && character.gold >= INSURANCE_PREMIUM_PER_TICK) {
      character.gold -= INSURANCE_PREMIUM_PER_TICK;
      if (tick % 120 === 0) log(tick, INSURE_NOTE);
    }
    if (orders.spendPolicy === 'hoard' && character.supplies === 0 && tick % 60 === 0) {
      log(tick, HOARD_NOTE);
    }

    // Deep floors are busier as well as harder, which is most of why they pay.
    if (rngChance(rng, (ENCOUNTER_CHANCE_BASE + character.depth * ENCOUNTER_CHANCE_PER_DEPTH) * site.traffic)) {
      counters.encounters += 1;
      const loot = LOOT_EFFECT[orders.lootPriority];
      const creature = faunaFor(character.depth, prose, site.id);
      const grievous = rngChance(rng, GRIEVOUS_CHANCE);
      const damage = encounterDamage(
        character.depth, character.level, rng(), character.maxHp, grievous, stats.survival,
        site.danger,
      );
      character.hp -= damage;
      character.xp += Math.round(encounterXp(character.depth) * loot.xp * site.xp);

      if (character.hp <= 0) {
        const cause: string =
          character.supplies === 0 ? STARVATION_CAUSE : rngPick(prose, COMBAT_DEATH_CAUSES);
        const insured = orders.spendPolicy === 'insure';
        // The estate includes the filing cabinet, not just the coins.
        const estate =
          character.gold +
          inventory.reduce((total, item) => total + item.unitValue * item.quantity, 0);
        const award = Math.round(
          pensionAward(tick - character.bornTick, counters.deepestFloor, estate, unlocks, commendations) *
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
        log(tick, `Encountered: ${creature}.`);
        log(tick, `${character.name} died on Floor ${character.depth}. Cause of death: ${cause}. Next of kin notified by form letter.`);
        character.lastResolvedTick = tick;
        return finish();
      }

      log(
        tick,
        grievous
          ? `Encountered: ${creature}. Badly hurt — Form 9 (Industrial Injury) filed on the recruit's behalf.`
          : `Encountered: ${creature}. ${combatNote(prose)}`,
      );

      if (rngChance(rng, 0.45 * loot.findChance)) {
        const item = lootFor(orders.lootPriority, character.depth, prose, site.id);
        const value = Math.round(
          encounterReward(character.depth, rng()) * loot.value * (1 + stats.lootValue) * site.yield,
        );
        counters.acquisitions += 1;

        // A case file arrives *instead of* a stack, so this draw is a share of
        // finds rather than a new source of them. Simulation rng, not prose:
        // it changes the stat block, so it is a simulation event that happens
        // to have a name.
        if (rollsCaseFile(character.depth, orders.lootPriority, rng)) {
          const rolled = rollCaseFile({
            id: caseRef(prose),
            name: item,
            priority: orders.lootPriority,
            depth: character.depth,
            level: character.level,
            baseValue: value,
            rng,
          });
          const filed = fileCaseFile(caseFiles, rolled);
          caseFiles = filed.files;
          stats = carried();
          syncVitals();
          counters.caseFilesFound += 1;

          log(tick, `Case ${rolled.id} opened: ${caseFileTitle(rolled)}. ${clauseLine(rolled)}.`);
          if (filed.displaced) {
            // Never silently: the drawer is full and something had to go, and
            // a player who is not told will believe the game lost it.
            const gone = filed.displaced.id === rolled.id ? 'the new file' : filed.displaced.id;
            log(
              tick,
              `Drawer full. ${gone === 'the new file' ? `Case ${rolled.id} was not worth the space and has been released` : `Case ${gone} released to make room`}.`,
            );
          }
        } else {
          const stowed = stow(
            inventory, item, orders.lootPriority, value, orders.spendPolicy === 'hoard', slots,
          );
          character.gold += stowed.gold;
          log(
            tick,
            stowed.liquidated
              ? `Acquired: ${item}. Filing cabinet at capacity; liquidated at depot rates for ${stowed.gold} gold.`
              : `Acquired: ${item}. ${lootNote(prose)}`,
          );
        }
      } else if (rngChance(rng, 0.3)) {
        log(tick, emptyHandedNote(orders.lootPriority, prose));
      }

      const levels = applyLevelUps(character);
      // applyLevelUps recomputes maxHp from level alone, so carried vigour has
      // to be folded back in immediately or a promotion silently strips it.
      // The stat block is recomputed as well and not merely re-applied: the
      // vigour ceiling is a share of the recruit's own maximum, so a promotion
      // raises it, and files that were being clipped start paying out.
      if (levels > 0) {
        stats = carried();
        syncVitals();
      }
      counters.levelsGained += levels;
      if (levels > 0) {
        // The copy said "Union Standing +1" for months against no number at
        // all. It is a currency now, and the line is unchanged — the mechanic
        // was made to match the writing rather than the other way round.
        const earned = levels * STANDING_PER_GRADE;
        character.standing += earned;
        log(tick, `Grade review passed. Now Grade ${character.level}. Union Standing +${earned}.`);
      }
    } else if (rngChance(rng, 0.04)) {
      character.gold += rngInt(rng, 1, 4 + character.depth);
      log(tick, quietNote(prose));
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
