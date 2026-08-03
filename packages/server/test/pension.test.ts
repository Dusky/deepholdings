/**
 * What `pensionAward` claims about itself.
 *
 * The function's doc comment asserted for months that the award "accrues with
 * *service*", and that the anti-death-farming property followed from it. Over
 * ninety days the service term was 35,219 against an estate term of 909,861 —
 * the comment described a design nobody had implemented, and the whole suite
 * was green throughout, because nothing here tested the *shape* of the formula.
 * Only the balance harness could see it, and only once someone thought to split
 * the terms apart.
 *
 * So these are tests of the claims rather than of the arithmetic. A future
 * retune is free to move every constant; it is not free to make the sentence
 * "a pension accrues with service" false again without a red test.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PENSION_DEPTH_FACTOR,
  PENSION_ESTATE_RATE,
  PENSION_SERVICE_RATE,
  pensionAward,
} from '@deepholdings/shared';

/** A day underground at the deepest floor the Authority authorises. */
const DAY = 1440;
const DEEP = 12;

test('service is the larger half of a realistic award', () => {
  /**
   * The claim, stated as a number.
   *
   * "Realistic" is doing work here: an estate is not arbitrary, it is what a
   * recruit accumulates in the time they are alive. This is roughly a day at
   * Floor 12 holding a purse of 12,000 — measured from the ninety-day run,
   * where estates ran a few thousand to low tens of thousands.
   */
  const service = DAY * PENSION_SERVICE_RATE * (1 + DEEP * PENSION_DEPTH_FACTOR);
  const estate = 12_000 * PENSION_ESTATE_RATE;

  assert.ok(
    service > estate,
    `service ${Math.round(service)} must exceed estate ${Math.round(estate)}`,
  );
  assert.ok(
    service / (service + estate) > 0.6,
    `service is only ${((service / (service + estate)) * 100).toFixed(0)}% of the award`,
  );
});

test('a recruit who died in forty minutes is worth almost nothing', () => {
  // The anti-farming property, and the one that used to hold by accident: a
  // short life was cheap because it had not accumulated an *estate* either.
  // Now it is cheap because it did not serve.
  const short = pensionAward(40, 2, 0);
  const long = pensionAward(DAY, DEEP, 0);
  assert.ok(short * 100 < long, `40 minutes paid ${short} against a day's ${long}`);
});

test('churning short careers cannot beat letting one run', () => {
  /**
   * The property the whole formulation exists for, tested the way it would
   * actually be exploited: same wall-clock time, same floor, sliced up.
   *
   * Service is linear in time, so the slices sum to exactly the whole — the
   * exploit is not merely unprofitable, it is arithmetically neutral, and the
   * setback of a fresh recruit at Depth 0 makes it strictly worse in practice.
   */
  const whole = pensionAward(DAY, DEEP, 0);
  const sliced = Array.from({ length: 24 }, () => pensionAward(60, DEEP, 0)).reduce(
    (total, award) => total + award,
    0,
  );
  assert.ok(sliced <= whole, `24 one-hour careers paid ${sliced} against ${whole}`);
});

test('depth is the officer’s lever on the rate, and a wide one', () => {
  // Once the award is mostly service, depth is the *only* thing an officer
  // controls about it. At the old 0.3 a timid officer on Floor 2 banked 35% of
  // a Floor 12 officer's rate for taking none of the risk.
  const shallow = pensionAward(DAY, 2, 0);
  const deep = pensionAward(DAY, DEEP, 0);
  assert.ok(deep / shallow > 3, `Floor 12 pays only ${(deep / shallow).toFixed(1)}x Floor 2`);
});

test('spending gold costs a tenth of itself, not two fifths', () => {
  /**
   * Why this is a test and not a constant nobody reads: the estate term makes
   * **every gold sink a pension tax**, because gold spent is gold not in the
   * purse at death. At 0.4 a department at six gold a minute cost 35% of
   * lifetime pension, and the loss compounded through Service Credit — the
   * formula was pricing systems that had not been designed yet.
   *
   * It is deliberately not zero. Zero would make the purse at death worthless
   * and take `HOARD_SALE_BONUS`, the `hoard` spend policy and the insurance
   * bonus down with it.
   */
  const spent = 10_000;
  const kept = pensionAward(DAY, DEEP, spent);
  const gone = pensionAward(DAY, DEEP, 0);
  assert.equal(kept - gone, Math.round(spent * PENSION_ESTATE_RATE));
  assert.ok(PENSION_ESTATE_RATE > 0, 'a worthless estate takes three systems with it');
  assert.ok(PENSION_ESTATE_RATE <= 0.15, 'a sink priced above this is a tax first');
});

test('negative service is not a payout', () => {
  assert.equal(pensionAward(-5000, DEEP, 0), 0);
});

test('Service Credit scales both terms alike', () => {
  // It multiplies the sum, so it cannot change which half dominates — which is
  // why the harness measures the split before applying it.
  const plain = pensionAward(DAY, DEEP, 5_000);
  const credited = pensionAward(DAY, DEEP, 5_000, ['service1']);
  assert.ok(credited > plain);
  // Within a coin, since both sides round independently.
  assert.ok(Math.abs(credited - plain * 1.2) <= 1, `${credited} against ${plain * 1.2}`);
});
