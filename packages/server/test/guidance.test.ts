/**
 * The game now answers "what am I working toward" and "what should I do now".
 * These pin the answers that matter, and one that matters most: silence.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMPTY_REGISTRY,
  REQUISITION_CATALOGUE,
  UNLOCK_CATALOGUE,
  type Character,
  type Office,
  type Pension,
  type ScreenId,
} from '@deepholdings/shared';
import { guidanceFor, type GuidanceInput } from '../src/domain/guidance.js';

const ALL: ScreenId[] = ['terminal', 'orders', 'ledger', 'bulletin', 'tavern', 'armoury'];

function input(overrides: Partial<GuidanceInput> = {}): GuidanceInput {
  return {
    character: { name: 'WREN HALLAM', gold: 0, permitTier: 3 } as Character,
    pension: { total: 0, spent: 0, unlocks: [] } as Pension,
    office: { requisitions: [], spent: 0 } as unknown as Office,
    registry: EMPTY_REGISTRY,
    pendingPermit: null,
    retirement: null,
    ordersFiled: true,
    clearance: ALL,
    ...overrides,
  };
}

test('an officer with nothing to do is told so, not given a chore', () => {
  // The load-bearing case. Absence is never punished here and two check-ins a
  // day should be plenty, so "nothing needs you" has to be a supported answer.
  // A hint system that always finds something is a daily obligation in
  // disguise, which is on the list of things not to copy.
  assert.equal(guidanceFor(input()).action, null);
});

test('the aim is never empty, because "nothing is ahead of me" is the churn', () => {
  for (const state of [
    input(),
    input({ ordersFiled: false }),
    input({ pendingPermit: { tier: 4, authorisesDepth: 6, secondsRemaining: 3600 } as never }),
    input({ retirement: { eligible: true, award: 4200, serviceTicks: 900, minServiceTicks: 120 } }),
  ]) {
    assert.ok(guidanceFor(state).aim.length > 0);
  }
});

test('a player who has never filed orders is pointed at the core verb', () => {
  const { action } = guidanceFor(input({ ordersFiled: false }));
  assert.equal(action?.screen, 'orders');
  assert.match(action!.text, /standing orders/i);
});

test('staff who have stopped work outrank an affordable upgrade', () => {
  // Ordering is by what it costs to miss. Unpaid staff are losing the officer
  // value every minute and the cause is invisible from every screen except the
  // one that stopped working; an upgrade will still be there tomorrow.
  const cheapest = UNLOCK_CATALOGUE.reduce((low, e) => (e.cost < low.cost ? e : low));
  const { action } = guidanceFor(
    input({
      registry: { ...EMPTY_REGISTRY, unpaid: true },
      pension: { total: cheapest.cost * 10, spent: 0, unlocks: [] } as Pension,
    }),
  );
  assert.match(action!.text, /stopped work/i);
});

test('an affordable permanent upgrade is surfaced before a gold one', () => {
  const unlock = UNLOCK_CATALOGUE.reduce((low, e) => (e.cost < low.cost ? e : low));
  const kit = REQUISITION_CATALOGUE.reduce((low, e) => (e.cost < low.cost ? e : low));
  const { action } = guidanceFor(
    input({
      pension: { total: unlock.cost, spent: 0, unlocks: [] } as Pension,
      character: { name: 'W', gold: kit.cost, permitTier: 3 } as Character,
    }),
  );
  assert.equal(action?.screen, 'ledger');
  assert.match(action!.text, new RegExp(unlock.label, 'i'));
});

test('nothing is suggested on a screen the officer cannot reach', () => {
  // A first-session officer has Terminal and Orders only. Pointing them at the
  // Ledger would name a door that is not on their file.
  const unlock = UNLOCK_CATALOGUE.reduce((low, e) => (e.cost < low.cost ? e : low));
  const { action } = guidanceFor(
    input({
      clearance: ['terminal', 'orders'],
      pension: { total: unlock.cost * 5, spent: 0, unlocks: [] } as Pension,
      registry: { ...EMPTY_REGISTRY, unpaid: true },
    }),
  );
  assert.notEqual(action?.screen, 'ledger');
});

test('the aim names the permit and what it buys, in floors', () => {
  const { aim } = guidanceFor(
    input({
      pendingPermit: { tier: 4, authorisesDepth: 6, secondsRemaining: 7200 } as never,
    }),
  );
  assert.match(aim, /D-4/);
  assert.match(aim, /Floor 6/);
  // Not "Depth". One word for the vertical axis, everywhere.
  assert.doesNotMatch(aim, /depth/i);
});

test('chasing paperwork is offered last, because missing it costs nothing', () => {
  // Form 4-E is additive: the permit clears either way. It must never outrank
  // something the officer is actually losing by ignoring.
  const withBoth = guidanceFor(
    input({
      character: { name: 'W', gold: 100_000, permitTier: 3 } as Character,
      pendingPermit: {
        tier: 4, authorisesDepth: 6, secondsRemaining: 3600, expedited: false, expediteCost: 120,
      } as never,
      registry: { ...EMPTY_REGISTRY, unpaid: true },
    }),
  );
  assert.match(withBoth.action!.text, /stopped work/i);

  const alone = guidanceFor(
    input({
      character: { name: 'W', gold: 100_000, permitTier: 3 } as Character,
      office: { requisitions: REQUISITION_CATALOGUE.map((e) => e.id), spent: 0 } as unknown as Office,
      pendingPermit: {
        tier: 4, authorisesDepth: 6, secondsRemaining: 3600, expedited: false, expediteCost: 120,
      } as never,
    }),
  );
  assert.match(alone.action!.text, /halve the permit wait/i);
});
