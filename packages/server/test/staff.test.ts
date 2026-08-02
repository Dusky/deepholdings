import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EMPTY_REGISTRY,
  UNLOCK_CATALOGUE,
  clampPolicy,
  payrollPerTick,
  staffSpec,
  type CaseFile,
  type Filing,
  type InventoryItem,
  type Pension,
  type Registry,
  type StaffRole,
} from '@deepholdings/shared';
import { succeed } from '../src/domain/character.js';
import { runStaff, type StaffInput } from '../src/domain/staff.js';

const NO_PENSION: Pension = { total: 0, spent: 0, unlocks: [] };

function registryOf(...roles: { role: StaffRole; policy?: number }[]): Registry {
  return {
    staff: roles.map(({ role, policy }) => ({
      role,
      policy: policy ?? staffSpec(role)!.policyDefault,
    })),
    spent: 0,
    unpaid: false,
  };
}

function input(overrides: Partial<StaffInput> = {}): StaffInput {
  const start = succeed({
    id: 'c1', accountId: 'a1', previous: null, depthReached: 0, unlocks: [], atTick: 0,
  });
  let n = 0;
  return {
    character: { ...start.character, gold: 5000, standing: 10, lastResolvedTick: 1000 },
    inventory: [],
    caseFiles: [],
    filings: [],
    pension: NO_PENSION,
    registry: EMPTY_REGISTRY,
    ticksResolved: 60,
    newId: () => `filing-${(n += 1)}`,
    ...overrides,
  };
}

const stack = (name: string, unitValue: number, quantity = 1): InventoryItem => ({
  name, note: `x${quantity}`, quantity, unitValue, category: 'gear',
});

test('an empty registry costs nothing and does nothing', () => {
  const out = runStaff(input());
  assert.equal(out.changed, false);
  assert.equal(out.notes.length, 0);
  assert.equal(out.character.gold, 5000);
});

test('wages are charged per minute resolved', () => {
  const registry = registryOf({ role: 'clerk' }, { role: 'officer' });
  const rate = payrollPerTick(registry);
  assert.equal(rate, staffSpec('clerk')!.upkeep + staffSpec('officer')!.upkeep);

  const out = runStaff(input({ registry, ticksResolved: 100 }));
  assert.equal(out.character.gold, 5000 - rate * 100);
  assert.equal(out.registry.spent, rate * 100);
  assert.equal(out.registry.unpaid, false);
});

test('staff who cannot be paid down tools rather than going into debt', () => {
  // Debt would be a spiral with nothing the officer could do about it. The
  // department takes what there is and stops, which is recoverable.
  const registry = registryOf({ role: 'clerk', policy: 500 });
  const out = runStaff(
    input({
      registry,
      ticksResolved: 1000,
      character: { ...input().character, gold: 20 },
      inventory: [stack('Boots, Serviceable', 10, 3)],
    }),
  );

  assert.equal(out.character.gold, 0, 'never negative');
  assert.equal(out.registry.unpaid, true);
  assert.equal(out.registry.spent, 20, 'they are owed what there was');
  assert.equal(out.inventory.length, 1, 'unpaid staff do no work');
  assert.match(out.notes[0], /Payroll short/);
});

test('the payroll notice is filed once, not on every read', () => {
  // A line per read while the purse is empty would bury the log in the one
  // state where the officer most needs to read it.
  const registry = { ...registryOf({ role: 'clerk' }), unpaid: true };
  const out = runStaff(input({ registry, character: { ...input().character, gold: 0 } }));
  assert.equal(out.registry.unpaid, true);
  assert.equal(out.notes.length, 0);
});

test('paying an overdue payroll says so', () => {
  const registry = { ...registryOf({ role: 'clerk' }), unpaid: true };
  const out = runStaff(input({ registry }));
  assert.equal(out.registry.unpaid, false);
  assert.match(out.notes[0], /resumed work/);
});

test('the Filing Clerk liquidates under the threshold and leaves the rest', () => {
  const out = runStaff(
    input({
      registry: registryOf({ role: 'clerk', policy: 100 }),
      inventory: [stack('Boots, Serviceable', 40, 3), stack('Amulet', 260)],
    }),
  );

  assert.equal(out.inventory.length, 1, 'the valuable stack stays');
  assert.equal(out.inventory[0].name, 'Amulet');
  // 3 x 40 at depot rates, minus one minute-hour of wages.
  const wages = staffSpec('clerk')!.upkeep * 60;
  assert.equal(out.character.gold, 5000 - wages + 120);
  assert.match(out.notes.at(-1)!, /liquidated 3 items across 1 stack/);
});

test('a clerk with a zero threshold sells nothing', () => {
  // The policy is the decision. Zero is a real answer — "hold everything" —
  // and it must not be read as "no policy, do the default".
  const out = runStaff(
    input({
      registry: registryOf({ role: 'clerk', policy: 0 }),
      inventory: [stack('Boots, Serviceable', 40, 3)],
    }),
  );
  assert.equal(out.inventory.length, 1);
});

