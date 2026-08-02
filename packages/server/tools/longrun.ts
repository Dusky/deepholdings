/**
 * The exhaustion curve: when does this game stop having new things in it?
 *
 * Every balance measurement in this project has run fourteen days, because
 * fourteen days is what the design talks about. `mobile-incrementals.md` made
 * that a problem: the two Play-native incrementals we will sit beside sell
 * "months or years", and nothing in any document here says what a player does
 * in month two.
 *
 * So this plays a career for ninety days and records the tick at which each
 * *new* thing happens for the first time — a permit tier, a floor, a prestige
 * rung, a requisition. The output is a timeline, and the number that matters
 * is the last entry on it: after that moment the game has nothing further to
 * show, and everything after it is repetition.
 *
 * The officer modelled is an engaged one who spends as soon as they can. That
 * is deliberately the *fastest* exhaustion: a casual player takes longer to
 * get there, but they get to the same place, and knowing the floor of "how
 * long until it runs out" is worth more than knowing an average.
 *
 *   npm run longrun -w @deepholdings/server -- --days 90 --runs 8
 */
import {
  DEFAULT_ORDERS,
  REQUISITION_CATALOGUE,
  UNLOCK_CATALOGUE,
  pensionAward,
  requisitionTier,
  unlockTier,
  type CaseFile,
  type InventoryItem,
  type Filing,
  type Registry,
  type RequisitionId,
  type UnlockId,
  STAFF_CATALOGUE,
  isHired,
} from '@deepholdings/shared';
import { succeed } from '../src/domain/character.js';
import { resolve } from '../src/domain/resolve.js';
import { runStaff } from '../src/domain/staff.js';

const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : Number(args[at + 1]);
};
const DAYS = flag('days', 90);
const RUNS = flag('runs', 8);
/**
 * `--staff` hires the department as soon as each post is affordable.
 *
 * Off by default so the ninety-day curve still describes the game a player who
 * hires nobody sees, and so the numbers in `balance.md` stay comparable across
 * the session. On, it answers the two questions the Registry left open: does a
 * Filing Clerk move the exhaustion curve, and can an officer actually carry
 * six gold a minute without starving the recruit's resupply.
 *
 * This is also the gap that let staff ship unmeasured. Both harnesses model an
 * officer's visit and neither knew the department existed, because each has its
 * own copy of that loop — the same duplication that hid the case-file drop rate
 * and the missing "Case #… opened" event class before it.
 */
const STAFF = args.includes('--staff');

interface Milestone {
  tick: number;
  what: string;
}

/** The cheapest rung not yet owned, respecting ladder order. */
function nextUnlock(owned: readonly UnlockId[]) {
  return UNLOCK_CATALOGUE.filter(
    (e) => !owned.includes(e.id) && unlockTier(owned, e.track) === e.tier - 1,
  ).reduce<(typeof UNLOCK_CATALOGUE)[number] | null>(
    (best, e) => (best === null || e.cost < best.cost ? e : best),
    null,
  );
}

function nextRequisition(owned: readonly RequisitionId[]) {
  return REQUISITION_CATALOGUE.filter(
    (e) => !owned.includes(e.id) && requisitionTier(owned, e.track) === e.tier - 1,
  ).reduce<(typeof REQUISITION_CATALOGUE)[number] | null>(
    (best, e) => (best === null || e.cost < best.cost ? e : best),
    null,
  );
}

