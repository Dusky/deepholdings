import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ALL_CLAUSES,
  CASE_FILE_SLOTS,
  DEFAULT_ORDERS,
  MAX_LOOT_VALUE,
  MAX_SURVIVAL,
  MAX_DEPTH,
  MAX_VIGOUR_FRACTION,
  seniority,
  clauseById,
  clauseSlots,
  makeRng,
  statsOf,
  tickSeed,
  type CaseFile,
} from '@deepholdings/shared';
import { file, rollCaseFile, rollsCaseFile } from '../src/domain/caseFiles.js';
import { succeed } from '../src/domain/character.js';
import { resolve } from '../src/domain/resolve.js';

const rngAt = (n: number) => makeRng(tickSeed('case-file-test', n));

function roll(
  seed: number,
  depth = 8,
  priority: 'gold' | 'gear' | 'relics' | 'knowledge' = 'gear',
  level = 8,
) {
  return rollCaseFile({
    id: `#${seed}`,
    name: 'Sword, Adequate (+2)',
    priority,
    depth,
    level,
    baseValue: 40,
    rng: rngAt(seed),
  });
}

test('a rolled file always carries at least one endorsement', () => {
  // An item that is only a cost is one the player throws away, and then the
  // system may as well not have fired.
  for (let seed = 0; seed < 250; seed += 1) {
    const rolled = roll(seed);
    const first = clauseById(rolled.clauseIds[0]);
    assert.ok(first, `seed ${seed} rolled an unknown clause`);
    assert.equal(first.kind, 'endorsement', `seed ${seed} led with a rider`);
  }
});

test('clauses never exceed the slots the grade allows, and never repeat', () => {
  for (let seed = 0; seed < 250; seed += 1) {
    const rolled = roll(seed, 12, 'relics');
    assert.ok(
      rolled.clauseIds.length <= clauseSlots(rolled.grade),
      `grade ${rolled.grade} carried ${rolled.clauseIds.length} clauses`,
    );
    assert.equal(new Set(rolled.clauseIds).size, rolled.clauseIds.length, 'duplicate clause');
  }
});

test('a clause never rolls above its item grade', () => {
  for (let seed = 0; seed < 400; seed += 1) {
    const rolled = roll(seed, 12, 'relics');
    for (const id of rolled.clauseIds) {
      const clause = clauseById(id)!;
      assert.ok(
        clause.minGrade <= rolled.grade,
        `${clause.id} (min ${clause.minGrade}) on a Grade ${rolled.grade} file`,
      );
    }
  }
});

test('the stat block is capped, whatever is carried', () => {
  // The caps are the design, not a safety net. Without them, six files of four
  // clauses reached +254 vigour and the balance harness reported zero deaths
  // in thirty careers of thirty — no death, no pension, and the whole prestige
  // half of the game invisible. This asserts the ceiling holds against a set
  // deliberately stacked far past anything the game can produce.
  const everything: CaseFile[] = ALL_CLAUSES.map((_, i) => ({
    id: `#stack-${i}`,
    name: 'Contrivance',
    category: 'gear',
    grade: 5,
    unitValue: 1,
    clauseIds: ALL_CLAUSES.map((c) => c.id),
  }));

  const stats = statsOf(everything, 161);
  assert.ok(stats.vigour <= Math.round(161 * MAX_VIGOUR_FRACTION), `vigour ${stats.vigour}`);
  assert.ok(stats.survival <= MAX_SURVIVAL, `survival ${stats.survival}`);
  assert.ok(stats.lootValue <= MAX_LOOT_VALUE, `loot ${stats.lootValue}`);
});

test('vigour is capped as a share of the recruit, not a flat number', () => {
  // So a case file is worth the same proportion to a Grade 2 and a Grade 20,
  // rather than being decisive early and irrelevant late.
  const stacked: CaseFile[] = [
    { id: '#a', name: 'x', category: 'gear', grade: 5, unitValue: 1, clauseIds: ALL_CLAUSES.map((c) => c.id) },
  ];
  const small = statsOf(stacked, 40);
  const large = statsOf(stacked, 400);
  assert.ok(large.vigour > small.vigour, 'the cap did not scale with the recruit');
  assert.equal(small.vigour, Math.round(40 * MAX_VIGOUR_FRACTION));
});

