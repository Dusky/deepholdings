/**
 * The tutorial teaches by having the player act. These pin the properties that
 * make that true rather than the wording, which will keep changing.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REQUISITION_CATALOGUE,
  UNLOCK_CATALOGUE,
  type Office,
  type Pension,
  type ScreenId,
} from '@deepholdings/shared';
import { TUTORIAL_STEPS, tutorialStep, type TutorialInput } from '../src/domain/tutorial.js';

const ALL: ScreenId[] = ['terminal', 'orders', 'ledger', 'bulletin', 'tavern', 'armoury'];
const cheapestKit = REQUISITION_CATALOGUE.reduce((low, e) => (e.cost < low.cost ? e : low));
const cheapestUnlock = UNLOCK_CATALOGUE.reduce((low, e) => (e.cost < low.cost ? e : low));

function input(overrides: Partial<TutorialInput> = {}): TutorialInput {
  return {
    ordersFiled: false,
    office: { requisitions: [], spent: 0 } as unknown as Office,
    pension: { total: 0, spent: 0, unlocks: [] } as Pension,
    clearance: ALL,
    predecessorName: null,
    ...overrides,
  };
}

test('a brand-new officer is taught the core verb first', () => {
  const step = tutorialStep(input());
  assert.equal(step?.id, 'orders');
  assert.equal(step?.index, 1);
  assert.equal(step?.screen, 'orders');
});

test('each step completes on a fact that cannot be undone', () => {
  // The whole reason there is no persisted tutorial progress. Filing orders,
  // owning equipment and redeeming an upgrade are all one-way, so a step can
  // never be shown to somebody who has already done it and nothing can drift
  // out of step with a save.
  const afterOrders = tutorialStep(input({ ordersFiled: true }));
  assert.equal(afterOrders?.id, 'equipment');

  const afterKit = tutorialStep(
    input({
      ordersFiled: true,
      office: { requisitions: [cheapestKit.id], spent: cheapestKit.cost } as unknown as Office,
      pension: { total: cheapestUnlock.cost, spent: 0, unlocks: [] } as Pension,
    }),
  );
  assert.equal(afterKit?.id, 'upgrade');
  assert.equal(afterKit?.index, TUTORIAL_STEPS);

  const done = tutorialStep(
    input({
      ordersFiled: true,
      office: { requisitions: [cheapestKit.id], spent: cheapestKit.cost } as unknown as Office,
      pension: {
        total: cheapestUnlock.cost, spent: cheapestUnlock.cost, unlocks: [cheapestUnlock.id],
      } as Pension,
    }),
  );
  assert.equal(done, null, 'a finished tutorial is silent');
});

test('the death step waits for a death instead of announcing one', () => {
  // The lesson the old exposition card tried to deliver in paragraph two, to a
  // player who had never seen a recruit die. It is held back until there is a
  // pension to spend, so the death teaches itself and the step spends it.
  const noPension = tutorialStep(
    input({
      ordersFiled: true,
      office: { requisitions: [cheapestKit.id], spent: cheapestKit.cost } as unknown as Office,
    }),
  );
  assert.equal(noPension, null, 'nothing is said about pension before there is any');
});

test('a step is never an instruction the player cannot follow', () => {
  // Two ways that could happen: naming a screen without clearance, or naming a
  // purchase that is not affordable.
  const noLedger = tutorialStep(input({ ordersFiled: true, clearance: ['terminal', 'orders'] }));
  assert.equal(noLedger, null);

  const cannotAfford = tutorialStep(
    input({
      ordersFiled: true,
      office: { requisitions: [cheapestKit.id], spent: 0 } as unknown as Office,
      pension: { total: cheapestUnlock.cost - 1, spent: 0, unlocks: [] } as Pension,
    }),
  );
  assert.equal(cannotAfford, null);
});

test('the last step names the recruit who paid for it', () => {
  const step = tutorialStep(
    input({
      ordersFiled: true,
      office: { requisitions: [cheapestKit.id], spent: cheapestKit.cost } as unknown as Office,
      pension: { total: cheapestUnlock.cost, spent: 0, unlocks: [] } as Pension,
      predecessorName: 'GRIMWALD I, THE UNREMARKABLE',
    }),
  );
  assert.match(step!.because, /GRIMWALD I/);
});

test('every step is an instruction, not a description', () => {
  // The failure this replaced was a card of declarative facts. A step has to
  // start with a verb the player can carry out, and say why in terms of their
  // own position rather than the game's design.
  const steps = [
    tutorialStep(input()),
    tutorialStep(input({ ordersFiled: true })),
    tutorialStep(
      input({
        ordersFiled: true,
        office: { requisitions: [cheapestKit.id], spent: 0 } as unknown as Office,
        pension: { total: cheapestUnlock.cost, spent: 0, unlocks: [] } as Pension,
      }),
    ),
  ];

  const openers = /^(Open|Sell|Redeem|File|Buy|Set|Send)\b/;
  for (const step of steps) {
    assert.ok(step, 'expected a step');
    assert.match(step!.instruction, openers, `not imperative: "${step!.instruction}"`);
    assert.ok(step!.because.length > 0);
    // No sentence-ending punctuation: these render as a label and a clause, and
    // a full stop mid-line reads as two thoughts.
    assert.doesNotMatch(step!.instruction, /\.$/);
  }
});
