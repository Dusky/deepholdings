import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DAILY_CAP,
  budgetState,
  canSend,
  refund,
  resetBudget,
  spend,
  type BudgetStore,
} from '../src/native/sendBudget';

function memoryStore(): BudgetStore {
  const cells = new Map<string, string>();
  return {
    getItem: (key) => cells.get(key) ?? null,
    setItem: (key, value) => void cells.set(key, value),
    removeItem: (key) => void cells.delete(key),
  };
}

/** A device that hands over storage and then refuses to write to it. */
function readOnlyStore(): BudgetStore {
  return {
    getItem: () => null,
    setItem: () => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    },
    removeItem: () => undefined,
  };
}

const MONDAY = new Date('2026-03-02T10:00:00');
const TUESDAY = new Date('2026-03-03T10:00:00');

test('the same event is never delivered twice', () => {
  const store = memoryStore();
  assert.equal(spend('permit:4', MONDAY, store), true);
  assert.equal(canSend('permit:4', MONDAY, store), false, 'already promised');
  assert.equal(spend('permit:4', MONDAY, store), false, 'and spending is refused too');

  // A different tier is a different event, sharing the same notification slot.
  assert.equal(canSend('permit:5', MONDAY, store), true);
});

test('a day carries at most the cap', () => {
  const store = memoryStore();
  for (let i = 0; i < DAILY_CAP; i += 1) {
    assert.equal(spend(`event:${i}`, MONDAY, store), true, `event ${i} should fit`);
  }
  assert.equal(budgetState(MONDAY, store).remaining, 0);
  assert.equal(canSend('one-too-many', MONDAY, store), false);
  assert.equal(spend('one-too-many', MONDAY, store), false);
});

test('the cap resets on the local calendar day, not on a rolling window', () => {
  const store = memoryStore();
  for (let i = 0; i < DAILY_CAP; i += 1) spend(`event:${i}`, MONDAY, store);
  assert.equal(canSend('anything', MONDAY, store), false);

  assert.equal(canSend('anything', TUESDAY, store), true, 'tomorrow is a fresh budget');
  // And yesterday's keys stop blocking, so a daily reminder is daily.
  assert.equal(canSend('event:0', TUESDAY, store), true);
});

test('a cancelled delivery gives its key back', () => {
  // syncNotifications cancels and re-derives the whole schedule on every
  // refresh. Without the refund an officer who opens the app five times while
  // one permit processes would spend the entire day's budget on that permit.
  const store = memoryStore();
  for (let i = 0; i < 5; i += 1) {
    refund('permit:4', MONDAY, store);
    assert.equal(spend('permit:4', MONDAY, store), true, `refresh ${i} should reschedule`);
  }
  assert.equal(budgetState(MONDAY, store).spent, 1, 'five refreshes, one delivery');
});

test('refunding something that was never sent changes nothing', () => {
  const store = memoryStore();
  spend('permit:4', MONDAY, store);
  refund('permit:9', MONDAY, store);
  assert.equal(budgetState(MONDAY, store).spent, 1);
});

test('a device that cannot persist the budget still notifies', () => {
  // The alternative is refusing to notify at all because we cannot remember
  // that we did, which turns a storage quirk into a silent feature outage.
  const store = readOnlyStore();
  assert.equal(canSend('permit:4', MONDAY, store), true);
  assert.equal(spend('permit:4', MONDAY, store), true);
  assert.equal(spend('permit:4', MONDAY, store), true, 'unbudgeted rather than blocked');
});

test('corrupt stored budget is treated as a fresh day', () => {
  const store = memoryStore();
  store.setItem('deepholdings.sendBudget', '{not json');
  assert.equal(canSend('permit:4', MONDAY, store), true);
});

test('resetting clears the day', () => {
  const store = memoryStore();
  for (let i = 0; i < DAILY_CAP; i += 1) spend(`event:${i}`, MONDAY, store);
  resetBudget(store);
  assert.equal(budgetState(MONDAY, store).spent, 0);
});
