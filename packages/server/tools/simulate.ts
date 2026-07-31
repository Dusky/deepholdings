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
  MAX_CATCHUP_TICKS,
  RETIREMENT_MIN_SERVICE_TICKS,
  TICK_SECONDS,
  pensionAward,
  type InventoryItem,
  type StandingOrders,
} from '@deepholdings/shared';
import { newRecruit } from '../src/domain/character.js';
import { resolve } from '../src/domain/resolve.js';

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
}

function simulateOne(profile: Profile, seed: number, totalTicks: number): RunResult {
  const accountId = `sim-${seed}`;
  let character = newRecruit(`${accountId}-1`, accountId, 1, [], 0);
  let inventory: InventoryItem[] = [];
  let permitAppliedTick: number | null = null;

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
  };

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

    if (out.death) {
      result.deaths += 1;
      result.lifespansTicks.push(out.death.atTick - bornAt);
      result.pensionBanked += out.death.pensionAwarded;
      recruitNum += 1;
      bornAt = tick;
      character = newRecruit(
        `${accountId}-${recruitNum}`, accountId, recruitNum, [], tick,
        out.character.permitTier, out.character.level,
      );
      permitAppliedTick = null;
      inventory = [];
    } else if (tick >= retireAt) {
      // Form R-1: banked at the same rate death pays, at a moment of choosing.
      const service = tick - bornAt;
      const estate = character.gold + inventoryValue(inventory);
      result.retirements += 1;
      result.pensionBanked += pensionAward(service, character.depth, estate, []);
      result.lifespansTicks.push(service);
      recruitNum += 1;
      bornAt = tick;
      character = newRecruit(
        `${accountId}-${recruitNum}`, accountId, recruitNum, [], tick,
        character.permitTier, character.level,
      );
      permitAppliedTick = null;
      inventory = [];
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
    ['profile', 'deaths/wk', 'h/death', 'value/h', 'pens/h', 'floor', 'lvl', 'stalled%', 'enc/h']
      .map((h) => h.padStart(10))
      .join(''),
  );
  console.log('-'.repeat(90));

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

    console.log(
      [
        profile.name,
        deathsPerWeek.toFixed(1),
        Number.isFinite(lifeHours) ? lifeHours.toFixed(1) : 'never',
        goldPerHour.toFixed(0),
        pensionPerHour.toFixed(0),
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
      'stalled% = share of ticks spent waiting on the permit office.\n',
  );
}

main();
