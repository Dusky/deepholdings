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
  PENSION_DEPTH_FACTOR,
  PENSION_ESTATE_RATE,
  PENSION_SERVICE_RATE,
  REQUISITION_CATALOGUE,
  UNLOCK_CATALOGUE,
  pensionAward,
  type CaseFile,
  type InventoryItem,
  type Filing,
  type Registry,
  type RequisitionId,
  type UnlockId,
  STAFF_LADDER,
  COMMENDATION_CATALOGUE,
  type SiteId,
  type Transfer,
} from '@deepholdings/shared';
import { succeed } from '../src/domain/character.js';
import { resolve } from '../src/domain/resolve.js';
import { visit } from './officer.js';

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
/**
 * `--transfer` files Form T-1 once the pension catalogue is exhausted.
 *
 * Off by default so every number already in `balance.md` stays comparable. On,
 * it answers the question the whole slice exists for: does the second prestige
 * layer actually put new things past day forty, or does it only re-sell the
 * nineteen rungs the officer has already read?
 */
const TRANSFER = args.includes('--transfer');
/**
 * `--annexe` files standing orders for the second site from the first minute.
 *
 * Deliberately *not* gated on the Commendation here, and the reason is that
 * this measures the site rather than the route to it: what does a career look
 * like at 1.35 danger and 1.7 yield. Whether an officer can reach it is the
 * transfer layer's question, and `--transfer` answers that one.
 */
const ANNEXE = args.includes('--annexe');

interface Milestone {
  tick: number;
  what: string;
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
  /** Transfers filed, and Commendation rungs bought with what they paid. */
  careers: number;
  commendations: number;
  wages: number;
  hires: number;
  /**
   * The two halves of `pensionAward`, summed over every death.
   *
   * `pensionAward`'s own comment says the award "accrues with *service*", and
   * that claim is what makes the anti-death-farming property hold — a recruit
   * who lived forty minutes is supposed to be worth almost nothing. Nothing has
   * ever checked it. Both terms are recorded before the Service Credit
   * multiplier, which scales them equally and so cannot change the ratio.
   */
  fromService: number;
  fromEstate: number;
  /** Careers that died in under an hour, and what they were paid. */
  shortDeaths: number;
  shortPension: number;
  /**
   * Gold realised over the whole run, cabinet included.
   *
   * Added when the Annexe went in, because the two sites trade in different
   * currencies now: pension is service and depth, gold is yield, and a site
   * that pays 1.7x cannot be judged on a pension figure alone.
   */
  goldEarned: number;
  deepestFloor: number;
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
  let transfer: Transfer = { total: 0, spent: 0, unlocks: [], careers: 0 };
  let unpaidTicks = 0;
  let fromService = 0;
  let fromEstate = 0;
  let shortDeaths = 0;
  let shortPension = 0;
  let filingId = 0;
  let pension = 0;
  /**
   * Pension already spent on rungs, which the transfer award reads.
   *
   * This was hardcoded to zero on every visit, and the bug is instructive: the
   * officer buys the whole 460,000-gold unlock ladder, so `total` alone
   * under-reported pension ever banked by more than a third of it, and Form T-1
   * paid one Commendation where it owed four. Nothing failed — the run just
   * reported a prestige layer that barely pays.
   */
  let pensionSpent = 0;
  let deaths = 0;
  /** Deaths and pension earned per fortnight, to see whether income holds. */
  const perFortnight: { deaths: number; earned: number }[] = [];
  let deepest = 0;
  let goldEarned = 0;
  /**
   * Where the recruit is working right now.
   *
   * `--annexe` pins it from the first minute to measure the site in isolation.
   * Otherwise the officer moves the moment the Commendation is bought, which is
   * the sequence a player actually experiences: exhaust Holdings, transfer,
   * spend, and find that the floors are unfamiliar again.
   */
  let site: SiteId = ANNEXE ? 'annexe' : 'holdings';
  let tick = 0;

