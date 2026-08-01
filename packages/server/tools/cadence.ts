/**
 * Cadence probe.
 *
 * M4's criterion is "something visible moves every session", where a session
 * is a check-in and the design assumes two a day. So: run the real resolver
 * over N seeded careers on the *shipped default orders*, cut the journal into
 * 12-hour windows, and count how many windows contain nothing.
 *
 * Two classes of line:
 *   genuine — a promotion, a permit filed or approved, a death, a successor,
 *             or a new deepest floor. State changed.
 *   floor   — the twice-daily service review. Its number climbs, so it is not
 *             noise, but it is guaranteed and therefore proves nothing about
 *             whether the game moved.
 *
 * It drives `resolve()` directly rather than the server, deliberately. The
 * dev fast-forward endpoint used to replay one hour on a loop (see
 * `advanceTime`), and every balance number taken through it was wrong. A
 * harness that never touches an endpoint cannot inherit an endpoint's bugs.
 *
 *   RETREAT=38 DEPTH=12 RUNS=20 DAYS=14 npm run cadence -w @deepholdings/server
 */
import {
  DEFAULT_ORDERS,
  pensionAward,
  type InventoryItem,
  type StandingOrders,
} from '@deepholdings/shared';
import { succeed } from '../src/domain/character.js';
import { resolve } from '../src/domain/resolve.js';

const WINDOW = 720; // twelve hours, in ticks
const DAYS = Number(process.env.DAYS ?? 14);
const RUNS = Number(process.env.RUNS ?? 40);
const TOTAL = DAYS * 1440;
const EPOCH = Number(process.env.EPOCH ?? 0);

/** The shipped defaults unless a sweep asks for something else. */
const ORDERS: StandingOrders = {
  ...DEFAULT_ORDERS,
  targetDepth: Number(process.env.DEPTH ?? DEFAULT_ORDERS.targetDepth),
  retreatPct: Number(process.env.RETREAT ?? DEFAULT_ORDERS.retreatPct),
};

/**
 * State actually changed. Deliberately excludes every line that repeats on a
 * timer while nothing moves — "Descent limited pending grade review" fires
 * every three hours for as long as the recruit is stuck, so counting it would
 * fill almost every window with a report that the game is stalled. That is
 * the opposite of the thing being measured.
 */
const GENUINE = [
  /Permit D-\d+ approved/,
  /application filed/,
  /Grade review passed/,
  /died on Floor/,
];
const FLOOR = /Service review/;

interface Career {
  windows: number[]; // genuine events per window
  floors: number[]; // floor lines per window
  deaths: number;
  finalLevel: number;
  deepest: number;
  pension: number;
  permitTier: number;
}

function runCareer(seed: number): Career {
  const accountId = `cadence-${seed}`;
  const windows = new Array(Math.ceil(TOTAL / WINDOW)).fill(0);
  const floors = new Array(Math.ceil(TOTAL / WINDOW)).fill(0);

  let n = 1;
  const first = succeed({
    id: `${accountId}-${n}`,
    accountId,
    previous: null,
    depthReached: 0,
    unlocks: [],
    atTick: EPOCH,
  });
  let character = first.character;
  let inventory: InventoryItem[] = first.inventory;
  let permitAppliedTick: number | null = first.permitAppliedTick;

  let deaths = 0;
  let deepest = 0;
  let pension = 0;
  const chunk = 240;
  let tick = EPOCH;

  while (tick < EPOCH + TOTAL) {
    const to = Math.min(tick + chunk, EPOCH + TOTAL);
    const out = resolve({
      character,
      inventory,
      orders: ORDERS,
      unlocks: [],
      toTick: to,
      permitAppliedTick,
    });

    for (const entry of out.journal) {
      const w = Math.min(windows.length - 1, Math.floor((entry.tick - EPOCH) / WINDOW));
      if (FLOOR.test(entry.text)) floors[w] += 1;
      else if (GENUINE.some((re) => re.test(entry.text))) windows[w] += 1;
      else {
        // A new deepest floor is genuine; the same floor again is not.
        const m = /Descending\. Floor (\d+) reached/.exec(entry.text);
        if (m && Number(m[1]) > deepest) {
          deepest = Number(m[1]);
          windows[w] += 1;
        }
      }
    }

    character = out.character;
    inventory = out.inventory;
    permitAppliedTick = out.permitAppliedTick;
    tick = character.lastResolvedTick;

    if (character.hp <= 0) {
      deaths += 1;
      pension += pensionAward(
        tick - character.bornTick,
        character.depth,
        character.gold + inventory.reduce((n, i) => n + i.unitValue * i.quantity, 0),
        [],
      );
      n += 1;
      const heir = succeed({
        id: `${accountId}-${n}`,
        accountId,
        previous: character,
        depthReached: character.depth,
        unlocks: [],
        atTick: tick,
      });
      // The successor is a genuine event in the window they arrive in.
      windows[Math.min(windows.length - 1, Math.floor((tick - EPOCH) / WINDOW))] += 1;
      character = heir.character;
      inventory = heir.inventory;
      permitAppliedTick = heir.permitAppliedTick;
    }
  }

  return {
    windows,
    floors,
    deaths,
    finalLevel: character.level,
    deepest,
    pension,
    permitTier: character.permitTier,
  };
}

