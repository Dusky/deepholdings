/**
 * The shared officer's visit.
 *
 * Every test here exists because the extraction that created `tools/officer.ts`
 * got it wrong first, and in both cases the harnesses reported a plausible
 * different game rather than failing. That is the failure mode worth guarding:
 * a balance tool does not crash when it is wrong, it publishes a number.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EMPTY_REGISTRY,
  EMPTY_TRANSFER,
  REQUISITION_CATALOGUE,
  STAFF_CATALOGUE,
  STAFF_LADDER,
  UNLOCK_CATALOGUE,
  type Pension,
  type Registry,
  type StaffRole,
  type UnlockId,
} from '@deepholdings/shared';
import { succeed } from '../src/domain/character.js';
import { visit, cabinetValue, type VisitState } from '../tools/officer.js';

function stateOf(overrides: Partial<VisitState> = {}): VisitState {
  const start = succeed({
    id: 'c1', accountId: 'a1', previous: null, depthReached: 0, unlocks: [], atTick: 0,
  });
  return {
    character: { ...start.character, gold: 10_000, standing: 10, lastResolvedTick: 1000 },
    inventory: [],
    caseFiles: [],
    filings: [],
    pension: { total: 0, spent: 0, unlocks: [] },
    registry: EMPTY_REGISTRY,
    requisitions: [],
    transfer: EMPTY_TRANSFER,
    ...overrides,
  };
}

function registryOf(...roles: StaffRole[]): Registry {
  return {
    staff: roles.map((role) => ({
      role,
      policy: STAFF_CATALOGUE.find((spec) => spec.role === role)!.policyDefault,
    })),
    spent: 0,
    unpaid: false,
  };
}

test('an empty policy is a no-op', () => {
  // `cadence.ts` runs on exactly this: the officer who never visits. If an
  // empty policy ever started doing something, that probe would silently stop
  // measuring the new player it exists to measure.
  const state = stateOf({
    inventory: [{ name: 'Amulet', note: 'x1', quantity: 1, unitValue: 500, category: 'relics' }],
  });
  const after = visit(state, {}, 60);

  assert.equal(after.character.gold, state.character.gold);
  assert.equal(after.inventory.length, 1);
  assert.equal(after.realised, 0);
  assert.deepEqual(after.boughtRequisitions, []);
  assert.deepEqual(after.boughtUnlocks, []);
  assert.deepEqual(after.hired, []);
});

test('the caller keeps nothing the visit can write through', () => {
  /**
   * The regression this file was written for.
   *
   * `pension` used to be returned by reference whenever no rung was bought, so
   * `result.pension.unlocks` *was* the caller's array. A harness doing the
   * obvious write-back — empty the array, push the result back into it —
   * emptied the array it was about to copy from, and wiped every unlock on
   * every visit. Nineteen rungs of content vanished from a ninety-day run and
   * nothing failed; the tool just reported a shorter game.
   */
  const unlocks: UnlockId[] = [UNLOCK_CATALOGUE[0].id];
  const requisitions = [REQUISITION_CATALOGUE[0].id];
  const pension: Pension = { total: 0, spent: 0, unlocks };
  const state = stateOf({ pension, requisitions: [...requisitions] });
  const inventory = state.inventory;

  const after = visit(state, {}, 60);

  assert.notEqual(after.pension, state.pension, 'pension object is shared');
  assert.notEqual(after.pension.unlocks, unlocks, 'the unlock array is shared');
  assert.notEqual(after.requisitions, state.requisitions, 'the requisition array is shared');
  assert.notEqual(after.registry, state.registry, 'the registry is shared');
  assert.notEqual(after.inventory, inventory, 'the inventory array is shared');
  assert.notEqual(after.character, state.character, 'the character is shared');

  // And the destructive write-back a harness actually performs is safe.
  const copy = [...after.pension.unlocks];
  unlocks.length = 0;
  unlocks.push(...after.pension.unlocks);
  assert.deepEqual(unlocks, copy);
});

test('selling realises the cabinet at book value', () => {
  const state = stateOf({
    inventory: [
      { name: 'Boots', note: 'x3', quantity: 3, unitValue: 40, category: 'gear' },
      { name: 'Amulet', note: 'x1', quantity: 1, unitValue: 500, category: 'relics' },
    ],
  });
  const after = visit(state, { sells: true }, 60);

  assert.equal(after.realised, 620);
  assert.equal(cabinetValue(state.inventory), 620);
  assert.equal(after.character.gold, 10_620);
  assert.deepEqual(after.inventory, []);
});

