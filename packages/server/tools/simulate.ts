/**
 * Balance harness.
 *
 * Runs the real resolver — not a model of it — over many seeded recruits and
 * reports what actually happens across a week of play. Every tuning number in
 * the game was a guess by someone who had never played it; this is how those
 * guesses get replaced with measurements.
 *
 *   npm run simulate --workspace @deepholdings/server -- --days 7 --runs 200
 */
import {
  EMPTY_REGISTRY,
  MAX_CATCHUP_TICKS,
  REQUISITION_CATALOGUE,
  RETIREMENT_MIN_SERVICE_TICKS,
  TICK_SECONDS,
  pensionAward,
  type InventoryItem,
  type RequisitionId,
  type StandingOrders,
} from '@deepholdings/shared';
import { succeed } from '../src/domain/character.js';
import { resolve } from '../src/domain/resolve.js';
import { visit, type OfficerPolicy } from './officer.js';

interface Profile {
  name: string;
  orders: StandingOrders;
  /**
   * Ticks of service after which the officer files Form R-1.
   *
   * Retirement pays what death pays, so the question the harness has to answer
   * is whether churning careers at the legal minimum beats letting one run —
   * if it does, the minimum becomes the only correct play and death stops
   * meaning anything.
   */
  retireAfter?: number;
  /**
   * Whether the officer spends gold on office equipment as soon as they can.
   *
   * Requisitions change nothing the recruit does underground — by design, a
   * requisition that moved a number in here would not be a requisition. What
   * they change is where the gold goes: equipment is permanent, and gold left
   * in the purse converts to pension the moment the career ends. This profile
   * exists to measure that competition, which is the open question the
   * retirement finding left behind.
   *
   * Buying implies selling: gold is realised at the Ledger, and an officer who
   * never clears the cabinet has no coin to requisition with. So this also
   * models a visit that liquidates the cabinet at book value — the average a
   * seller gets, since the demand band is centred on par.
   */
  buysEquipment?: boolean;
}

/** Gold held back so a spree cannot starve the resupply the recruit lives on. */
const EQUIPMENT_RESERVE = 200;

/**
 * What each profile's officer does at the terminal, stated rather than implied.
 *
 * Every field left off is a deliberate abstention. These profiles measure the
 * *recruit's* curve — how deep, how often they die, what a week earns — so the
 * officer is kept as simple as the question allows: no pension redemption (the
 * runs pass `unlocks: []` throughout), and no department, because a wage would
 * move `value/h` in every row and confound the comparison the table exists for.
 * `longrun.ts` is where the officer's own ladders get measured.
 *
 * The abstentions are written down because `tools/officer.ts` grows: when a
 * system is added there, this object is the place someone has to look and
 * decide, instead of the profiles silently continuing not to have it.
 */
function policyFor(profile: Profile): OfficerPolicy {
  // An officer buying on price alone is the least favourable case for the sink:
  // they clear the cheap rungs early and spend the rest of the week with
  // nothing left to want, which is exactly the failure mode worth measuring.
  // `visit` buys cheapest-first in ladder order, which is that officer.
  return profile.buysEquipment
    ? { sells: true, requisitions: { reserve: EQUIPMENT_RESERVE } }
    : {};
}

const PROFILES: Profile[] = [
  { name: 'timid', orders: { targetDepth: 2, retreatPct: 60, lootPriority: 'gold', spendPolicy: 'resupply' } },
  { name: 'cautious', orders: { targetDepth: 4, retreatPct: 45, lootPriority: 'gear', spendPolicy: 'resupply' } },
  { name: 'balanced', orders: { targetDepth: 6, retreatPct: 30, lootPriority: 'gear', spendPolicy: 'resupply' } },
  { name: 'greedy', orders: { targetDepth: 9, retreatPct: 20, lootPriority: 'relics', spendPolicy: 'hoard' } },
  { name: 'reckless', orders: { targetDepth: 12, retreatPct: 5, lootPriority: 'gold', spendPolicy: 'hoard' } },
  { name: 'insured', orders: { targetDepth: 6, retreatPct: 30, lootPriority: 'gear', spendPolicy: 'insure' } },
  {
    name: 'churner',
    orders: { targetDepth: 6, retreatPct: 30, lootPriority: 'gear', spendPolicy: 'resupply' },
    retireAfter: RETIREMENT_MIN_SERVICE_TICKS,
  },
  {
    name: 'retirer',
    orders: { targetDepth: 6, retreatPct: 30, lootPriority: 'gear', spendPolicy: 'resupply' },
    retireAfter: 1440,
  },
  {
    name: 'equipper',
    orders: { targetDepth: 6, retreatPct: 30, lootPriority: 'gear', spendPolicy: 'resupply' },
    buysEquipment: true,
  },
  {
    name: 'retirer+eq',
    orders: { targetDepth: 6, retreatPct: 30, lootPriority: 'gear', spendPolicy: 'resupply' },
    retireAfter: 1440,
    buysEquipment: true,
  },
];