const careers = Array.from({ length: RUNS }, (_, i) => runCareer(i));

const totalWindows = careers.reduce((n, c) => n + c.windows.length, 0);
const emptyGenuine = careers.reduce(
  (n, c) => n + c.windows.filter((v) => v === 0).length,
  0,
);
const emptyAll = careers.reduce(
  (n, c) => n + c.windows.filter((v, i) => v === 0 && c.floors[i] === 0).length,
  0,
);
const genuineEvents = careers.reduce((n, c) => n + c.windows.reduce((a, b) => a + b, 0), 0);

// The worst career is what a player actually experiences, so report the spread
// and not only the mean.
const perCareerEmpty = careers
  .map((c) => c.windows.filter((v) => v === 0).length / c.windows.length)
  .sort((a, b) => a - b);
const pct = (q: number) => perCareerEmpty[Math.min(perCareerEmpty.length - 1, Math.floor(q * perCareerEmpty.length))];

// The longest run of consecutive silent windows anywhere — "how long can the
// game go without moving" is the question the criterion is really asking.
let longestDry = 0;
for (const c of careers) {
  let run = 0;
  for (const v of c.windows) {
    run = v === 0 ? run + 1 : 0;
    if (run > longestDry) longestDry = run;
  }
}

console.log(`orders: depth ${ORDERS.targetDepth}  retreat ${ORDERS.retreatPct}%`);
console.log(`runs ${RUNS}  days ${DAYS}  windows/career ${careers[0].windows.length}  window ${WINDOW}t (12h)`);
console.log(`genuine events        ${genuineEvents}  (${(genuineEvents / (RUNS * DAYS)).toFixed(2)} per career-day)`);
console.log(`windows with nothing  ${emptyGenuine}/${totalWindows} = ${((emptyGenuine / totalWindows) * 100).toFixed(1)}% genuine-empty`);
console.log(`                      ${emptyAll}/${totalWindows} = ${((emptyAll / totalWindows) * 100).toFixed(1)}% empty including the service review`);
console.log(`per-career genuine-empty share: p10 ${(pct(0.1) * 100).toFixed(0)}%  median ${(pct(0.5) * 100).toFixed(0)}%  p90 ${(pct(0.9) * 100).toFixed(0)}%  worst ${(perCareerEmpty[perCareerEmpty.length - 1] * 100).toFixed(0)}%`);
console.log(`longest silent stretch: ${longestDry} windows = ${(longestDry * WINDOW) / 1440} days`);
console.log(
  `deaths per career: mean ${(careers.reduce((n, c) => n + c.deaths, 0) / RUNS).toFixed(2)}  ` +
    `none in ${careers.filter((c) => c.deaths === 0).length}/${RUNS}`,
);
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log(
  `pension banked: median ${med(careers.map((c) => c.pension))}  ` +
    `none in ${careers.filter((c) => c.pension === 0).length}/${RUNS}`,
);
console.log(
  `final grade: min ${Math.min(...careers.map((c) => c.finalLevel))}  ` +
    `median ${med(careers.map((c) => c.finalLevel))}  ` +
    `max ${Math.max(...careers.map((c) => c.finalLevel))}`,
);
console.log(
  `final permit: min D-${Math.min(...careers.map((c) => c.permitTier))}  ` +
    `median D-${med(careers.map((c) => c.permitTier))}  ` +
    `max D-${Math.max(...careers.map((c) => c.permitTier))}`,
);
