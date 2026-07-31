import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeRng, tickSeed } from '@deepholdings/shared';
import {
  ALL_LOOT_NAMES,
  bandOf,
  combatNote,
  faunaFor,
  lootFor,
  quietNote,
} from '../src/domain/flavor.js';

const rngAt = (tick: number) => makeRng(tickSeed('flavour-test', tick));

/** Everything drawn over `ticks` ticks, the way the resolver would draw it. */
function sample(ticks: number, draw: (rng: () => number) => string): string[] {
  return Array.from({ length: ticks }, (_, i) => draw(rngAt(i)));
}

test('the same tick always reads the same way', () => {
  // A journal that rewrites itself on refresh is a bug report, and the resolver
  // re-derives past ticks on every catch-up.
  for (const tick of [0, 1, 977, 250_000]) {
    assert.equal(faunaFor(5, rngAt(tick)), faunaFor(5, rngAt(tick)));
    assert.equal(combatNote(rngAt(tick)), combatNote(rngAt(tick)));
    assert.equal(quietNote(rngAt(tick)), quietNote(rngAt(tick)));
    assert.equal(lootFor('gear', 5, rngAt(tick)), lootFor('gear', 5, rngAt(tick)));
  }
});

test('depth changes what the recruit meets', () => {
  const shallow = new Set(sample(400, (rng) => faunaFor(1, rng)));
  const deep = new Set(sample(400, (rng) => faunaFor(12, rng)));

  // Bands share the qualifier vocabulary but never the species, so a name from
  // Floor 1 cannot turn up on Floor 12.
  const overlap = [...shallow].filter((name) => deep.has(name));
  assert.deepEqual(overlap, [], 'floor 1 and floor 12 must not share encounters');

  assert.equal(bandOf(1), 0);
  assert.equal(bandOf(3), 0);
  assert.equal(bandOf(4), 1);
  assert.equal(bandOf(7), 2);
  assert.equal(bandOf(12), 3);
});

test('encounters do not visibly repeat over a fortnight of play', () => {
  // Roughly what a balanced fortnight produces: ~10 encounters an hour for two
  // weeks. The old flat list of seven names repeated every forty minutes.
  const names = sample(3400, (rng) => faunaFor(6, rng));
  const distinct = new Set(names).size;
  assert.ok(distinct > 300, `only ${distinct} distinct encounters in 3400 draws`);

  // No single name should dominate the log either.
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  const commonest = Math.max(...counts.values());
  assert.ok(commonest < names.length * 0.03, `one name took ${commonest} of 3400 slots`);
});

test('journal notes have enough variety to survive a long shift', () => {
  assert.ok(new Set(sample(600, combatNote)).size > 40);
  assert.ok(new Set(sample(600, quietNote)).size > 20);
});

/**
 * The invariant that keeps loot names written rather than generated: they are
 * inventory stack keys. `stow()` groups by name, so an unbounded name space
 * means every acquisition becomes its own stack and a twelve-slot cabinet
 * liquidates everything at depot rates forever.
 */
test('loot names are a bounded set', () => {
  const drawn = new Set<string>();
  for (const priority of ['gold', 'gear', 'relics', 'knowledge']) {
    for (const depth of [1, 6, 7, 12]) {
      for (const name of sample(500, (rng) => lootFor(priority, depth, rng))) {
        drawn.add(name);
      }
    }
  }

  assert.ok(drawn.size <= ALL_LOOT_NAMES.length, 'generated a name outside the catalogue');
  for (const name of drawn) {
    assert.ok(ALL_LOOT_NAMES.includes(name), `${name} is not in the loot catalogue`);
  }
  // Small enough that one officer's cabinet stays legible.
  assert.ok(ALL_LOOT_NAMES.length <= 64, `${ALL_LOOT_NAMES.length} loot names is too many`);
});

test('deep floors yield different loot from shallow ones', () => {
  const shallow = new Set(sample(300, (rng) => lootFor('relics', 3, rng)));
  const deep = new Set(sample(300, (rng) => lootFor('relics', 9, rng)));
  assert.deepEqual([...shallow].filter((name) => deep.has(name)), []);
});