interface RunResult {
  deaths: number;
  retirements: number;
  lifespansTicks: number[];
  goldEarned: number;
  pensionBanked: number;
  deepestFloor: number;
  finalLevel: number;
  permitsApproved: number;
  stalledTicks: number;
  encounters: number;
  equipmentSpend: number;
  requisitions: number;
}

function simulateOne(profile: Profile, seed: number, totalTicks: number): RunResult {
  const accountId = `sim-${seed}`;
  const first = succeed({
    id: `${accountId}-1`,
    accountId,
    previous: null,
    depthReached: 0,
    unlocks: [],
    atTick: 0,
  });
  let character = first.character;
  let inventory: InventoryItem[] = first.inventory;
  let permitAppliedTick: number | null = first.permitAppliedTick;

  const result: RunResult = {
    deaths: 0,
    retirements: 0,
    lifespansTicks: [],
    goldEarned: 0,
    pensionBanked: 0,
    deepestFloor: 0,
    finalLevel: 1,
    permitsApproved: 0,
    stalledTicks: 0,
    encounters: 0,
    equipmentSpend: 0,
    requisitions: 0,
  };

  // Account-scoped, so it deliberately survives every death and retirement
  // below — that is the whole property being measured.
  const owned: RequisitionId[] = [];

  let tick = 0;
  let recruitNum = 1;
  let bornAt = 0;

  // Resolve in catch-up-sized chunks, the way a real player's visits do.
  const CHUNK = Math.min(MAX_CATCHUP_TICKS, 240);
  while (tick < totalTicks) {
    const retireAt = profile.retireAfter === undefined ? Infinity : bornAt + profile.retireAfter;
    const to = Math.min(tick + CHUNK, totalTicks, retireAt);
    const out = resolve({
      character, inventory, orders: profile.orders, unlocks: [], toTick: to, permitAppliedTick,
    });

    // Value now accrues as items as well as coin, so measure the portfolio.
    const stockBefore = inventoryValue(inventory);
    const stockAfter = inventoryValue(out.inventory);
    result.goldEarned += Math.max(
      0,
      out.counters.goldAfter - out.counters.goldBefore + (stockAfter - stockBefore),
    );
    result.deepestFloor = Math.max(result.deepestFloor, out.counters.deepestFloor);
    result.permitsApproved += out.counters.permitsApproved;
    result.encounters += out.counters.encounters;
    result.stalledTicks += out.counters.stalledTicks;

    character = out.character;
    inventory = out.inventory;
    permitAppliedTick = out.permitAppliedTick;
    tick = character.lastResolvedTick;

    if (profile.buysEquipment) {
      const after = visit(
        {
          character, inventory, caseFiles: [], filings: [],
          pension: { total: 0, spent: 0, unlocks: [] },
          registry: EMPTY_REGISTRY,
          requisitions: owned,
        },
        policyFor(profile),
        out.ticksResolved,
      );
      character = after.character;
      inventory = after.inventory;
      owned.length = 0;
      owned.push(...after.requisitions);
      for (const id of after.boughtRequisitions) {
        result.equipmentSpend += REQUISITION_CATALOGUE.find((entry) => entry.id === id)!.cost;
        result.requisitions += 1;
      }
    }

    if (out.death) {
      result.deaths += 1;
      result.lifespansTicks.push(out.death.atTick - bornAt);
      result.pensionBanked += out.death.pensionAwarded;
      recruitNum += 1;
      bornAt = tick;
      // The same door the server uses. When these were two constructions they
      // disagreed for months without either being individually wrong.
      ({ character, inventory, permitAppliedTick } = succeed({
        id: `${accountId}-${recruitNum}`,
        accountId,
        previous: out.character,
        depthReached: out.death.depth,
        unlocks: [],
        atTick: tick,
      }));
    } else if (tick >= retireAt) {
      // Form R-1: banked at the same rate death pays, at a moment of choosing.
      const service = tick - bornAt;
      const estate = character.gold + inventoryValue(inventory);
      result.retirements += 1;
      result.pensionBanked += pensionAward(service, character.depth, estate, []);
      result.lifespansTicks.push(service);
      recruitNum += 1;
      bornAt = tick;
      ({ character, inventory, permitAppliedTick } = succeed({
        id: `${accountId}-${recruitNum}`,
        accountId,
        previous: character,
        depthReached: character.depth,
        unlocks: [],
        atTick: tick,
      }));
    } else if (out.ticksResolved === 0) {
      break;
    }
  }

  result.finalLevel = character.level;
  return result;
}

