/**
 * Special Assignments, and the restriction that has to actually bite.
 *
 * A challenge that does not change the game is a label. So most of what is
 * tested here is that each restriction is *observable* — that a career run
 * under it comes out measurably different from one that is not.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  ASSIGNMENT_CATALOGUE,
  DEFAULT_ORDERS,
  GUILD_OBJECTIVES,
  assignmentProgress,
  assignmentSpec,
  objectiveForCycle,
  type AssignmentRestriction,
} from '@deepholdings/shared';
import { succeed } from '../src/domain/character.js';
import { resolve } from '../src/domain/resolve.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { adapters } from './adapters.js';

const config = loadConfig({ NODE_ENV: 'test', TOKEN_SECRET: 'test-secret', DEV_TOOLS: 'true' });

/** A fortnight, one recruit lineage, under whatever restriction is named. */
function career(restriction: AssignmentRestriction, seed: string, unlocks = ALL_UNLOCKS) {
  const start = succeed({
    id: seed, accountId: seed, previous: null, depthReached: 0, unlocks: [], atTick: 0,
  });
  let character = start.character;
  let inventory = start.inventory;
  let caseFiles = start.caseFiles;
  let permitAppliedTick: number | null = start.permitAppliedTick;
  let deepest = 0;
  let files = 0;
  let earned = 0;
  let n = 1;

  for (let tick = 0; tick < 14 * 1440; ) {
    const out = resolve({
      character, inventory, caseFiles, permitAppliedTick,
      orders: DEFAULT_ORDERS, unlocks,
      toTick: Math.min(tick + 240, 14 * 1440),
      restriction,
    });
    deepest = Math.max(deepest, out.counters.deepestFloor);
    files += out.counters.caseFilesFound;
    earned += Math.max(0, out.counters.goldAfter - out.counters.goldBefore);
    character = out.character;
    inventory = out.inventory;
    caseFiles = out.caseFiles;
    permitAppliedTick = out.permitAppliedTick;
    tick = character.lastResolvedTick;
    inventory = [];

    if (!character.alive) {
      n += 1;
      const heir = succeed({
        id: `${seed}-${n}`, accountId: seed, previous: character,
        depthReached: character.depth, unlocks: [], atTick: tick,
      });
      character = heir.character;
      inventory = heir.inventory;
      caseFiles = heir.caseFiles;
      permitAppliedTick = heir.permitAppliedTick;
    }
  }
  return { deepest, files, earned, level: character.level };
}

const ALL_UNLOCKS = ['stipend1', 'stipend2', 'stipend3', 'recruit1', 'recruit2', 'recruit3'] as const;

test('every assignment in the catalogue restricts something', () => {
  // A spec with an empty restriction is a label, not a challenge. Cheap to
  // write by accident when adding one.
  for (const spec of ASSIGNMENT_CATALOGUE) {
    assert.ok(
      Object.keys(spec.restriction).length > 0,
      `${spec.id} restricts nothing`,
    );
    assert.ok(spec.reward > 0, `${spec.id} pays nothing`);
    assert.ok(spec.target > 0, `${spec.id} has no target`);
  }
});

test('suspending pension entitlements is felt', () => {
  /**
   * `noUnlocks` is the flagship restriction and the cheapest: the catalogue is
   * already a parameter, so suspending it is passing an empty list. It has to
   * *matter*, or Unassisted Survey is a free Commendation.
   *
   * Measured on gold rather than grade, because the grade ladder tops out
   * against `MAX_DEPTH` either way — an unassisted recruit gets there slower
   * and still gets there. Hardship Stipend III is eleven gold a minute, so the
   * income curve is where the suspension is unmistakable.
   */
  const withThem = career({}, 'unl-a');
  const without = career({ noUnlocks: true }, 'unl-a');
  assert.ok(
    without.earned * 1.3 < withThem.earned,
    `the stipend should show: ${without.earned} against ${withThem.earned}`,
  );
});