  while (tick < total) {
    const to = Math.min(tick + 240, total);
    const out = resolve({
      character, inventory, unlocks,
      orders: { ...DEFAULT_ORDERS, site },
      toTick: to, permitAppliedTick, caseFiles, filings,
      commendations: ANNEXE ? ['secondment1'] : transfer.unlocks,
    });

    for (const entry of out.journal) {
      const permit = /Permit D-(\d+) approved/.exec(entry.text);
      if (permit) {
        note(entry.tick, site === 'holdings' ? `Permit D-${permit[1]}` : `Annexe Permit D-${permit[1]}`);
      }
      const floor = /Down to Floor (\d+)/.exec(entry.text);
      if (floor && Number(floor[1]) > deepest) {
        deepest = Number(floor[1]);
        // Tagged with the site, because re-climbing the ladder somewhere with a
        // different bestiary, different loot and a different hazard profile is
        // new content — and an untagged name would dedupe against the floor of
        // the same number the officer walked a month ago, hiding the whole
        // re-climb from the timeline this tool exists to print.
        note(entry.tick, site === 'holdings' ? `Floor ${deepest}` : `Annexe Floor ${deepest}`);
      }
    }

    character = out.character;
    inventory = out.inventory;
    caseFiles = out.caseFiles;
    filings = out.filings;
    permitAppliedTick = out.permitAppliedTick;
    tick = character.lastResolvedTick;

    /**
     * One visit, through the shared model.
     *
     * `tools/officer.ts` is the single place that knows what an officer does
     * when they open the terminal — realise the cabinet, let the department
     * work, buy what is affordable, hire. Every harness goes through it now,
     * so a system added around `resolve()` cannot be invisible to this tool
     * the way case files and then staff both were.
     */
    const after = visit(
      {
        character, inventory, caseFiles, filings,
        pension: { total: pension, spent: pensionSpent, unlocks },
        registry,
        requisitions,
        transfer,
      },
      {
        sells: true,
        requisitions: { reserve: 200 },
        unlocks: true,
        staff: STAFF,
        hires: STAFF ? { reserve: 400 } : undefined,
        transfers: TRANSFER,
      },
      out.ticksResolved,
      () => `f${(filingId += 1)}`,
    );

    goldEarned += after.realised;
    character = after.character;
    inventory = after.inventory;
    caseFiles = after.caseFiles;
    filings = after.filings;
    registry = after.registry;
    pension = after.pension.total;
    pensionSpent = after.pension.spent;
    transfer = after.transfer;
    unlocks.length = 0;
    unlocks.push(...after.pension.unlocks);
    requisitions.length = 0;
    requisitions.push(...after.requisitions);
    if (registry.unpaid) unpaidTicks += out.ticksResolved;

    for (const id of after.boughtRequisitions) {
      note(tick, `Requisition: ${REQUISITION_CATALOGUE.find((e) => e.id === id)!.label}`);
    }
    for (const id of after.boughtUnlocks) {
      note(tick, `Unlock: ${UNLOCK_CATALOGUE.find((e) => e.id === id)!.label}`);
    }
    for (const id of after.hired) {
      note(tick, `Registry: ${STAFF_LADDER.find((e) => e.id === id)!.label}`);
    }
    for (const id of after.boughtCommendations) {
      note(tick, `Commendation: ${COMMENDATION_CATALOGUE.find((e) => e.id === id)!.label}`);
    }
    // The Secondment is the only Commendation that moves the recruit. Taking it
    // means the floors start again somewhere else, so the deepest-floor
    // watermark has to start again with them.
    if (!ANNEXE && site === 'holdings' && after.transfer.unlocks.includes('secondment1')) {
      site = 'annexe';
      deepest = 0;
      note(tick, 'Seconded to the Annexe');
    }
    /**
     * A transfer issues a fresh posting, which `visit` cannot do — it has no
     * way to make a recruit. Handled here for the same reason the death branch
     * below is: `succeed` is the only door, and the harness has to walk through
     * it exactly as the server does.
     */
    if (after.transferred) {
      note(tick, `Transfer: posting ${transfer.careers + 1}`);
      const posting = succeed({
        id: `${accountId}-p${transfer.careers + 1}`, accountId,
        previous: character, depthReached: character.depth,
        unlocks: [], atTick: tick,
        commendations: transfer.unlocks, posting: true,
      });
      character = posting.character;
      inventory = posting.inventory;
      caseFiles = posting.caseFiles;
      filings = posting.filings;
      permitAppliedTick = posting.permitAppliedTick;
      // A new posting has no deepest floor on record: the permit ladder starts
      // again, so counting the old one would mark every floor as already seen
      // and hide the entire re-climb from the timeline.
      deepest = 0;
    }

    if (!character.alive) {
      deaths += 1;
      const window = Math.floor(tick / (14 * 1440));
      while (perFortnight.length <= window) perFortnight.push({ deaths: 0, earned: 0 });
      perFortnight[window].deaths += 1;
      const service = tick - character.bornTick;
      const estate = character.gold + inventory.reduce((a, i) => a + i.unitValue * i.quantity, 0);
      const award = pensionAward(service, deepest, estate, unlocks, transfer.unlocks);
      perFortnight[window].earned += award;
      pension += award;

      // The same two terms `pensionAward` adds together, kept apart.
      fromService += service * PENSION_SERVICE_RATE * (1 + deepest * PENSION_DEPTH_FACTOR);
      fromEstate += estate * PENSION_ESTATE_RATE;
      if (service < 60) {
        shortDeaths += 1;
        shortPension += award;
      }
      n += 1;
      record = succeed({
        id: `${accountId}-${n}`, accountId, previous: character,
        depthReached: character.depth, unlocks, atTick: tick,
        commendations: transfer.unlocks,
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
    careers: transfer.careers,
    commendations: transfer.unlocks.length,
    wages: registry.spent,
    // Rungs, not members: there are only ever three posts, so counting rows
    // would report a full department the moment each was appointed.
    hires: registry.staff.reduce((total, member) => total + (member.tier ?? 1), 0),
    fromService,
    fromEstate,
    shortDeaths,
    shortPension,
    goldEarned,
    deepestFloor: deepest,
  };
}

const runs = Array.from({ length: RUNS }, (_, i) => playOne(i));
const day = (tick: number) => (tick / 1440).toFixed(1);
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

console.log(
  `${RUNS} careers x ${DAYS} days, an officer who spends as soon as they can` +
    `${STAFF ? ', with a department' : ''}${TRANSFER ? ', who transfers when the ladder runs out' : ''}` +
    `${ANNEXE ? ', working the Annexe' : ''}\n`,
);

/**
 * Check-ins a day, and why this number is the whole point of the section below.
 *
 * Product goal #3 says two check-ins a day should be plenty, and the game is
 * built so that absence costs nothing. That makes **elapsed days the wrong unit
 * for measuring novelty**, and reporting in days is why the content cliff read
 * as a distant problem for months.
 *
 * A day is not a unit of play here — it is a unit of waiting. The player
 * experiences this game as a sequence of short visits, so the honest question is
 * "how many times can I open this before it stops showing me anything new", and
 * the honest answer at day 32.6 is about sixty-five. Against active-playtime
 * figures for the games in `docs/research/progression-depth.md` — Melvor's 384
 * hours, NGU's "over a year" — sixty-five short visits is four or five hours of
 * a player's attention.
 *
 * Two is deliberately the *generous* reading. An engaged player checks in more
 * often and exhausts the novelty sooner, so this figure is a ceiling.
 */
const SESSIONS_PER_DAY = 2;
const TOTAL_SESSIONS = DAYS * SESSIONS_PER_DAY;
const sessionOf = (tick: number) => Math.ceil((tick / 1440) * SESSIONS_PER_DAY);

console.log('--- how long until nothing is new ---');
const lasts = runs.map((r) => r.lastNewThing);
const medianLast = med(lasts);
console.log(
  `median ${sessionOf(medianLast)} sessions  ` +
    `earliest ${sessionOf(Math.min(...lasts))}  latest ${sessionOf(Math.max(...lasts))}` +
    `   (at ${SESSIONS_PER_DAY} check-ins a day)`,
);
console.log(
  `then ${TOTAL_SESSIONS - sessionOf(medianLast)} of the run's ${TOTAL_SESSIONS} sessions have nothing new in them`,
);

// Density, not just the endpoint. A run whose novelty is front-loaded into the
// first ten sessions and a run that spreads it evenly both report the same "last
// new thing", and they are not the same game.
const counts = runs.map((r) => r.milestones.length);
const withSomething = runs.map(
  (r) => new Set(r.milestones.map((m) => sessionOf(m.tick))).size,
);
console.log(
  `${med(counts)} new things across the whole run — ` +
    `${med(withSomething)} sessions of ${TOTAL_SESSIONS} contain one ` +
    `(${((med(withSomething) / TOTAL_SESSIONS) * 100).toFixed(1)}%)`,
);
console.log(
  `in days, for comparison: median day ${day(medianLast)}  ` +
    `earliest ${day(Math.min(...lasts))}  latest ${day(Math.max(...lasts))}\n`,
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
  console.log(`registry rungs:      ${med(runs.map((r) => r.hires))} of ${STAFF_LADDER.length}`);
  console.log(`hire + wages, total: ${med(runs.map((r) => r.wages))} gold`);
  const stalled = runs.map((r) => (r.unpaidTicks / (DAYS * 1440)) * 100);
  console.log(`time unpaid:         ${med(stalled).toFixed(1)}% of the run`);
}

if (TRANSFER) {
  console.log('\n--- the officer\'s own prestige ---');
  console.log(`transfers filed:     ${med(runs.map((r) => r.careers))}`);
  console.log(
    `commendation rungs:  ${med(runs.map((r) => r.commendations))} of ${COMMENDATION_CATALOGUE.length}`,
  );
}

console.log(`gold realised:       ${med(runs.map((r) => r.goldEarned)).toLocaleString()}`);
console.log(`deepest floor:       ${med(runs.map((r) => r.deepestFloor))}`);

console.log('\n--- where the pension actually comes from ---');
{
  const service = med(runs.map((r) => r.fromService));
  const estate = med(runs.map((r) => r.fromEstate));
  // Everything ever banked, Service Credit included. The calibration target
  // when the formula changes: the shape may move, the total should not.
  const lifetime = med(runs.map((r) => r.perFortnight.reduce((a, w) => a + w.earned, 0)));
  console.log(`lifetime pension:    ${lifetime.toLocaleString()}`);
  const share = (estate / (service + estate)) * 100;
  console.log(`service term:        ${Math.round(service).toLocaleString()}`);
  console.log(`estate term:         ${Math.round(estate).toLocaleString()}`);
  console.log(`estate is            ${share.toFixed(1)}% of the award, before Service Credit`);
  const short = med(runs.map((r) => r.shortDeaths));
  const paid = med(runs.map((r) => r.shortPension));
  console.log(
    `deaths under an hour: ${short}, paid ${Math.round(paid).toLocaleString()} ` +
      `(${short > 0 ? Math.round(paid / short).toLocaleString() : 0} each)`,
  );
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
