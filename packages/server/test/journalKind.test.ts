import assert from 'node:assert/strict';
import { test } from 'node:test';
import { journalKind } from '../src/domain/flavor.js';

/**
 * The classifier derives a line's kind from its text, which means a reworded
 * line can silently lose its colour. These are the authored lines, asserted
 * against the kind they are supposed to be — so rewriting one and forgetting
 * the classifier fails here rather than in front of a player.
 */
const CASES: readonly (readonly [string, string])[] = [
  ['GRIMWALD I died on Floor 7. Cause of death: blood loss. Next of kin notified by form letter.', 'death'],
  ['Out of supplies, still descending. The recruit is not eating.', 'alert'],
  ["Encountered: Wyrm, Enormous. Badly hurt — Form 9 (Industrial Injury) filed on the recruit's behalf.", 'alert'],
  ['Permit D-3 approved. Descent authorized to Depth 4.', 'authority'],
  ['Permit D-2 application filed. Estimated processing: 2-4 business days. Delving continues at Floor 2.', 'authority'],
  ['Grade review passed. Now Grade 4. Union Standing +1.', 'authority'],
  ['Case file opened. GRIMWALD I assigned as your recruit. Permit D-1 issued. Do not lose the permit.', 'authority'],
  ['Service review: GRIMWALD I has served 12 hours.', 'authority'],
  ['Clearance amended. Ledger access granted.', 'authority'],
  ['Timesheet submitted for 8 hours. 10 were worked.', 'authority'],
  ['Acquired: Shield, Dented. Heavier than it looks.', 'loot'],
  ['Sold 6 x Lantern, Regulation at Depot 3 to cover supplies.', 'loot'],
  ['Resupplied at Depot 3. 12 supplies, 72 gold.', 'loot'],
  ['Encountered: Goblin, Sleeping. Won on the second attempt.', 'combat'],
  ['Down to Floor 3.', 'progress'],
  ['Pulled back to Floor 2. 39% HP.', 'progress'],
  ['Back at the surface. 42% HP.', 'progress'],
  ['Rested at Depot 3.', 'progress'],
  ['Water, somewhere below.', 'routine'],
  ['Slept badly.', 'routine'],
  ['The corridor turns left for a long time.', 'routine'],
];

test('every authored line lands on the kind it is meant to', () => {
  for (const [text, expected] of CASES) {
    assert.equal(journalKind(text), expected, `"${text.slice(0, 50)}…"`);
  }
});

test('a death outranks the floor it happened on', () => {
  // Death lines mention a floor, and "Floor" is also the progress signal. The
  // pattern order is what makes this right, so it is worth an assertion of its
  // own rather than trusting the array stays in order.
  assert.equal(
    journalKind('GRIMWALD II died on Floor 9. Cause of death: the dark. Next of kin notified.'),
    'death',
  );
});

test('anything unrecognised is routine, not a crash', () => {
  assert.equal(journalKind(''), 'routine');
  assert.equal(journalKind('a line nobody has written yet'), 'routine');
});