function playOne(seed: number): {
  milestones: Milestone[];
  lastNewThing: number;
  unlocks: number;
  requisitions: number;
  deaths: number;
  finalLevel: number;
  perFortnight: { deaths: number; earned: number }[];
  /** Minutes the department spent unpaid, and what it cost in wages. */
  unpaidTicks: number;
  wages: number;
  hires: number;
} {
  const accountId = `long-${seed}`;
  const total = DAYS * 1440;
  const milestones: Milestone[] = [];
  const seen = new Set<string>();

  const note = (tick: number, what: string) => {
    if (seen.has(what)) return;
    seen.add(what);
    milestones.push({ tick, what });
  };

  let n = 1;
  let record = succeed({
    id: `${accountId}-${n}`, accountId, previous: null, depthReached: 0, unlocks: [], atTick: 0,
  });
  let character = record.character;
  let inventory: InventoryItem[] = record.inventory;
  let caseFiles: CaseFile[] = record.caseFiles;
  let permitAppliedTick: number | null = record.permitAppliedTick;

  const unlocks: UnlockId[] = [];
  const requisitions: RequisitionId[] = [];
  let filings: Filing[] = [];
  let registry: Registry = { staff: [], spent: 0, unpaid: false };
  let unpaidTicks = 0;
  let filingId = 0;
  let pension = 0;
  let deaths = 0;
  /** Deaths and pension earned per fortnight, to see whether income holds. */
  const perFortnight: { deaths: number; earned: number }[] = [];
  let deepest = 0;
  let tick = 0;

  while (tick < total) {
    const to = Math.min(tick + 240, total);
    const out = resolve({
      character, inventory, orders: DEFAULT_ORDERS, unlocks,
      toTick: to, permitAppliedTick, caseFiles, filings,
    });

    for (const entry of out.journal) {
      const permit = /Permit D-(\d+) approved/.exec(entry.text);
      if (permit) note(entry.tick, `Permit D-${permit[1]}`);
      const floor = /Down to Floor (\d+)/.exec(entry.text);
      if (floor && Number(floor[1]) > deepest) {
        deepest = Number(floor[1]);
        note(entry.tick, `Floor ${deepest}`);
      }
    }

    character = out.character;
    inventory = out.inventory;
    caseFiles = out.caseFiles;
    filings = out.filings;
    permitAppliedTick = out.permitAppliedTick;
    tick = character.lastResolvedTick;

    /**
     * The department works the span, before the officer does anything.
     *
     * Ordered that way because it is the order the server uses — staff run
     * inside the read, and the officer's visit is what happens next. A harness
     * that let the officer sell first would have the clerk arriving to an
     * already-empty cabinet and would report them doing nothing.
     */
    if (STAFF && registry.staff.length > 0) {
      const worked = runStaff({
        character, inventory, caseFiles, filings,
        pension: { total: pension, spent: 0, unlocks },
        registry,
        ticksResolved: out.ticksResolved,
        newId: () => `f${(filingId += 1)}`,
      });
      character = worked.character;
      inventory = worked.inventory;
      caseFiles = worked.caseFiles;
      filings = worked.filings;
      pension = worked.pension.total;
      unlocks.length = 0;
      unlocks.push(...worked.pension.unlocks);
      registry = worked.registry;
      if (registry.unpaid) unpaidTicks += out.ticksResolved;
      for (const note_ of worked.notes) {
        if (/redeemed (.+)\. Pension/.test(note_)) {
          note(tick, `Unlock: ${/redeemed (.+)\. Pension/.exec(note_)![1]}`);
        }
      }
    }

    // The visit: realise the cabinet, then spend on everything affordable.
    const realised = inventory.reduce((n2, i) => n2 + i.unitValue * i.quantity, 0);
    if (realised > 0) {
      character = { ...character, gold: character.gold + realised };
      inventory = [];
    }

    // Hiring is spending, so it belongs with the rest of the visit — and the
    // officer modelled here spends as soon as they can.
    if (STAFF) {
      for (const spec of STAFF_CATALOGUE) {
        if (isHired(registry, spec.role)) continue;
        if (character.gold - spec.hire < 400) continue;
        character = { ...character, gold: character.gold - spec.hire };
        registry = {
          ...registry,
          staff: [...registry.staff, { role: spec.role, policy: spec.policyDefault }],
          spent: registry.spent + spec.hire,
        };
        note(tick, `Hire: ${spec.title}`);
      }
    }
    for (;;) {
      const rung = nextRequisition(requisitions);
      if (!rung || character.gold - rung.cost < 200) break;
      character = { ...character, gold: character.gold - rung.cost };
      requisitions.push(rung.id);
      note(tick, `Requisition: ${rung.label}`);
    }
    for (;;) {
      const rung = nextUnlock(unlocks);
      if (!rung || pension < rung.cost) break;
      pension -= rung.cost;
      unlocks.push(rung.id);
      note(tick, `Unlock: ${rung.label}`);
    }

    if (!character.alive) {
      deaths += 1;
      const window = Math.floor(tick / (14 * 1440));
      while (perFortnight.length <= window) perFortnight.push({ deaths: 0, earned: 0 });
      perFortnight[window].deaths += 1;
      const award = pensionAward(
        tick - character.bornTick,
        deepest,
        character.gold + inventory.reduce((a, i) => a + i.unitValue * i.quantity, 0),
        unlocks,
      );
      perFortnight[window].earned += award;
      pension += award;
      n += 1;
      record = succeed({
        id: `${accountId}-${n}`, accountId, previous: character,
        depthReached: character.depth, unlocks, atTick: tick,
      });
      character = record.character;
      inventory = record.inventory;
      caseFiles = record.caseFiles;
      filings = record.filings;
      permitAppliedTick = record.permitAppliedTick;
    }
  }

  milestones.sort((a, b) => a.tick - b.tick);
  return {
    milestones,
    lastNewThing: milestones.length ? milestones[milestones.length - 1].tick : 0,
    unlocks: unlocks.length,
    requisitions: requisitions.length,
    deaths,
    finalLevel: character.level,
    perFortnight,
    unpaidTicks,
    wages: registry.spent,
    hires: registry.staff.length,
  };
}