function inventoryValue(items: readonly InventoryItem[]): number {
  return items.reduce((total, item) => total + item.unitValue * item.quantity, 0);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function hoursOf(ticks: number): number {
  return (ticks * TICK_SECONDS) / 3600;
}

function main(): void {
  const args = process.argv.slice(2);
  const arg = (name: string, fallback: number) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? Number(args[i + 1]) : fallback;
  };
  const days = arg('days', 7);
  const runs = arg('runs', 200);
  const totalTicks = Math.round((days * 24 * 3600) / TICK_SECONDS);

  console.log(`\nDeep Holdings balance run — ${days} day(s), ${runs} recruits per profile\n`);
  console.log(
    ['profile', 'deaths/wk', 'h/death', 'value/h', 'pens/h', 'equip', 'floor', 'lvl', 'stalled%', 'enc/h']
      .map((h) => h.padStart(10))
      .join(''),
  );
  console.log('-'.repeat(100));

  for (const profile of PROFILES) {
    const results = Array.from({ length: runs }, (_, i) => simulateOne(profile, i, totalTicks));

    const deathsPerWeek = (results.reduce((n, r) => n + r.deaths, 0) / runs) * (7 / days);
    // Hours of play per death, counting survivors — a median over deaths alone
    // would report the unlucky and ignore everyone who lived.
    const totalDeaths = results.reduce((n, r) => n + r.deaths, 0);
    const lifeHours = totalDeaths === 0 ? Infinity : (hoursOf(totalTicks) * runs) / totalDeaths;
    const goldPerHour = median(results.map((r) => r.goldEarned)) / hoursOf(totalTicks);
    const floor = median(results.map((r) => r.deepestFloor));
    const level = median(results.map((r) => r.finalLevel));
    const pensionPerHour = median(results.map((r) => r.pensionBanked)) / hoursOf(totalTicks);
    const stalled = (median(results.map((r) => r.stalledTicks)) / totalTicks) * 100;
    const encPerHour = median(results.map((r) => r.encounters)) / hoursOf(totalTicks);
    const equipment = median(results.map((r) => r.requisitions));

    console.log(
      [
        profile.name,
        deathsPerWeek.toFixed(1),
        Number.isFinite(lifeHours) ? lifeHours.toFixed(1) : 'never',
        goldPerHour.toFixed(0),
        pensionPerHour.toFixed(0),
        equipment.toFixed(0),
        floor.toFixed(0),
        level.toFixed(0),
        stalled.toFixed(0),
        encPerHour.toFixed(1),
      ]
        .map((c) => String(c).padStart(10))
        .join(''),
    );
  }

  console.log(
    '\nh/death = hours of play per death, survivors included.\n' +
      'equip = requisitions owned at the end of the run, of 7 in the catalogue.\n' +
      'stalled% = share of ticks spent waiting on the permit office.\n',
  );
}

main();
