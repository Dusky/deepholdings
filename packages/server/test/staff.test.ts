import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EMPTY_REGISTRY,
  UNLOCK_CATALOGUE,
  clampPolicy,
  formSpec,
  payrollPerTick,
  staffRung,
  staffSpec,
  staffTier,
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

function registryOf(...roles: { role: StaffRole; policy?: number; tier?: number }[]): Registry {
  return {
    staff: roles.map(({ role, policy, tier }) => ({
      role,
      policy: policy ?? staffSpec(role)!.policyDefault,
      tier: tier ?? 1,
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
  assert.equal(rate, staffRung('clerk', 1)!.upkeep + staffRung('officer', 1)!.upkeep);

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
  const wages = staffRung('clerk', 1)!.upkeep * 60;
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

test('throughput is what the promotion ladder sells', () => {
  /**
   * The post used to redeem *everything* affordable the moment it was hired,
   * which left its own upper tiers with nothing to offer. One rung a visit at
   * appointment, three at the second tier, uncapped at the third.
   */
  const pension: Pension = { total: 100_000, spent: 0, unlocks: [] };
  const at = (tier: number) =>
    runStaff(input({ registry: registryOf({ role: 'officer', policy: 0, tier }), pension }));

  assert.equal(at(1).pension.unlocks.length, 1, 'appointment clears one rung a visit');
  assert.equal(at(2).pension.unlocks.length, 3);
  assert.ok(at(3).pension.unlocks.length > 3, `bought ${at(3).pension.unlocks.length}`);
});

test('the Junior Officer never buys past the ladder', () => {
  const pension: Pension = { total: 100_000, spent: 0, unlocks: [] };
  const out = runStaff(
    input({ registry: registryOf({ role: 'officer', policy: 0, tier: 3 }), pension }),
  );
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

// ---- What the promotion ladder buys ---------------------------------------
//
// Each of these is the whole reason its tier exists. The department shipped as
// three flat posts that only saved the officer taps, which read as a tax in any
// simulation that cannot value the officer's time — so a tier that does not
// move a number here is a tier that should not be in the catalogue.

test('a senior clerk realises over book value', () => {
  const inventory = [stack('Boots, Serviceable', 40, 3)];
  const goldAt = (tier: number) =>
    runStaff(input({ registry: registryOf({ role: 'clerk', policy: 100, tier }), inventory }))
      .character.gold;

  const wages = (tier: number) => staffRung('clerk', tier)!.upkeep * 60;
  // Book is 120. Appointment sells at depot rates; the promotions do not.
  assert.equal(goldAt(1) + wages(1), 5000 + 120);
  assert.equal(goldAt(2) + wages(2), 5000 + Math.floor(120 * 1.08));
  assert.equal(goldAt(3) + wages(3), 5000 + Math.floor(120 * 1.18));
});

test('a promoted officer redeems at a discount, and the reserve respects it', () => {
  const cheapest = [...UNLOCK_CATALOGUE].sort((a, b) => a.cost - b.cost)[0];
  // Priced so the rung is out of reach at full price and inside it at 12% off.
  const pension: Pension = { total: Math.round(cheapest.cost * 0.95), spent: 0, unlocks: [] };

  const junior = runStaff(input({ registry: registryOf({ role: 'officer', tier: 1 }), pension }));
  assert.deepEqual(junior.pension.unlocks, [], 'it should not have been affordable');

  const senior = runStaff(input({ registry: registryOf({ role: 'officer', tier: 3 }), pension }));
  assert.deepEqual(senior.pension.unlocks, [cheapest.id]);
  assert.equal(senior.pension.spent, Math.round(cheapest.cost * 0.88));
});

test('a senior archivist files more forms for less', () => {
  const caseFiles = [
    file({ clauseIds: ['r-contested', 'r-heavy'] }),
    file({ id: '#5000-A', clauseIds: ['r-cursed'] }),
  ];
  const at = (tier: number) =>
    runStaff(input({ registry: registryOf({ role: 'archivist', policy: 1, tier }), caseFiles }));

  assert.equal(at(1).filings.length, 1, 'appointment files one a visit');
  assert.equal(at(2).filings.length, 2);

  // And the fee falls — *per form*. Comparing totals would say the opposite,
  // because a senior archivist files twice as many of them.
  const perForm = (tier: number) => {
    const out = at(tier);
    const wages = staffRung('archivist', tier)!.upkeep * 60;
    return (5000 - wages - out.character.gold) / out.filings.length;
  };
  assert.ok(
    perForm(3) * 2 < perForm(1),
    `tier 3 paid ${perForm(3)} a form against tier 1's ${perForm(1)}`,
  );
});

test('the Keeper of the Rolls pays one less standing, never zero', () => {
  const out = runStaff(
    input({
      registry: registryOf({ role: 'archivist', policy: 1, tier: 3 }),
      caseFiles: [file()],
    }),
  );
  const spent = 10 - out.character.standing;
  assert.ok(spent >= 1, 'a free form stops Union Standing rationing anything');
  assert.equal(spent, formSpec('12-C')!.standing - 1);
});

test('wages rise with the tier', () => {
  const flat = payrollPerTick(registryOf({ role: 'clerk', tier: 1 }));
  const senior = payrollPerTick(registryOf({ role: 'clerk', tier: 3 }));
  assert.ok(senior > flat, `${senior} should exceed ${flat}`);
});

test('a registry saved before promotions existed reads as tier 1', () => {
  // Migration 010 backfills the stored rows, but the fallback has to hold on
  // its own — a restored backup or a hand-repaired row is exactly where it
  // would be leaned on, and silently treating a post as vacant would stop the
  // department working with nothing in the log to say why.
  const legacy: Registry = {
    staff: [{ role: 'clerk', policy: 100 } as Registry['staff'][number]],
    spent: 0,
    unpaid: false,
  };
  assert.equal(staffTier(legacy, 'clerk'), 1);
  assert.equal(payrollPerTick(legacy), staffRung('clerk', 1)!.upkeep);

  const out = runStaff(input({ registry: legacy, inventory: [stack('Boots', 40, 3)] }));
  assert.equal(out.inventory.length, 0, 'the post did no work');
});