const runs = Array.from({ length: RUNS }, (_, i) => playOne(i));
const day = (tick: number) => (tick / 1440).toFixed(1);
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

console.log(
  `${RUNS} careers x ${DAYS} days, an officer who spends as soon as they can` +
    `${STAFF ? ', with a department' : ''}\n`,
);

console.log('--- when the last new thing happens ---');
const lasts = runs.map((r) => r.lastNewThing);
console.log(`median day ${day(med(lasts))}  earliest ${day(Math.min(...lasts))}  latest ${day(Math.max(...lasts))}`);
console.log(
  `then ${(DAYS - Number(day(med(lasts)))).toFixed(1)} days of the remaining ${DAYS} have nothing new in them\n`,
);

console.log('--- everything that ever happens, first career ---');
for (const m of runs[0].milestones) console.log(`  day ${day(m.tick).padStart(5)}  ${m.what}`);

console.log('\n--- content consumed ---');
console.log(`unlocks bought:      ${med(runs.map((r) => r.unlocks))} of ${UNLOCK_CATALOGUE.length}`);
console.log(`requisitions bought: ${med(runs.map((r) => r.requisitions))} of ${REQUISITION_CATALOGUE.length}`);
console.log(`deaths:              ${med(runs.map((r) => r.deaths))}`);
console.log(`final grade:         ${med(runs.map((r) => r.finalLevel))}`);

if (STAFF) {
  console.log('\n--- the department ---');
  console.log(`posts filled:        ${med(runs.map((r) => r.hires))} of ${STAFF_CATALOGUE.length}`);
  console.log(`hire + wages, total: ${med(runs.map((r) => r.wages))} gold`);
  const stalled = runs.map((r) => (r.unpaidTicks / (DAYS * 1440)) * 100);
  console.log(`time unpaid:         ${med(stalled).toFixed(1)}% of the run`);
}

console.log('\n--- does the income hold up? deaths and pension per fortnight ---');
const windows = Math.max(...runs.map((r) => r.perFortnight.length));
for (let w = 0; w < windows; w += 1) {
  const d = runs.map((r) => r.perFortnight[w]?.deaths ?? 0);
  const e = runs.map((r) => r.perFortnight[w]?.earned ?? 0);
  console.log(
    `  days ${String(w * 14).padStart(2)}-${String((w + 1) * 14).padStart(2)}  ` +
      `deaths ${med(d).toString().padStart(3)}   pension ${med(e).toString().padStart(7)}`,
  );
}
