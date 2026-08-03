/**
 * Measures what a set of standing orders is actually worth, and writes the
 * table the Orders screen shows the player.
 *
 *   npm run forecast --workspace @deepholdings/server -- --runs 60 --days 4
 *
 * ## Why a measured table rather than a formula
 *
 * The Orders screen needs to answer "what does Floor 12 at 35% cost me?" before
 * the player commits. The obvious way is a closed-form estimate — encounter
 * rate times damage times depth — and that is the trap this codebase has fallen
 * into repeatedly: a second implementation of the resolver that agrees at the
 * moment it is written and diverges silently forever after. The fast-forward
 * treadmill, the officer aliasing bug and the `spent: 0` transfer were all one
 * model disagreeing with another while every test passed.
 *
 * So there is no second model. This sweeps the **real resolver** across the
 * grid the player can actually set, and bakes what it measured into
 * `packages/shared/src/forecast.ts` as data. The number on the screen is a
 * number the game produced.
 *
 * ## What is swept, and what is applied afterwards
 *
 * Swept: **target depth × retreat threshold**, which interact non-linearly
 * (a shallow floor with a reckless threshold is not a deep floor with a
 * cautious one) and cannot be composed from separate axes.
 *
 * Applied afterwards: **loot priority** and **spend policy**, because in the
 * resolver they are literal multipliers on realised value — `LOOT_EFFECT` and
 * `HOARD_SALE_BONUS` — rather than anything that changes how a recruit moves.
 * Multiplying by them is the same arithmetic the resolver does, not a model of
 * it. Sweeping all twelve combinations would multiply the run time by twelve to
 * re-measure numbers already known exactly.
 *
 * ## The forecast is honest about being a forecast
 *
 * These are medians over seeded runs with no department, no unlocks and no case
 * files — a bare recruit. A player with staff and a full drawer does better.
 * The screen says "roughly" for that reason, and
 * `packages/server/test/forecast.test.ts` re-measures a few cells on every run
 * so a tuning change that invalidates the table fails the suite instead of
 * quietly lying to players.
 */
import { writeFileSync } from 'node:fs';
import {
  MAX_DEPTH,
  TICK_SECONDS,
  permitDepthLimit,
  type InventoryItem,
  type StandingOrders,
} from '@deepholdings/shared';
import { succeed } from '../src/domain/character.js';
import { resolve } from '../src/domain/resolve.js';

/** Retreat thresholds sampled. The screen interpolates between them. */
export const RETREAT_STEPS = [10, 15, 20, 25, 30, 35, 40, 45] as const;

export interface Cell {
  /** Gold-equivalent realised per hour, median across seeds. */
  goldPerHour: number;
  /**
   * Pension banked per hour — the permanent currency, paid out on death.
   *
   * This column is why the forecast shows two numbers rather than one. Gold
   * rises monotonically with caution, so a screen showing gold alone would
   * teach every player to peg the slider at 45% and would be teaching them
   * wrong: pension peaks at **35%** and falls away on both sides, because it is
   * paid at a death and a recruit who never dies never banks any. The setting
   * that makes you rich and the setting that makes you progress are different
   * settings, which is a genuinely good trade that no player could see.
   */
  pensionPerHour: number;
  /** Hours of play per death. `Infinity` when nothing died. */
  hoursPerDeath: number;
}

function inventoryValue(inventory: readonly InventoryItem[]): number {
  return inventory.reduce((sum, item) => sum + item.unitValue * item.quantity, 0);
}