test('the Junior Officer buys in ladder order and honours the reserve', () => {
  const cheapest = [...UNLOCK_CATALOGUE].sort((a, b) => a.cost - b.cost)[0];
  const pension: Pension = { total: cheapest.cost + 500, spent: 0, unlocks: [] };

  // With a reserve above what is left after the purchase, nothing is bought.
  const held = runStaff(
    input({ registry: registryOf({ role: 'officer', policy: 1000 }), pension }),
  );
  assert.deepEqual(held.pension.unlocks, []);

  const spent = runStaff(input({ registry: registryOf({ role: 'officer', policy: 0 }), pension }));
  assert.ok(spent.pension.unlocks.includes(cheapest.id), `expected ${cheapest.id}`);
  assert.equal(spent.pension.total, pension.total - cheapest.cost);
  assert.equal(spent.pension.spent, cheapest.cost);
});

test('the Junior Officer keeps buying while it can afford to', () => {
  const pension: Pension = { total: 100_000, spent: 0, unlocks: [] };
  const out = runStaff(input({ registry: registryOf({ role: 'officer', policy: 0 }), pension }));
  assert.ok(out.pension.unlocks.length > 3, `bought ${out.pension.unlocks.length}`);
  // And never past the ladder: every purchase's tier follows its predecessor.
  for (const id of out.pension.unlocks) {
    const entry = UNLOCK_CATALOGUE.find((e) => e.id === id)!;
    if (entry.tier === 1) continue;
    const previous = UNLOCK_CATALOGUE.find(
      (e) => e.track === entry.track && e.tier === entry.tier - 1,
    )!;
    assert.ok(out.pension.unlocks.includes(previous.id), `${id} bought before ${previous.id}`);
  }
});

const file = (overrides: Partial<CaseFile> = {}): CaseFile => ({
  id: '#4417-C',
  name: 'Sword, Adequate (+2)',
  category: 'gear',
  grade: 4,
  unitValue: 200,
  clauseIds: ['e-certified', 'r-contested'],
  ...overrides,
});

test('the Archivist contests riders, never endorsements', () => {
  // Rerolling an endorsement spends the officer's standing to make the file
  // worse as often as better. The point of automating it is that a rider is a
  // known drawback.
  const out = runStaff(
    input({ registry: registryOf({ role: 'archivist', policy: 1 }), caseFiles: [file()] }),
  );
  assert.equal(out.filings.length, 1);
  assert.equal(out.filings[0].clauseIndex, 1, 'index 1 is the rider');
  assert.equal(out.filings[0].wasClauseId, 'r-contested');
  assert.equal(out.filings[0].form, '12-C');
});

test('the Archivist leaves files below its grade alone', () => {
  const out = runStaff(
    input({
      registry: registryOf({ role: 'archivist', policy: 5 }),
      caseFiles: [file({ grade: 3 })],
    }),
  );
  assert.equal(out.filings.length, 0);
});

test('the Archivist files one form a visit, not one per clause', () => {
  // Emptying the purse and the standing in a single pass is indistinguishable
  // from a bug, and the officer never sees the decision being made.
  const out = runStaff(
    input({
      registry: registryOf({ role: 'archivist', policy: 1 }),
      caseFiles: [
        file({ clauseIds: ['r-contested', 'r-heavy'] }),
        file({ id: '#5000-A', clauseIds: ['r-cursed'] }),
      ],
    }),
  );
  assert.equal(out.filings.length, 1);
});

test('the Archivist does not contest what is already before the panel', () => {
  const busy: Filing = {
    id: 'f1', form: '12-C', caseFileId: '#4417-C', clauseIndex: 1,
    filedTick: 0, resolvesTick: 5000, wasClauseId: 'r-contested',
  };
  const out = runStaff(
    input({
      registry: registryOf({ role: 'archivist', policy: 1 }),
      caseFiles: [file()],
      filings: [busy],
    }),
  );
  assert.equal(out.filings.length, 1, 'no second form on the same clause');
});

test('the Archivist files nothing it cannot pay for', () => {
  const out = runStaff(
    input({
      registry: registryOf({ role: 'archivist', policy: 1 }),
      caseFiles: [file()],
      character: { ...input().character, standing: 0 },
    }),
  );
  assert.equal(out.filings.length, 0);
});

test('staff do nothing when no time has passed', () => {
  // `loadStateInside` runs on every mutation. Staff paid once per sale would be
  // paid once per tap.
  const out = runStaff(
    input({
      registry: registryOf({ role: 'clerk', policy: 500 }),
      inventory: [stack('Boots, Serviceable', 40, 3)],
      ticksResolved: 0,
    }),
  );
  assert.equal(out.changed, false);
  assert.equal(out.inventory.length, 1);
  assert.equal(out.character.gold, 5000);
});

test('a dead recruit has no department working for them', () => {
  const out = runStaff(
    input({
      registry: registryOf({ role: 'clerk', policy: 500 }),
      character: { ...input().character, alive: false },
      inventory: [stack('Boots, Serviceable', 40, 3)],
    }),
  );
  assert.equal(out.changed, false);
  assert.equal(out.character.gold, 5000, 'and no wages while there is no work');
});

test('policies are clamped to their own range', () => {
  assert.equal(clampPolicy('archivist', 99), staffSpec('archivist')!.policyMax);
  assert.equal(clampPolicy('archivist', -5), staffSpec('archivist')!.policyMin);
  assert.equal(clampPolicy('clerk', Number.NaN), staffSpec('clerk')!.policyDefault);
});
