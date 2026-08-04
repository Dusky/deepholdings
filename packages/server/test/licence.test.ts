/**
 * The Tier III licence: the rule, and the two paths that could bypass it.
 *
 * The rule itself is three lines and hard to get wrong. What is easy to get
 * wrong is *who* it binds — the officer buys unlocks, and so does the Junior
 * Officer inside `runStaff`, and a rule enforced on one of those is not a rule.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TIER_III_LICENCES,
  UNLOCK_CATALOGUE,
  licenceBlocked,
  licencesSpent,
  type UnlockId,
} from '@deepholdings/shared';
import { nextUnlock } from '../tools/officer.js';

const tierThree = UNLOCK_CATALOGUE.filter((e) => e.tier === 3);
/** Every rung of a track up to and including `tier`. */
const climb = (track: string, tier: number): UnlockId[] =>
  UNLOCK_CATALOGUE.filter((e) => e.track === track && e.tier <= tier).map((e) => e.id);

test('nothing below Tier III is ever licensed', () => {
  // The whole point of licensing only the top rung is that the early game is
  // untouched, so this is the property that keeps the first career whole.
  const spent = tierThree.slice(0, TIER_III_LICENCES).flatMap((e) => climb(e.track, 3));
  for (const entry of UNLOCK_CATALOGUE.filter((e) => e.tier < 3)) {
    assert.equal(licenceBlocked(spent, entry), false, `${entry.id} was licensed`);
  }
});

test('licences bind only once the allowance is spent', () => {
  let owned: UnlockId[] = [];
  for (let n = 0; n < TIER_III_LICENCES; n += 1) {
    const entry = tierThree[n];
    assert.equal(licenceBlocked(owned, entry), false, `blocked with ${n} spent`);
    owned = [...owned, ...climb(entry.track, 3)];
    assert.equal(licencesSpent(owned), n + 1);
  }
  assert.equal(licenceBlocked(owned, tierThree[TIER_III_LICENCES]), true);
});

test('a licensed track does not re-spend its own licence', () => {
  // Guards an off-by-one that would make a track unbuyable the moment it was
  // bought — `licencesSpent` counts the track being asked about.
  const owned = tierThree.slice(0, TIER_III_LICENCES).flatMap((e) => climb(e.track, 3));
  for (const entry of tierThree.slice(0, TIER_III_LICENCES)) {
    assert.equal(licenceBlocked(owned, entry), false, `${entry.track} blocked itself`);
  }
});

test('the officer stops seeing a ladder they cannot climb', () => {
  // This is what turns the rule into a prestige loop: `visit()` files Form T-1
  // when `nextUnlock` returns null, so exhausting licences is what sends an
  // officer to the next posting.
  const everything = UNLOCK_CATALOGUE.filter(
    (e) => e.tier < 3 || tierThree.slice(0, TIER_III_LICENCES).some((t) => t.track === e.track),
  ).map((e) => e.id);
  assert.equal(licencesSpent(everything), TIER_III_LICENCES);
  assert.equal(
    nextUnlock(everything),
    null,
    'blocked rungs were still offered, so the officer would never transfer',
  );
});

test('a build takes the track it wants, not the cheapest', () => {
  // Without this the preference is decorative: cheapest-first would take
  // `permits3` (41,000) over `service3` (88,000) every time.
  const throughTwo = UNLOCK_CATALOGUE.filter((e) => e.tier <= 2).map((e) => e.id);
  const wanted = nextUnlock(throughTwo, ['service', 'estate']);
  assert.equal(wanted?.track, 'service');
  const other = nextUnlock(throughTwo, ['permits']);
  assert.equal(other?.track, 'permits');
  assert.notEqual(wanted?.id, other?.id, 'two builds picked the same rung');
});

test('two builds cannot both license the same three tracks', () => {
  // The property that makes the catalogue replayable: whatever an officer
  // takes, something they did not take is still on the ladder for a later
  // posting. Fails the moment TIER_III_LICENCES reaches the number of tracks.
  assert.ok(
    TIER_III_LICENCES < tierThree.length,
    'every track can be licensed in one career, so nothing is ever passed over',
  );
});