test('the drawer holds a fixed number, and says what it dropped', () => {
  const weak: CaseFile = {
    id: '#weak', name: 'x', category: 'gear', grade: 1, unitValue: 1, clauseIds: ['e-certified'],
  };
  const strong: CaseFile = {
    id: '#strong', name: 'x', category: 'gear', grade: 4, unitValue: 1,
    clauseIds: ['e-founder', 'e-commissioned'],
  };

  let held: CaseFile[] = [];
  for (let i = 0; i < CASE_FILE_SLOTS; i += 1) {
    held = file(held, { ...weak, id: `#w${i}` }).files;
  }
  assert.equal(held.length, CASE_FILE_SLOTS);

  const full = file(held, strong);
  assert.equal(full.files.length, CASE_FILE_SLOTS, 'the drawer grew');
  assert.ok(full.files.some((f) => f.id === '#strong'), 'the better file was refused');
  assert.ok(full.displaced, 'something was dropped and not reported');

  // And a worse file is refused rather than displacing a better one.
  const refused = file(full.files, { ...weak, id: '#late' });
  assert.equal(refused.displaced?.id, '#late', 'a worse file evicted a better one');
});

test('the same tick rolls the same file', () => {
  // Case files change the stat block, so they are simulation state. A replay
  // that produced a different item would produce a different career.
  for (const seed of [0, 7, 4211, 250_000]) {
    assert.deepEqual(roll(seed), roll(seed));
  }
});

test('a successor carries none of them', () => {
  // The second stake death needed. Death cost a recruit and paid a pension;
  // now it costs the case files too.
  const first = succeed({
    id: 'a', accountId: 'acct', previous: null, depthReached: 0, unlocks: [], atTick: 0,
  });
  assert.deepEqual(first.caseFiles, []);

  // A predecessor with something to leave: inheritedLevel is a share of the
  // last grade, so a Grade 1 recruit leaves nothing and the contrast this test
  // is drawing would not exist.
  const veteran = { ...first.character, level: 12 };
  const heir = succeed({
    id: 'b', accountId: 'acct', previous: veteran, depthReached: 9, unlocks: [], atTick: 100,
  });
  assert.deepEqual(heir.caseFiles, [], 'a successor inherited the deceased kit');
  assert.ok(heir.character.level > 1, 'but still inherits the case file itself');
});

test('rarity is measured in finds, not in feel', () => {
  // The first drop rate was twenty times too high because 0.07 was picked as
  // "about one in fourteen finds" without counting the finds. At depth there
  // are hundreds of acquisitions a day, so one in fourteen is dozens of case
  // files a day. This pins the rate low enough that the count stays small.
  let hits = 0;
  const draws = 20_000;
  for (let i = 0; i < draws; i += 1) hits += rollsCaseFile(8, 'gear', rngAt(i)) ? 1 : 0;
  const rate = hits / draws;
  assert.ok(rate > 0.005 && rate < 0.025, `case file rate at depth 8 is ${rate.toFixed(4)}`);
});

test('carrying files makes a recruit harder to kill, but not immortal', () => {
  // The property the caps exist for, asserted end to end through the resolver
  // rather than against statsOf alone.
  const start = succeed({
    id: 'c', accountId: 'acct', previous: null, depthReached: 0, unlocks: [], atTick: 0,
  });
  const kitted: CaseFile[] = [
    { id: '#1', name: 'x', category: 'gear', grade: 4, unitValue: 1, clauseIds: ['e-founder', 'e-hazard'] },
  ];

  const bare = resolve({
    character: { ...start.character }, inventory: [], orders: DEFAULT_ORDERS,
    unlocks: [], toTick: 400, permitAppliedTick: null, caseFiles: [],
  });
  const geared = resolve({
    character: { ...start.character }, inventory: [], orders: DEFAULT_ORDERS,
    unlocks: [], toTick: 400, permitAppliedTick: null, caseFiles: kitted,
  });

  assert.ok(
    geared.character.maxHp > bare.character.maxHp,
    'vigour did not reach the recruit through the resolver',
  );
});

test('grade past the depth cap is worth something', () => {
  // The ninety-day run found Grade climbing to 46 while authorisedDepth had
  // been capped at 12 since about day four — the most prominent number on the
  // stat line, wired to nothing. Surplus grade is seniority now, and seniority
  // shifts case-file quality rather than adding power, because the same run
  // showed the game needs more *events*, not a harder-to-kill recruit.
  const junior = Array.from({ length: 300 }, (_, i) => roll(i, 8, 'gear', 8).grade);
  const senior = Array.from({ length: 300 }, (_, i) => roll(i, 8, 'gear', 40).grade);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  assert.ok(
    mean(senior) > mean(junior),
    `seniority changed nothing: junior ${mean(junior).toFixed(2)}, senior ${mean(senior).toFixed(2)}`,
  );
  // And it is a nudge, not a guarantee — the ceiling is Grade V either way.
  assert.ok(mean(senior) - mean(junior) < 1.6, 'seniority is doing too much');
});

test('seniority is zero until the depth cap is passed', () => {
  assert.equal(seniority(1), 0);
  assert.equal(seniority(MAX_DEPTH), 0);
  assert.ok(seniority(MAX_DEPTH + 5) > 0);
});
