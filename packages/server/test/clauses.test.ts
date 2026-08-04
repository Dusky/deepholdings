/**
 * The clause pool: shape, reachability and ceilings.
 *
 * These are not tests of the numbers — the harnesses measure those. They guard
 * the properties that make the pool *usable*: that every grade has something to
 * roll, that no dimension is decorative, and that nothing here can be stacked
 * past the ceilings the balance work put in place.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_CLAUSES,
  MAX_LOOT_VALUE,
  MAX_SURVIVAL,
  MAX_VIGOUR_FRACTION,
  STAT_KEYS,
  clauseSlots,
  statCaps,
  statsOf,
  type CaseFile,
  type Clause,
} from '@deepholdings/shared';

const eligible = (grade: number, kind: Clause['kind']) =>
  ALL_CLAUSES.filter((c) => c.kind === kind && c.minGrade <= grade);

test('ids and names are unique', () => {
  // A duplicate id silently makes one clause unreachable — `clauseById` returns
  // the first — and a duplicate name reads to the player as a rendering bug.
  const ids = ALL_CLAUSES.map((c) => c.id);
  const texts = ALL_CLAUSES.map((c) => c.text);
  assert.equal(new Set(ids).size, ids.length, 'duplicate clause id');
  assert.equal(new Set(texts).size, texts.length, 'duplicate clause text');
});

test('every grade can fill every slot it has', () => {
  // `rollCaseFile` skips a slot when the eligible pool is exhausted, so a thin
  // grade silently produces short files. Slot 0 is always an endorsement; the
  // rest may be either, and duplicates are not allowed within a file.
  for (let grade = 1; grade <= 5; grade += 1) {
    const slots = clauseSlots(grade);
    assert.ok(
      eligible(grade, 'endorsement').length >= slots,
      `grade ${grade} has ${eligible(grade, 'endorsement').length} endorsements for ${slots} slots`,
    );
    assert.ok(
      eligible(grade, 'rider').length >= slots - 1,
      `grade ${grade} has too few riders to fill ${slots} slots`,
    );
  }
});

test('every dimension is actually used, in both directions', () => {
  // A dimension nothing rolls is dead weight in the resolver, and one that only
  // ever helps is not a trade. Riders are where the negatives live.
  for (const key of STAT_KEYS) {
    assert.ok(
      ALL_CLAUSES.some((c) => (c[key] ?? 0) > 0),
      `nothing grants ${key}`,
    );
    assert.ok(
      ALL_CLAUSES.some((c) => (c[key] ?? 0) < 0),
      `nothing costs ${key} — it is a bonus, not a dimension`,
    );
  }
});

test('every rider is a trade, not just a penalty', () => {
  // The stated design rule: a clause that is only a cost is one the player
  // throws away, and then the system may as well not have fired.
  for (const rider of ALL_CLAUSES.filter((c) => c.kind === 'rider')) {
    const ups = STAT_KEYS.filter((k) => (rider[k] ?? 0) > 0);
    const downs = STAT_KEYS.filter((k) => (rider[k] ?? 0) < 0);
    assert.ok(ups.length > 0, `${rider.id} has no upside`);
    assert.ok(downs.length > 0, `${rider.id} has no cost, so it is an endorsement`);
  }
});

test('endorsements never carry a cost', () => {
  for (const e of ALL_CLAUSES.filter((c) => c.kind === 'endorsement')) {
    for (const key of STAT_KEYS) {
      assert.ok((e[key] ?? 0) >= 0, `${e.id} has a negative ${key}, so it is a rider`);
    }
  }
});

test('the whole pool at once cannot breach a ceiling', () => {
  // The ceilings are load-bearing: `items.ts` records that an uncapped set once
  // produced zero deaths in thirty careers, and with them zero pension and an
  // invisible prestige half. A drawer cannot hold eighty clauses, but if the
  // sum of *every* clause still clamps then no reachable subset can escape.
  const everything: CaseFile = {
    id: 'X', name: 'all', category: 'gear', grade: 5, unitValue: 0,
    clauseIds: ALL_CLAUSES.map((c) => c.id),
  };
  const stats = statsOf([everything]);
  const caps = statCaps();
  for (const key of STAT_KEYS) {
    assert.ok(stats[key] <= caps[key] + 1e-9, `${key} exceeded its ceiling`);
  }
  assert.equal(stats.vigour, Math.round(161 * MAX_VIGOUR_FRACTION));
  assert.equal(stats.survival, MAX_SURVIVAL);
  assert.equal(stats.lootValue, MAX_LOOT_VALUE);
});

test('a realistic drawer is well short of the ceilings', () => {
  // The opposite failure: ceilings so low that three good files hit them and
  // every further find is worthless. Three Grade V files is the best a drawer
  // can hold, and it should still be climbing.
  const best: CaseFile[] = [1, 2, 3].map((n) => ({
    id: `F${n}`, name: 'file', category: 'gear', grade: 5, unitValue: 0,
    clauseIds: eligible(5, 'endorsement').slice(n * 4 - 4, n * 4).map((c) => c.id),
  }));
  const stats = statsOf(best);
  const caps = statCaps();
  const atCeiling = STAT_KEYS.filter((k) => stats[k] >= caps[k] - 1e-9);
  assert.ok(
    atCeiling.length < STAT_KEYS.length,
    'a single drawer maxes every dimension at once, so nothing found later matters',
  );
});
