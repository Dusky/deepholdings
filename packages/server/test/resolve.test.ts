import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { MAX_CATCHUP_TICKS, type StandingOrders } from '@deepholdings/shared';
import { succeed } from '../src/domain/character.js';
import { resolve, tickOf } from '../src/domain/resolve.js';

const ORDERS: StandingOrders = {
  targetDepth: 6,
  retreatPct: 28,
  lootPriority: 'gear',
  spendPolicy: 'resupply',
};

function character(id = 'fixed-character-id', atTick = 1_000_000) {
  return succeed({
    id,
    accountId: 'account-1',
    previous: null,
    depthReached: 0,
    unlocks: [],
    atTick,
  }).character;
}

test('resolving the same span twice produces identical results', () => {
  const start = character();
  const options = {
    character: start,
    inventory: [],
    orders: ORDERS,
    unlocks: [],
    toTick: start.lastResolvedTick + 300,
    permitAppliedTick: null,
  };

  const first = resolve(options);
  const second = resolve(options);

  assert.deepEqual(second.character, first.character);
  assert.deepEqual(
    second.journal.map((e) => e.text),
    first.journal.map((e) => e.text),
  );
});

test('resolving in two halves matches resolving in one pass', () => {
  const start = character();
  const midTick = start.lastResolvedTick + 150;
  const endTick = start.lastResolvedTick + 300;

  const wholeRun = resolve({
    character: start,
    inventory: [],
    orders: ORDERS,
    unlocks: [],
    toTick: endTick,
    permitAppliedTick: null,
  });

  const firstHalf = resolve({
    character: start,
    inventory: [],
    orders: ORDERS,
    unlocks: [],
    toTick: midTick,
    permitAppliedTick: null,
  });
  const secondHalf = resolve({
    character: firstHalf.character,
    // The cabinet has to carry over, exactly as the service carries it. Handing
    // the second half an empty one makes this compare two different games: the
    // quartermaster sells the cheapest stack to cover resupply, so an empty
    // cabinet resolves to less gold and the mismatch reads as non-determinism.
    inventory: firstHalf.inventory,
    orders: ORDERS,
    unlocks: [],
    toTick: endTick,
    permitAppliedTick: firstHalf.permitAppliedTick,
  });

  assert.deepEqual(secondHalf.character, wholeRun.character);
  assert.deepEqual(
    [...firstHalf.journal, ...secondHalf.journal].map((e) => e.text),
    wholeRun.journal.map((e) => e.text),
  );
});

test('a resolved character never rewinds', () => {
  const start = character();
  const result = resolve({
    character: start,
    inventory: [],
    orders: ORDERS,
    unlocks: [],
    toTick: start.lastResolvedTick - 5,
    permitAppliedTick: null,
  });

  assert.equal(result.ticksResolved, 0);
  assert.equal(result.character.lastResolvedTick, start.lastResolvedTick);
});

test('long absences are clamped and summarised', () => {
  const start = character();
  // Cautious orders, so the run survives the whole clamped window and the
  // watermark assertion is testing the clamp rather than a death.
  const cautious: StandingOrders = { ...ORDERS, targetDepth: 1, retreatPct: 80 };
  const result = resolve({
    character: start,
    inventory: [],
    orders: cautious,
    unlocks: [],
    toTick: start.lastResolvedTick + MAX_CATCHUP_TICKS * 10,
    permitAppliedTick: null,
  });

  assert.equal(result.character.alive, true);

  assert.ok(result.ticksResolved <= MAX_CATCHUP_TICKS);
  assert.match(result.journal[0].text, /recess/i);
  // The watermark still jumps to now, so the skipped time is not re-simulated.
  assert.equal(result.character.lastResolvedTick, start.lastResolvedTick + MAX_CATCHUP_TICKS * 10);
});

test('the permit ceiling stalls the descent and then clears it', () => {
  const start = character();
  // Deep ambitions, but cautious enough to survive long enough to grade up to
  // the ceiling and wait out the office. Never-retreat orders die first.
  const deepOrders: StandingOrders = { ...ORDERS, targetDepth: 12, retreatPct: 70 };

  // Long enough to cover grading up to the ceiling and the office's own
  // processing time, which is now measured in hours rather than minutes.
  const result = resolve({
    character: start,
    inventory: [],
    orders: deepOrders,
    unlocks: [],
    toTick: start.lastResolvedTick + 1200,
    permitAppliedTick: null,
  });

  const texts = result.journal.map((e) => e.text).join('\n');
  assert.match(texts, /does not cover Depth/);
  assert.match(texts, /application filed/);
  assert.ok(result.character.permitTier > start.permitTier, 'permit tier should advance');
});

test('the stipend unlock pays out every tick', () => {
  const start = character();
  const base = resolve({
    character: start,
    inventory: [],
    orders: ORDERS,
    unlocks: [],
    toTick: start.lastResolvedTick + 50,
    permitAppliedTick: null,
  });
  const withStipend = resolve({
    character: start,
    inventory: [],
    orders: ORDERS,
    unlocks: ['stipend1'],
    toTick: start.lastResolvedTick + 50,
    permitAppliedTick: null,
  });

  assert.ok(withStipend.character.gold > base.character.gold);
});

test('death stops resolution at the tick it happened', () => {
  // Suicidal orders: deep, never retreat, so death arrives quickly.
  const start = character(randomUUID());
  const orders: StandingOrders = { ...ORDERS, targetDepth: 12, retreatPct: 5, spendPolicy: 'hoard' };

  let state = start;
  let permitAppliedTick: number | null = null;
  let death = null;
  for (let i = 0; i < 40 && !death; i += 1) {
    const result = resolve({
      character: state,
      inventory: [],
      orders,
      unlocks: [],
      toTick: state.lastResolvedTick + MAX_CATCHUP_TICKS,
      permitAppliedTick,
    });
    state = result.character;
    permitAppliedTick = result.permitAppliedTick;
    death = result.death;
    if (result.ticksResolved === 0) break;
  }

  assert.ok(death, 'expected the recruit to die eventually');
  assert.equal(state.alive, false);
  assert.equal(state.hp, 0);
  assert.equal(state.lastResolvedTick, death!.atTick);
  assert.ok(death!.pensionAwarded > 0);
});

test('tickOf advances one tick per minute', () => {
  const base = new Date('2026-01-01T00:00:00Z');
  const later = new Date(base.getTime() + 60_000);
  assert.equal(tickOf(later) - tickOf(base), 1);
});