test('a grade freeze holds, and the experience is not thrown away', () => {
  const capped = career({ gradeCap: 6 }, 'cap-a');
  assert.ok(capped.level <= 6, `grade reached ${capped.level}`);

  // Experience keeps accruing while frozen, so abandoning the assignment does
  // not reveal that the hours were deleted.
  const start = succeed({
    id: 'xp', accountId: 'xp', previous: null, depthReached: 0, unlocks: [], atTick: 0,
  });
  const out = resolve({
    character: { ...start.character, level: 6 },
    inventory: start.inventory,
    orders: DEFAULT_ORDERS, unlocks: [], caseFiles: [],
    toTick: 4000, permitAppliedTick: null,
    restriction: { gradeCap: 6 },
  });
  assert.equal(out.character.level, 6);
  assert.ok(out.character.xp > 0, 'experience was discarded rather than banked');
});

test('a forced site and a forced priority override the filed order', () => {
  const out = resolve({
    character: succeed({
      id: 's', accountId: 's', previous: null, depthReached: 0, unlocks: [], atTick: 0,
    }).character,
    inventory: [],
    orders: { ...DEFAULT_ORDERS, site: 'holdings', lootPriority: 'gold' },
    unlocks: [], caseFiles: [], toTick: 3000, permitAppliedTick: null,
    restriction: { site: 'annexe', lootPriority: 'knowledge' },
    commendations: ['secondment1'],
  });
  // The Annexe's bestiary is disjoint from Holdings', so one encounter name
  // proves the override reached the resolver rather than being dropped.
  const encounters = out.journal.filter((entry) => /Encountered:/.test(entry.text));
  assert.ok(encounters.length > 0, 'nothing happened, so nothing is proved');
  assert.ok(
    encounters.some((entry) => /Verger|Frost|Choir|Censer|Sexton|Cantor|Ossuary|Anchorite|Abbot|Bell|Penitent|Deacon|Novice|Moth|Draught|Lamplighter|Pale Hound|Cold Thing|Ice Wight|Reliquary|Snow/.test(entry.text)),
    'the recruit was not sent to the Annexe',
  );
});

test('progress is a watermark where it should be and a sum where it should be', () => {
  const spec = assignmentSpec('unassisted')!;
  const character = { level: 4, bornTick: 0, lastResolvedTick: 600 };
  // Depth is a watermark: reaching Floor 6 twice is not Floor 12.
  assert.equal(
    assignmentProgress(spec, 6, { deepestFloor: 5, floorsDescended: 9, caseFilesFound: 1 }, character, 0),
    6,
  );
  const floors = assignmentSpec('junior')!;
  assert.equal(
    assignmentProgress(floors, 100, { deepestFloor: 5, floorsDescended: 9, caseFilesFound: 1 }, character, 0),
    109,
  );
  // Service is measured from the later of acceptance and the recruit's birth,
  // so an assignment accepted mid-career does not credit the hours before it.
  const service = assignmentSpec('sole-charge')!;
  assert.equal(
    assignmentProgress(service, 0, { deepestFloor: 0, floorsDescended: 0, caseFilesFound: 0 }, character, 400),
    200,
  );
});