test('requisitions are bought in ladder order and never below the reserve', () => {
  const after = visit(stateOf(), { requisitions: { reserve: 5_000 } }, 60);

  assert.ok(after.boughtRequisitions.length > 1, `bought ${after.boughtRequisitions.length}`);
  assert.ok(after.character.gold >= 5_000, `left ${after.character.gold}`);
  for (const id of after.boughtRequisitions) {
    const entry = REQUISITION_CATALOGUE.find((e) => e.id === id)!;
    if (entry.tier === 1) continue;
    const below = REQUISITION_CATALOGUE.find(
      (e) => e.track === entry.track && e.tier === entry.tier - 1,
    )!;
    assert.ok(after.requisitions.includes(below.id), `${id} bought before ${below.id}`);
  }
});

test('hiring comes before the equipment ladder', () => {
  /**
   * Not a stylistic ordering. Posts cost 800/2400/4800 against requisition
   * rungs an order of magnitude cheaper, so an officer who bought equipment
   * first would never clear the hiring bar early — and a `--staff` run would
   * measure a department that arrives weeks late rather than the department.
   *
   * With 900 gold and a reserve of nothing, both are affordable; only the one
   * that runs first gets paid for.
   */
  const after = visit(
    stateOf({ character: { ...stateOf().character, gold: 900 } }),
    { requisitions: { reserve: 0 }, hires: { reserve: 0 } },
    60,
  );

  assert.deepEqual(after.hired, ['clerk1'], 'the Filing Clerk was not appointed first');
  assert.equal(after.character.gold, 100);
  assert.deepEqual(after.boughtRequisitions, []);
});

test('rungs the Junior Officer redeems are still reported as bought', () => {
  /**
   * The second regression. `boughtUnlocks` was appended to at the point the
   * *officer* purchased, which missed every rung `runStaff` redeemed first —
   * so a harness building its timeline from it stopped seeing the department's
   * purchases as events at all, and reported the game running out of new
   * things a fortnight early.
   */
  const cheapest = [...UNLOCK_CATALOGUE].sort((a, b) => a.cost - b.cost)[0];
  const after = visit(
    stateOf({
      registry: registryOf('officer'),
      pension: { total: cheapest.cost, spent: 0, unlocks: [] },
    }),
    { staff: true },
    60,
  );

  assert.ok(after.pension.unlocks.includes(cheapest.id), 'the post redeemed nothing');
  assert.deepEqual(
    after.boughtUnlocks,
    [cheapest.id],
    'the redemption was not reported to the caller',
  );
});

test('the department works the span before the cabinet is realised', () => {
  // Reversed, the clerk arrives at an empty cabinet and every harness reports
  // the post doing nothing — which is what the server's own order avoids.
  const after = visit(
    stateOf({
      registry: registryOf('clerk'),
      inventory: [{ name: 'Boots', note: 'x3', quantity: 3, unitValue: 40, category: 'gear' }],
    }),
    { staff: true },
    60,
  );

  assert.deepEqual(after.inventory, [], 'the clerk never saw the stack');
  assert.match(after.notes.at(-1)!, /liquidated/);
});

test('staff can be let to work without being hired, and hired without working', () => {
  // The two flags are independent so a harness can model a department that was
  // inherited rather than built — and so `--staff` off means off, not "hire
  // them but pay no wages", which would be a free department.
  const worked = visit(stateOf({ registry: registryOf('clerk') }), { staff: true }, 60);
  assert.ok(worked.registry.spent > 0, 'no wages were charged');
  assert.deepEqual(worked.hired, []);

  // Enough for the whole ladder, which is 324,000 across nine rungs.
  const rich = stateOf({ character: { ...stateOf().character, gold: 400_000 } });
  const hiredOnly = visit(rich, { hires: { reserve: 0 } }, 60);
  assert.equal(hiredOnly.hired.length, STAFF_LADDER.length, 'the whole ladder was affordable');
  assert.equal(
    hiredOnly.registry.spent,
    STAFF_LADDER.reduce((total, rung) => total + rung.cost, 0),
    'the ladder was not paid for in full',
  );
});
