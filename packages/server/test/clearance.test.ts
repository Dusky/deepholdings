import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Character, Pension } from '@deepholdings/shared';
import { newRecruit } from '../src/domain/character.js';
import { clearanceFor } from '../src/domain/clearance.js';

const NO_PENSION: Pension = { total: 0, spent: 0, unlocks: [] };

function recruit(overrides: Partial<Character> = {}): Character {
  return { ...newRecruit('c1', 'a1', 1, [], 1_000_000), ...overrides };
}

test('a brand-new officer gets the terminal and the orders form, nothing else', () => {
  assert.deepEqual(clearanceFor(recruit(), NO_PENSION), ['terminal', 'orders']);
});

test('the ledger arrives with a promotion', () => {
  assert.ok(clearanceFor(recruit({ level: 2 }), NO_PENSION).includes('ledger'));
});

test('the bulletin arrives with the second permit', () => {
  const before = clearanceFor(recruit({ permitTier: 1 }), NO_PENSION);
  const after = clearanceFor(recruit({ permitTier: 2 }), NO_PENSION);
  assert.equal(before.includes('bulletin'), false);
  assert.ok(after.includes('bulletin'));
});

test('the tavern arrives at grade four', () => {
  assert.equal(clearanceFor(recruit({ level: 3 }), NO_PENSION).includes('tavern'), false);
  assert.ok(clearanceFor(recruit({ level: 4 }), NO_PENSION).includes('tavern'));
});

test('clearance survives death, even though level and permit do not', () => {
  // Everything unlocked on the first recruit...
  const veteran = recruit({ level: 6, permitTier: 3 });
  const earned = clearanceFor(veteran, { total: 900, spent: 0, unlocks: [] });
  assert.deepEqual(earned.sort(), ['bulletin', 'ledger', 'orders', 'tavern', 'terminal']);

  // ...and the replacement starts back at level 1 with permit D-1.
  const successor = recruit({ recruitNum: 2, level: 1, permitTier: 1 });
  const kept = clearanceFor(successor, { total: 900, spent: 0, unlocks: [] });
  assert.deepEqual(
    kept.sort(),
    ['bulletin', 'ledger', 'orders', 'tavern', 'terminal'],
    'a screen must never be taken away by a funeral',
  );
});

test('a spent pension still counts as having had one', () => {
  const spent: Pension = { total: 0, spent: 1200, unlocks: ['permits1'] };
  assert.ok(clearanceFor(recruit(), spent).includes('ledger'));
});