/** The lowest permit tier that authorises this depth on the free site. */
function permitTierFor(depth: number): number {
  for (let tier = 1; tier <= 8; tier += 1) {
    if (permitDepthLimit(tier) >= depth) return tier;
  }
  return 8;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * One seeded career under one set of orders, driven through the real resolver.
 *
 * Deliberately spare: no officer visit, no requisitions, no pension redemption.
 * The forecast answers "what do these orders do", so anything an officer buys
 * would be measuring the officer instead.
 */
export function measure(
  orders: StandingOrders,
  seed: number,
  totalTicks: number,
): { gold: number; deaths: number; pension: number } {
  const accountId = `forecast-${seed}`;
  const first = succeed({
    id: `${accountId}-1`, accountId, previous: null, depthReached: 0, unlocks: [], atTick: 0,
  });
  /**
   * Start already permitted for the depth being measured.
   *
   * Without this the deep rows are a lie. A recruit starts at D-1 (Floor 2) and
   * climbs a rung every three hours, so over a short window "target Floor 12"
   * measures whatever the permit happened to allow — the first sweep produced
   * Floor 7 and Floor 12 within 2g/h of each other, which is not a property of
   * Floor 12, it is the ladder not having been climbed yet.
   *
   * The row now answers "what is this floor worth once you may work it", and
   * the screen clamps the reading to the player's *actual* permit, so a player
   * at D-2 is told what D-2 pays rather than what the slider imagines.
   */
  let character = { ...first.character, permitTier: permitTierFor(orders.targetDepth) };
  let inventory: InventoryItem[] = first.inventory;
  let permitAppliedTick: number | null = first.permitAppliedTick;

  let gold = 0;
  let deaths = 0;
  let pension = 0;
  let tick = 0;
  let recruitNum = 1;

  const CHUNK = 240;
  while (tick < totalTicks) {
    const to = Math.min(tick + CHUNK, totalTicks);
    const out = resolve({
      character, inventory, orders, unlocks: [], toTick: to, permitAppliedTick,
    });

    // Value accrues as unsold stock as well as coin, so measure the portfolio —
    // otherwise a cabinet full of relics reads as having earned nothing.
    gold += Math.max(
      0,
      out.counters.goldAfter - out.counters.goldBefore +
        (inventoryValue(out.inventory) - inventoryValue(inventory)),
    );

    character = out.character;
    inventory = out.inventory;
    permitAppliedTick = out.permitAppliedTick;
    tick = character.lastResolvedTick;

    if (out.death) {
      deaths += 1;
      pension += out.death.pensionAwarded;
      recruitNum += 1;
      ({ character, inventory, permitAppliedTick } = succeed({
        id: `${accountId}-${recruitNum}`, accountId, previous: out.character,
        depthReached: out.death.depth, unlocks: [], atTick: tick,
      }));
    }
  }

  return { gold, deaths, pension };
}

export function measureCell(
  targetDepth: number,
  retreatPct: number,
  runs: number,
  totalTicks: number,
): Cell {
  const orders: StandingOrders = {
    targetDepth, retreatPct, lootPriority: 'gear', spendPolicy: 'resupply',
  };
  const golds: number[] = [];
  let deaths = 0;
  let pension = 0;
  for (let seed = 0; seed < runs; seed += 1) {
    const run = measure(orders, seed + targetDepth * 1000 + retreatPct, totalTicks);
    golds.push(run.gold);
    deaths += run.deaths;
    pension += run.pension;
  }
  const hours = (totalTicks * TICK_SECONDS) / 3600;
  return {
    goldPerHour: Math.round(median(golds) / hours),
    // Summed rather than medianed: most careers contribute zero deaths in a
    // window, so a median would report 0 for every cautious cell and hide the
    // curve this column exists to show.
    pensionPerHour: Math.round(pension / (hours * runs)),
    hoursPerDeath: deaths === 0 ? Infinity : Math.round((hours * runs) / deaths),
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const value = (flag: string, fallback: number) => {
    const at = args.indexOf(flag);
    return at === -1 ? fallback : Number(args[at + 1]);
  };
  const runs = value('--runs', 60);
  const days = value('--days', 4);
  const totalTicks = Math.round((days * 24 * 3600) / TICK_SECONDS);

  const rows: string[] = [];
  process.stderr.write(`Sweeping ${MAX_DEPTH} depths x ${RETREAT_STEPS.length} thresholds, ${runs} runs each...\n`);

  for (let depth = 1; depth <= MAX_DEPTH; depth += 1) {
    const cells = RETREAT_STEPS.map((pct) => measureCell(depth, pct, runs, totalTicks));
    rows.push(
      `  // Floor ${depth}\n  [${cells
        .map(
          (c) =>
            `[${c.goldPerHour}, ${c.pensionPerHour}, ` +
            `${Number.isFinite(c.hoursPerDeath) ? c.hoursPerDeath : 'Infinity'}]`,
        )
        .join(', ')}],`,
    );
    process.stderr.write(
      `  floor ${String(depth).padStart(2)}  ${cells
        .map((c) => `${c.goldPerHour}g/${c.pensionPerHour}p`)
        .join('  ')}\n`,
    );
  }

  const out = `/**
 * What each set of standing orders is worth, measured — not modelled.
 *
 * GENERATED by \`npm run forecast -w @deepholdings/server\`. Do not hand-edit:
 * \`packages/server/test/forecast.test.ts\` re-measures cells against the live
 * resolver and fails when this table has drifted, so an edit here becomes a
 * test failure rather than a lie on the Orders screen.
 *
 * Rows are target depth 1..${MAX_DEPTH}; columns are the retreat thresholds in
 * \`RETREAT_STEPS\`. Each cell is \`[goldPerHour, pensionPerHour, hoursPerDeath]\`
 * for a bare recruit with no department, no unlocks and no case files — which is
 * why the screen says "roughly" and why a geared player beats it.
 *
 * **Read the two currencies together.** Gold rises with caution all the way to
 * the top of the slider; pension peaks near 35% and falls off both sides,
 * because pension is paid at a death and a recruit who never dies never banks
 * any. That is the actual decision on this screen, and before this table it was
 * invisible to everyone including the people tuning it.
 *
 * Measured over ${days} day(s) x ${runs} seeded careers per cell.
 */
export const RETREAT_STEPS = [${RETREAT_STEPS.join(', ')}] as const;

/** \`[goldPerHour, pensionPerHour, hoursPerDeath]\`, indexed \`[depth - 1][step]\`. */
export const FORECAST: readonly (readonly (readonly [number, number, number])[])[] = [
${rows.join('\n')}
];

/**
 * The forecast for a set of orders, interpolated between measured thresholds.
 *
 * Loot priority and spend policy are applied as the multipliers the resolver
 * itself uses rather than swept, because that is what they are: \`LOOT_EFFECT\`
 * scales realised value and \`HOARD_SALE_BONUS\` scales the sale. Relics are
 * worth their value times how often they are actually found.
 */
export function forecast(orders: {
  targetDepth: number;
  retreatPct: number;
  lootPriority: keyof typeof LOOT_EFFECT;
  spendPolicy: 'resupply' | 'hoard' | 'insure';
}): { goldPerHour: number; pensionPerHour: number; hoursPerDeath: number } {
  const row = FORECAST[Math.min(FORECAST.length, Math.max(1, orders.targetDepth)) - 1];

  // Between two measured thresholds, straight-line. The curve is smooth in this
  // range; pretending to more precision than eight sampled columns support
  // would be inventing numbers, which is the thing this file exists to avoid.
  const steps = RETREAT_STEPS;
  let lo = 0;
  while (lo < steps.length - 2 && steps[lo + 1] <= orders.retreatPct) lo += 1;
  const hi = Math.min(lo + 1, steps.length - 1);
  const span = steps[hi] - steps[lo];
  const t = span === 0 ? 0 : Math.min(1, Math.max(0, (orders.retreatPct - steps[lo]) / span));
  const blend = (a: number, b: number) =>
    !Number.isFinite(a) || !Number.isFinite(b) ? Infinity : a + (b - a) * t;

  const loot = LOOT_EFFECT[orders.lootPriority];
  const valueScale =
    (loot.value * loot.findChance) / (LOOT_EFFECT.gear.value * LOOT_EFFECT.gear.findChance);
  const saleScale = orders.spendPolicy === 'hoard' ? HOARD_SALE_BONUS : 1;

  return {
    goldPerHour: Math.round(blend(row[lo][0], row[hi][0]) * valueScale * saleScale),
    // Pension is service and depth, not loot, so the loot and sale multipliers
    // deliberately do not touch it. Insuring does raise it — that is the whole
    // of what the premium buys.
    pensionPerHour: Math.round(
      blend(row[lo][1], row[hi][1]) * (orders.spendPolicy === 'insure' ? INSURE_PENSION_BONUS : 1),
    ),
    hoursPerDeath: blend(row[lo][2], row[hi][2]),
  };
}
`;

  const target = new URL('../../shared/src/forecast.ts', import.meta.url);
  writeFileSync(
    target,
    `import { HOARD_SALE_BONUS, INSURE_PENSION_BONUS, LOOT_EFFECT } from './tuning.js';\n\n${out}`,
  );
  process.stderr.write(`\nWrote ${target.pathname}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
