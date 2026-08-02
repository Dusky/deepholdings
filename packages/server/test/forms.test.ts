import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_ORDERS,
  STANDING_PER_GRADE,
  clauseById,
  formGoldCost,
  formSpec,
  type CaseFile,
  type Filing,
} from '@deepholdings/shared';
import { concludeArbitration } from '../src/domain/arbitration.js';
import { succeed } from '../src/domain/character.js';
import { resolve } from '../src/domain/resolve.js';

const SPEC = formSpec('12-C')!;

function fileOf(overrides: Partial<CaseFile> = {}): CaseFile {
  return {
    id: '#4417-C',
    name: 'Sword, Adequate (+2)',
    category: 'gear',
    grade: 4,
    unitValue: 200,
    clauseIds: ['e-certified', 'r-contested'],
    ...overrides,
  };
}

function filingOf(overrides: Partial<Filing> = {}): Filing {
  return {
    id: 'filing-1',
    form: '12-C',
    caseFileId: '#4417-C',
    clauseIndex: 1,
    filedTick: 100,
    resolvesTick: 100 + SPEC.ticks,
    wasClauseId: 'r-contested',
    ...overrides,
  };
}

function recruit(overrides: Partial<ReturnType<typeof succeed>['character']> = {}) {
  const start = succeed({
    id: 'c1', accountId: 'a1', previous: null, depthReached: 0, unlocks: [], atTick: 0,
  });
  return { ...start, character: { ...start.character, ...overrides } };
}

test('a ruling is the same however many times the span is replayed', () => {
  // The property the whole seeding scheme exists for. A player who loses
  // connection mid-catch-up and reloads must not be re-rolling their item.
  const first = concludeArbitration(filingOf(), [fileOf()]);
  for (let i = 0; i < 20; i += 1) {
    const again = concludeArbitration(filingOf(), [fileOf()]);
    assert.deepEqual(again.files, first.files);
    assert.equal(again.text, first.text);
  }
});

test('two forms due in the same minute are not each other\'s shadow', () => {
  // Seeding on (character, tick) — the rule everywhere else in the resolver —
  // would give these one seed between them, and the second would be a copy of
  // the first. Filings are seeded on the filing.
  const files = [fileOf(), fileOf({ id: '#5000-A' })];
  const a = concludeArbitration(filingOf({ id: 'f-a' }), files);
  const b = concludeArbitration(filingOf({ id: 'f-b', caseFileId: '#5000-A' }), files);
  // Same tick, same clause, same grade: only the filing id differs.
  assert.notEqual(a.text.replace('#4417-C', 'X'), b.text.replace('#5000-A', 'X'));
});

test('an arbitration contests a clause, it does not convert one', () => {
  // A rider that could come back as an endorsement would make every drawback
  // a formality, and riders are where an item gets a personality.
  let found = 0;
  for (let seed = 0; seed < 400; seed += 1) {
    const outcome = concludeArbitration(
      filingOf({ id: `f-${seed}` }),
      [fileOf()],
    );
    if (!outcome.changed) continue;
    found += 1;
    const now = clauseById(outcome.file.clauseIds[1]);
    assert.equal(now?.kind, 'rider', `${now?.id} is not a rider`);
    assert.ok(now!.minGrade <= 4, 'ruled above the file\'s grade');
    assert.notEqual(now!.id, 'e-certified', 'duplicated a clause already on the file');
  }
  assert.ok(found > 200, `only ${found} of 400 rulings amended anything`);
});

test('the case is dismissed about as often as the form says', () => {
  let dismissed = 0;
  const runs = 600;
  for (let seed = 0; seed < runs; seed += 1) {
    const outcome = concludeArbitration(filingOf({ id: `d-${seed}` }), [fileOf()]);
    if (/dismissed/.test(outcome.text)) dismissed += 1;
  }
  const rate = dismissed / runs;
  assert.ok(
    Math.abs(rate - SPEC.dismissChance) < 0.06,
    `dismissal rate ${rate.toFixed(3)} against ${SPEC.dismissChance}`,
  );
});

test('a form whose file is gone says so instead of throwing', () => {
  // The drawer evicts its weakest entry, so a file can leave while a form
  // about it is still processing. Silence here would read as a lost fee.
  const outcome = concludeArbitration(filingOf(), []);
  assert.equal(outcome.changed, false);
  assert.match(outcome.text, /was not produced/);
});