for (const { name, make } of adapters) {
  test(`accepting, completing and being paid (${name})`, async () => {
    const repo = make();
    await repo.init();
    const app = buildApp({ repo, config });
    const auth = await app.inject({
      method: 'POST', url: '/v1/auth/device',
      payload: { deviceId: `assign-${name}-${randomUUID()}` },
    });
    const { token, account } = auth.json() as { token: string; account: { id: string } };
    const headers = { authorization: `Bearer ${token}` };

    const accepted = await app.inject({
      method: 'POST', url: '/v1/assignments/accept', headers, payload: { id: 'unassisted' },
    });
    assert.equal(accepted.statusCode, 200);
    assert.equal(accepted.json().active, 'unassisted');

    // One at a time.
    const second = await app.inject({
      method: 'POST', url: '/v1/assignments/accept', headers, payload: { id: 'skeleton' },
    });
    assert.equal(second.statusCode, 400);

    /**
     * Drive it to the target. Unassisted Survey wants Floor 10.
     *
     * The claim matters: `advanceTime` stops at the first death and refuses to
     * resolve further ticks for a dead recruit, so a loop that does not file
     * for the pension advances the clock and nothing else — which is exactly
     * how three hand-written probes in this project measured nothing at all.
     */
    for (let i = 0; i < 60; i += 1) {
      await app.inject({
        method: 'POST', url: '/v1/dev/advance', headers, payload: { hours: 6 },
      });
      const state = (await app.inject({ method: 'GET', url: '/v1/state', headers })).json();
      if (state.pendingDeath) {
        await app.inject({ method: 'POST', url: '/v1/pension/claim', headers, payload: {} });
      }
      if ((await repo.getAssignments(account.id)).active === null) break;
    }

    const state = await repo.getAssignments(account.id);
    assert.equal(state.active, null, 'never completed');
    assert.deepEqual(state.completed, ['unassisted']);

    const transfer = await repo.getTransfer(account.id);
    assert.equal(transfer.total, assignmentSpec('unassisted')!.reward);

    // And it pays once: it cannot be taken again.
    const again = await app.inject({
      method: 'POST', url: '/v1/assignments/accept', headers, payload: { id: 'unassisted' },
    });
    assert.equal(again.statusCode, 409);
    await app.close();
  });

  test(`abandoning costs the progress and nothing else (${name})`, async () => {
    const repo = make();
    await repo.init();
    const app = buildApp({ repo, config });
    const auth = await app.inject({
      method: 'POST', url: '/v1/auth/device',
      payload: { deviceId: `abandon-${name}-${randomUUID()}` },
    });
    const { token, account } = auth.json() as { token: string; account: { id: string } };
    const headers = { authorization: `Bearer ${token}` };

    await app.inject({
      method: 'POST', url: '/v1/assignments/accept', headers, payload: { id: 'junior' },
    });
    await app.inject({ method: 'POST', url: '/v1/dev/advance', headers, payload: { hours: 6 } });
    const gold = (await repo.getActiveCharacterForUpdate(account.id))!.character.gold;

    const out = await app.inject({ method: 'POST', url: '/v1/assignments/abandon', headers });
    assert.equal(out.statusCode, 200);
    const state = await repo.getAssignments(account.id);
    assert.equal(state.active, null);
    assert.deepEqual(state.completed, [], 'abandoning must not count as completing');
    assert.equal(
      (await repo.getActiveCharacterForUpdate(account.id))!.character.gold,
      gold,
      'handing one back must not cost anything',
    );
    // And it can be taken again.
    const retaken = await app.inject({
      method: 'POST', url: '/v1/assignments/accept', headers, payload: { id: 'junior' },
    });
    assert.equal(retaken.statusCode, 200);
    await app.close();
  });

  test(`a plain state read moves the regional bar (${name})`, async () => {
    /**
     * The bug this caught, kept as a test.
     *
     * `loadState` and `loadStateInside` both resolve ticks and each carried its
     * own idea of what happens next, so the guild contribution — added to the
     * second — never fired for a player whose ticks resolved through a plain
     * `GET /v1/state`, which is most of them. Nothing failed; the bar just
     * advanced for people who happened to sell something.
     */
    const repo = make();
    await repo.init();
    const app = buildApp({ repo, config });
    const auth = await app.inject({
      method: 'POST', url: '/v1/auth/device',
      payload: { deviceId: `read-${name}-${randomUUID()}` },
    });
    const { token, account } = auth.json() as { token: string; account: { id: string } };
    const headers = { authorization: `Bearer ${token}` };

    /**
     * Roll the regional objective to one an eight-hour span can actually
     * satisfy. The world is a single shared row, so whichever objective the
     * guild suite left in force carries over — and "clear 300 permit
     * applications" is not something one recruit does before lunch. Without
     * this the test passes alone and fails in suite, which is the worst kind.
     */
    for (let i = 0; i < GUILD_OBJECTIVES.length; i += 1) {
      const world = await repo.getWorld();
      if (objectiveForCycle(world.guildCycle).metric === 'floors') break;
      await repo.addGuildProgress(objectiveForCycle(world.guildCycle).target);
    }

    // Move the clock without touching the account, so the only thing that
    // resolves the span is the GET.
    await app.inject({ method: 'POST', url: '/v1/dev/away', headers, payload: { hours: 8 } });
    const before = await repo.getGuildStanding(account.id);
    await app.inject({ method: 'GET', url: '/v1/state', headers });
    const after = await repo.getGuildStanding(account.id);

    assert.ok(
      after.contribution > before.contribution,
      'a plain read resolved ticks and contributed nothing',
    );
    await app.close();
  });
}

