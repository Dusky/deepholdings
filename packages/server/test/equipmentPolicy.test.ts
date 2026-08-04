/**
 * Equipment Policy: the officer decides what the quartermaster keeps.
 *
 * The hole this closes is not cosmetic. `file()` kept three case files and
 * discarded the weakest on a fixed formula nobody could see, which was tolerable
 * while case files were only *found* — and stops being tolerable now they can be
 * invested in. Union Standing is scarce, and a system that may bin the thing you
 * just spent it on is a system nobody uses twice.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { equipmentPolicyOf, type CaseFile } from '@deepholdings/shared';
import { caseFileWorth, file } from '../src/domain/caseFiles.js';

/** A file carrying exactly the clauses named, so worth() is predictable. */
function make(id: string, clauseIds: string[], countersigned = false): CaseFile {
  return {
    id, name: `case ${id}`, category: 'gear', grade: 4,
    unitValue: 100, clauseIds, countersigned,
  };
}

// e-commissioned: +10 vigour. e-hazard: +3% survival. e-schedule: +8% loot.
const beefy = make('A', ['e-commissioned']);
const tough = make('B', ['e-hazard']);
const rich = make('C', ['e-schedule']);

test('an absent policy behaves exactly as the game did before', () => {
  // The compatibility promise. Orders stored before this field existed must
  // produce identical behaviour, or the migration silently changed every
  // existing officer's drawer.
  assert.equal(equipmentPolicyOf({}), 'balanced');
  assert.equal(
    caseFileWorth(beefy, 'balanced'),
    // vigour + survival*200 + lootValue*120, the shipped formula verbatim.
    10,
  );
});

test('each policy keeps what it says it keeps', () => {
  const held = [beefy, tough, rich];

  // Under survival, the survival file must never be the one released.
  const survival = file(held, make('D', ['e-hazard', 'e-commissioned']), 'survival');
  assert.notEqual(survival.displaced?.id, 'B');

  // Under loot, the loot file survives.
  const loot = file(held, make('E', ['e-schedule', 'e-commissioned']), 'lootValue');
  assert.notEqual(loot.displaced?.id, 'C');
});

test('a countersigned file is never released, even for a better one', () => {
  // Design rule 1, and the one that must not bend. `tough` is the weakest under
  // `balanced` by a wide margin and is countersigned, so the incoming file has
  // to displace something else.
  const held = [beefy, make('B', ['e-hazard'], true), rich];
  const incoming = make('D', ['e-founder', 'e-priority']);

  const result = file(held, incoming, 'balanced');
  assert.notEqual(result.displaced?.id, 'B');
  assert.ok(result.files.some((f) => f.id === 'B'), 'the countersigned file stays');
});

test('passing something up is reported, not acted on', () => {
  // Rule 1's second half. The officer kept a weaker file on purpose; they
  // should hear once that it cost them, and the system must not "help".
  const held = [make('A', ['e-certified'], true), tough, rich];
  const incoming = make('D', ['e-founder', 'e-priority']);

  const result = file(held, incoming, 'balanced');
  assert.equal(result.passedOver?.id, 'A');
  assert.ok(result.files.some((f) => f.id === 'A'));
});

test('a drawer of countersigned files turns arrivals away', () => {
  const held = [make('A', ['e-certified'], true), make('B', ['e-hazard'], true),
                make('C', ['e-schedule'], true)];
  const incoming = make('D', ['e-founder', 'e-priority']);

  const result = file(held, incoming, 'balanced');
  assert.equal(result.displaced?.id, 'D', 'the arrival is what is released');
  assert.equal(result.files.length, 3);
});

test('OFFICER ONLY never substitutes', () => {
  const held = [beefy, tough, rich];
  const incoming = make('D', ['e-founder', 'e-priority']);

  const result = file(held, incoming, 'officer');
  assert.equal(result.displaced?.id, 'D');
  assert.deepEqual(result.files.map((f) => f.id), ['A', 'B', 'C']);
});

test('a drawer with room still accepts, under every policy', () => {
  // The refusal is about substitution, not about arrivals. A player with two
  // files and OFFICER ONLY should still receive a third.
  for (const policy of ['balanced', 'officer', 'survival'] as const) {
    const result = file([beefy, tough], rich, policy);
    assert.equal(result.displaced, null, `${policy} refused an arrival with room to spare`);
    assert.equal(result.files.length, 3);
  }
});

test('displacement is deterministic when two files tie', () => {
  // Runs inside resolution, so a replay has to be identical (design rule 5).
  const a = make('AAA', ['e-certified']);
  const b = make('BBB', ['e-certified']);
  const c = make('CCC', ['e-founder']);
  const incoming = make('DDD', ['e-priority']);

  const first = file([a, b, c], incoming, 'balanced');
  const second = file([a, b, c], incoming, 'balanced');
  assert.equal(first.displaced?.id, second.displaced?.id);
  assert.equal(first.displaced?.id, 'AAA', 'ties break on the lower id');
});