test('a form whose clause has moved does not reroll a different one', () => {
  // The worst possible behaviour: contest clause 1, have something else
  // resolve first, then silently arbitrate whatever is at index 1 now.
  const moved = fileOf({ clauseIds: ['e-certified', 'r-heavy'] });
  const outcome = concludeArbitration(filingOf(), [moved]);
  assert.equal(outcome.changed, false);
  assert.deepEqual(outcome.file.clauseIds, ['e-certified', 'r-heavy']);
  assert.match(outcome.text, /no longer before the panel/);
});

test('a filing resolves at its tick, not before it', () => {
  const { character, inventory } = recruit({ lastResolvedTick: 0 });
  const files = [fileOf()];
  const filing = filingOf({ filedTick: 0, resolvesTick: 90 });

  const early = resolve({
    character: { ...character }, inventory, orders: DEFAULT_ORDERS, unlocks: [],
    toTick: 89, permitAppliedTick: null, caseFiles: files, filings: [filing],
  });
  assert.equal(early.counters.filingsConcluded, 0);
  assert.equal(early.filings.length, 1, 'the form should still be processing');

  const due = resolve({
    character: { ...character }, inventory, orders: DEFAULT_ORDERS, unlocks: [],
    toTick: 90, permitAppliedTick: null, caseFiles: files, filings: [filing],
  });
  assert.equal(due.counters.filingsConcluded, 1);
  assert.equal(due.filings.length, 0, 'a concluded form should leave the queue');
  assert.ok(due.journal.some((entry) => /case #4417-C|Case #4417-C/i.test(entry.text)));
});

test('filing a form does not move the simulation', () => {
  // The same rule the prose stream exists for. If an arbitration drew from the
  // combat rng, doing paperwork would change what is waiting on Floor 9 — and
  // the balance harness would be measuring a game nobody plays.
  const { character, inventory } = recruit({ lastResolvedTick: 0, level: 6 });
  const files = [fileOf()];

  const withoutForm = resolve({
    character: { ...character }, inventory: inventory.map((i) => ({ ...i })),
    orders: DEFAULT_ORDERS, unlocks: [], toTick: 400, permitAppliedTick: null,
    caseFiles: files.map((f) => ({ ...f })),
  });
  const withForm = resolve({
    character: { ...character }, inventory: inventory.map((i) => ({ ...i })),
    orders: DEFAULT_ORDERS, unlocks: [], toTick: 400, permitAppliedTick: null,
    caseFiles: files.map((f) => ({ ...f })),
    filings: [filingOf({ filedTick: 0, resolvesTick: 380 })],
  });

  // Everything before the ruling must be identical, line for line.
  const before = (r: typeof withoutForm) =>
    r.journal.filter((e) => e.tick < 380).map((e) => e.text);
  assert.deepEqual(before(withForm), before(withoutForm));
});

test('a promotion pays Union Standing', () => {
  const { character, inventory } = recruit({ lastResolvedTick: 0, xp: 0 });
  const out = resolve({
    character: { ...character, standing: 0 }, inventory, orders: DEFAULT_ORDERS,
    unlocks: [], toTick: 2000, permitAppliedTick: null, caseFiles: [],
  });
  const gained = out.character.level - character.level;
  assert.ok(gained > 0, 'the recruit never got promoted, so this proves nothing');
  assert.equal(out.character.standing, gained * STANDING_PER_GRADE);
});

test('a successor inherits the office, not the reputation', () => {
  const veteran = recruit({ level: 9, standing: 22 }).character;
  const next = succeed({
    id: 'c2', accountId: 'a1', previous: veteran, depthReached: 7, unlocks: [], atTick: 5000,
  });
  assert.equal(next.character.standing, 0);
  assert.deepEqual(next.filings, []);
  assert.deepEqual(next.caseFiles, []);
});

test('a grade V reroll costs more than a grade I', () => {
  // Flat pricing would make the top of the ladder the cheapest thing to
  // gamble on, which is backwards.
  assert.ok(formGoldCost(SPEC, 5) > formGoldCost(SPEC, 1));
  assert.equal(formGoldCost(SPEC, 3), SPEC.goldPerGrade * 3);
});