// ---- Form 4-E ---------------------------------------------------------------
//
// The one thing an officer at their desk can do that a standing order cannot,
// and the only place in the game where attention beats patience.

for (const { name, make } of adapters) {
  test(`expediting halves the wait, once per application (${name})`, async () => {
    const repo = make();
    await repo.init();
    const app = buildApp({ repo, config });
    const auth = await app.inject({
      method: 'POST', url: '/v1/auth/device',
      payload: { deviceId: `expedite-${name}-${randomUUID()}` },
    });
    const { token, account } = auth.json() as { token: string; account: { id: string } };
    const headers = { authorization: `Bearer ${token}` };

    // Run until an application is actually in processing, and fund it.
    let permit = null;
    for (let i = 0; i < 40 && !permit; i += 1) {
      await app.inject({ method: 'POST', url: '/v1/dev/advance', headers, payload: { hours: 1 } });
      const state = (await app.inject({ method: 'GET', url: '/v1/state', headers })).json();
      if (state.pendingDeath) {
        await app.inject({ method: 'POST', url: '/v1/pension/claim', headers, payload: {} });
        continue;
      }
      permit = state.pendingPermit;
    }
    assert.ok(permit, 'no application ever reached the permit office');
    assert.equal(permit.expedited, false);

    const record = (await repo.getActiveCharacterForUpdate(account.id))!;
    await repo.saveCharacter({
      ...record,
      character: { ...record.character, gold: permit.expediteCost + 500 },
    });
    const before = (await app.inject({ method: 'GET', url: '/v1/state', headers })).json();
    assert.ok(before.pendingPermit, 'the application cleared before it could be chased');
    const waitBefore = before.pendingPermit.secondsRemaining;

    const out = await app.inject({ method: 'POST', url: '/v1/permits/expedite', headers });
    assert.equal(out.statusCode, 200, out.body);
    const body = out.json();

    assert.equal(
      body.character.gold,
      before.character.gold - permit.expediteCost,
      'the fee was not taken',
    );
    assert.ok(
      body.pendingPermit === null || body.pendingPermit.secondsRemaining < waitBefore,
      `the wait did not shorten: ${waitBefore} -> ${body.pendingPermit?.secondsRemaining}`,
    );

    /**
     * Once per application — and specifically, *across a resolving read*.
     *
     * Both read paths rebuild the character record from the resolver's output,
     * and the first version of this dropped the marker while doing it. The rule
     * then held only for as long as no time passed between two attempts, which
     * is exactly the case a test written without this advance would cover. The
     * live UI showed it immediately: the button was still there afterwards.
     */
    await app.inject({ method: 'POST', url: '/v1/dev/advance', headers, payload: { hours: 1 } });
    const stillOpen = (await app.inject({ method: 'GET', url: '/v1/state', headers })).json();
    if (stillOpen.pendingPermit) {
      assert.equal(stillOpen.pendingPermit.expedited, true, 'the marker did not survive a read');
    }

    const goldAfter = (await repo.getActiveCharacterForUpdate(account.id))!.character.gold;
    const again = await app.inject({ method: 'POST', url: '/v1/permits/expedite', headers });
    assert.equal(again.statusCode, 409);
    assert.equal(
      (await repo.getActiveCharacterForUpdate(account.id))!.character.gold,
      goldAfter,
      'a refused filing must not charge',
    );
    await app.close();
  });

  test(`expediting is refused when nothing is being processed (${name})`, async () => {
    const repo = make();
    await repo.init();
    const app = buildApp({ repo, config });
    const auth = await app.inject({
      method: 'POST', url: '/v1/auth/device',
      payload: { deviceId: `expedite-none-${name}-${randomUUID()}` },
    });
    const { token } = auth.json() as { token: string };
    const headers = { authorization: `Bearer ${token}` };

    const out = await app.inject({ method: 'POST', url: '/v1/permits/expedite', headers });
    assert.equal(out.statusCode, 400);
    await app.close();
  });
}
