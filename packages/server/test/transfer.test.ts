/**
 * Form T-1, and what a transfer takes.
 *
 * The reset boundary is the whole risk here. Everything else in this game
 * fails loudly; a prestige reset that keeps one field too few silently deletes
 * something the player spent months on, and looks exactly like working. So
 * these tests are mostly about what *survives*.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  COMMENDATION_CATALOGUE,
  PENSION_PER_COMMENDATION,
  commendationAward,
  endowmentMultiplier,
  intakeFloor,
  payrollPerTick,
  payrollShare,
  pensionAward,
  startingPermitTier,
  type Pension,
  type Registry,
} from '@deepholdings/shared';
import { succeed } from '../src/domain/character.js';
import { adapters } from './adapters.js';
import { fileTransfer, purchaseCommendation, ServiceError } from '../src/service.js';

test('the award is linear, so there is no wrong moment to file', () => {
  // The property the design rests on: filing at the threshold and filing at ten
  // times the threshold pay the same rate. A player cannot get this wrong, and
  // "not knowing when to prestige" is the genre's standing complaint.
  const once = commendationAward(PENSION_PER_COMMENDATION * 10);
  const tenTimes = Array.from({ length: 10 }, () =>
    commendationAward(PENSION_PER_COMMENDATION)).reduce((a, b) => a + b, 0);
  assert.equal(once, tenTimes);
});

test('a partial commendation is never paid out', () => {
  assert.equal(commendationAward(PENSION_PER_COMMENDATION - 1), 0);
  assert.equal(commendationAward(PENSION_PER_COMMENDATION), 1);
  assert.equal(commendationAward(-5000), 0);
});

test('Service Endowment multiplies every award', () => {
  const plain = pensionAward(1440, 12, 0);
  const endowed = pensionAward(1440, 12, 0, [], ['endowment1']);
  assert.ok(Math.abs(endowed - plain * 1.15) <= 1, `${endowed} against ${plain * 1.15}`);
  assert.equal(endowmentMultiplier([]), 1, 'an officer on their first posting pays list price');
});

test('Departmental Patronage lowers the payroll but never to nothing', () => {
  const registry: Registry = {
    staff: [{ role: 'clerk', policy: 100, tier: 3 }, { role: 'officer', policy: 0, tier: 3 }],
    spent: 0,
    unpaid: false,
  };
  const gross = payrollPerTick(registry);
  assert.equal(gross, 6);
  assert.equal(payrollPerTick(registry, ['patronage1']), Math.ceil(6 * payrollShare(['patronage1'])));
  assert.ok(payrollPerTick(registry, ['patronage1', 'patronage2', 'patronage3']) >= 1,
    'a working department must always cost something');
  assert.equal(payrollPerTick({ staff: [], spent: 0, unpaid: false }, ['patronage3']), 0,
    'but an empty one costs nothing');
});

test('a new posting starts on the permit Transferred Dispensation bought', () => {
  const veteran = succeed({
    id: 'a', accountId: 'x', previous: null, depthReached: 0, unlocks: [], atTick: 0,
  }).character;
  const posting = succeed({
    id: 'b', accountId: 'x', previous: { ...veteran, permitTier: 8, level: 40 },
    depthReached: 12, unlocks: [], atTick: 0,
    commendations: ['dispensation1', 'dispensation2'], posting: true,
  });

  assert.equal(startingPermitTier(['dispensation1', 'dispensation2']), 4);
  // Granted, not inherited: running it through `inheritedPermitTier` would take
  // one straight back off the thing the officer paid for.
  assert.equal(posting.character.permitTier, 4);
  assert.equal(posting.character.recruitNum, 1, 'a posting starts its own numbering');
  assert.equal(posting.character.level, 1, 'and inherits no grade from the last posting');
});

test('the intake floor applies to a fresh posting, where there is nothing to inherit', () => {
  const posting = succeed({
    id: 'b', accountId: 'x', previous: null, depthReached: 0, unlocks: [], atTick: 0,
    commendations: ['intake1', 'intake2'], posting: true,
  });
  assert.equal(intakeFloor(['intake1', 'intake2']), 8);
  assert.equal(posting.character.level, 8);
  assert.equal(posting.character.hp, posting.character.maxHp, 'and arrives at full strength');
});

test('the intake ceiling is the deepest floor the Authority authorises', () => {
  // Tier 3 is Grade 12 because that is MAX_DEPTH. Anything above it would be
  // grade that `authorisedDepth` can never spend, which is the disconnected
  // progress bar the seniority work already had to fix once.
  assert.equal(intakeFloor(COMMENDATION_CATALOGUE.filter((e) => e.track === 'intake').map((e) => e.id)), 12);
});

for (const { name, make } of adapters) {
  test(`filing a transfer banks, resets and keeps the right things (${name})`, async () => {
    const repo = make();
    await repo.init();
    const account = await repo.transaction((tx) => tx.createAccount(`dev-${name}-t1-${randomUUID()}`, 'OFFICER'));
    const first = succeed({
      id: randomUUID(), accountId: account.id, previous: null, depthReached: 0, unlocks: [], atTick: 100,
    });
    await repo.transaction(async (tx) => {
      await tx.insertCharacter(first);
      await tx.saveOrders(account.id, { targetDepth: 6, retreatPct: 30, lootPriority: 'gear', spendPolicy: 'resupply' });
      const pension: Pension = {
        total: PENSION_PER_COMMENDATION * 2,
        spent: PENSION_PER_COMMENDATION,
        unlocks: ['permits1', 'stipend1'],
      };
      await tx.savePension(account.id, pension);
      await tx.saveOffice(account.id, { spent: 900, requisitions: ['journal1'] });
      await tx.saveRegistry(account.id, {
        staff: [{ role: 'clerk', policy: 250, tier: 3 }], spent: 46_800, unpaid: false,
      });
    });

    const out = await fileTransfer(repo, account.id);

    // Three banked: 450,000 of pension ever, at 150,000 each.
    assert.equal(out.awarded, 3);
    assert.equal(out.transfer.total, 3);
    assert.equal(out.transfer.careers, 1);

    const pension = await repo.transaction((tx) => tx.getPension(account.id));
    assert.deepEqual(pension, { total: 0, spent: 0, unlocks: [] },
      'the pension is surrendered whole, spent included');

    const registry = await repo.transaction((tx) => tx.getRegistry(account.id));
    assert.equal(registry.staff.length, 1, 'the department travels with you');
    assert.equal(registry.staff[0].tier, 3, 'at the tier it was promoted to');
    // Not equal: `fileTransfer` resolves the outstanding span before it reads
    // the pension, so the department worked — and was paid — on the way out.
    assert.ok(registry.spent >= 46_800, `wages went backwards: ${registry.spent}`);

    const office = await repo.transaction((tx) => tx.getOffice(account.id));
    assert.deepEqual(office.requisitions, ['journal1'], 'and so does the equipment');

    const record = await repo.transaction((tx) => tx.getActiveCharacterForUpdate(account.id));
    assert.ok(record);
    assert.notEqual(record.character.id, first.character.id, 'a new recruit is on the books');
    assert.equal(record.character.recruitNum, 1);
  });

  test(`spent pension is not paid for twice (${name})`, async () => {
    // The failure this guards: leaving `spent` behind after a transfer would
    // make the next award read a meter that already includes everything the
    // last one paid for, every transfer, forever.
    const repo = make();
    await repo.init();
    const account = await repo.transaction((tx) => tx.createAccount(`dev-${name}-t2-${randomUUID()}`, 'OFFICER'));
    await repo.transaction(async (tx) => {
      await tx.insertCharacter(succeed({
        id: randomUUID(), accountId: account.id, previous: null, depthReached: 0, unlocks: [], atTick: 100,
      }));
      await tx.savePension(account.id, {
        total: PENSION_PER_COMMENDATION * 4, spent: 0, unlocks: [],
      });
    });

    assert.equal((await fileTransfer(repo, account.id)).awarded, 4);
    await assert.rejects(
      () => fileTransfer(repo, account.id),
      (error: ServiceError) => error.code === 'not_authorised',
      'a second transfer on the same service must be refused',
    );
  });

  test(`the Authority refuses a transfer below the threshold (${name})`, async () => {
    const repo = make();
    await repo.init();
    const account = await repo.transaction((tx) => tx.createAccount(`dev-${name}-t3-${randomUUID()}`, 'OFFICER'));
    await repo.transaction(async (tx) => {
      await tx.insertCharacter(succeed({
        id: randomUUID(), accountId: account.id, previous: null, depthReached: 0, unlocks: [], atTick: 100,
      }));
      await tx.savePension(account.id, {
        total: PENSION_PER_COMMENDATION - 1, spent: 0, unlocks: [],
      });
    });
    await assert.rejects(
      () => fileTransfer(repo, account.id),
      (error: ServiceError) => error.code === 'not_authorised',
    );
  });

  test(`commendations are climbed in order and cannot be overspent (${name})`, async () => {
    const repo = make();
    await repo.init();
    const account = await repo.transaction((tx) => tx.createAccount(`dev-${name}-t4-${randomUUID()}`, 'OFFICER'));
    await repo.transaction(async (tx) => {
      await tx.insertCharacter(succeed({
        id: randomUUID(), accountId: account.id, previous: null, depthReached: 0, unlocks: [], atTick: 100,
      }));
      await tx.saveTransfer(account.id, { total: 2, spent: 0, unlocks: [], careers: 1 });
    });

    await assert.rejects(
      () => purchaseCommendation(repo, account.id, 'intake2'),
      (error: ServiceError) => error.code === 'invalid_request',
      'the top rung must not be reachable at the top rung price',
    );

    const bought = await purchaseCommendation(repo, account.id, 'intake1');
    assert.deepEqual(bought.transfer.unlocks, ['intake1']);
    assert.equal(bought.transfer.total, 1);
    assert.equal(bought.transfer.spent, 1);

    await assert.rejects(
      () => purchaseCommendation(repo, account.id, 'intake2'),
      (error: ServiceError) => error.code === 'insufficient_pension',
      'intake2 costs 3 and one is held',
    );
  });
}
