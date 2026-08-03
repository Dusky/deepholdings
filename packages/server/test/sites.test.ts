/**
 * The second site.
 *
 * Two things are being protected here. The first is that `holdings` reproduces
 * the global behaviour it replaced *exactly* — every number in
 * `docs/design/balance.md` was measured before sites existed, and if the home
 * site drifts by a floor then none of those numbers describe the game any more.
 *
 * The second is that a site an officer paid a Commendation for is not worse
 * than the free one. It was, on the first measurement, and the mechanism is the
 * oldest failure in this codebase: danger causes deaths, deaths reset grade,
 * `authorisedDepth` clamps depth to grade, and yield scales superlinearly with
 * depth. A harder site spirals its own recruits into the shallows.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_ORDERS,
  PERMIT_DEPTH_LIMIT,
  SITE_CATALOGUE,
  authorisedDepth,
  authorisedSite,
  permitDepthLimit,
  siteAuthorised,
  siteSpec,
  GRIEVOUS_MAX_FRACTION,
  MAX_HIT_FRACTION,
} from '@deepholdings/shared';
import { succeed } from '../src/domain/character.js';
import { encounterDamage, resolve } from '../src/domain/resolve.js';

test('the home site reproduces the ladder it replaced, tier for tier', () => {
  for (const tier of Object.keys(PERMIT_DEPTH_LIMIT).map(Number)) {
    assert.equal(permitDepthLimit(tier, 'holdings'), PERMIT_DEPTH_LIMIT[tier], `D-${tier}`);
  }
  // And it is what a caller that names no site gets, so nothing measured moves.
  assert.equal(permitDepthLimit(8), PERMIT_DEPTH_LIMIT[8]);
  assert.equal(authorisedDepth(12, 8, 40), authorisedDepth(12, 8, 40, 'holdings'));
  assert.equal(DEFAULT_ORDERS.site, 'holdings');
});

test('the Annexe reads the same permit more grudgingly', () => {
  for (const tier of [1, 2, 3, 4, 5]) {
    assert.ok(
      permitDepthLimit(tier, 'annexe') < permitDepthLimit(tier, 'holdings'),
      `D-${tier} should authorise less at the Annexe`,
    );
  }
  // But both ladders end in the same place: the Annexe is a different site, not
  // a deeper one. `MAX_DEPTH` is load-bearing in three files and stays put.
  assert.equal(permitDepthLimit(8, 'annexe'), permitDepthLimit(8, 'holdings'));
  for (const spec of SITE_CATALOGUE) assert.equal(spec.maxDepth, 12);
});

test('a site is closed until the Commendation is held', () => {
  assert.equal(siteAuthorised('holdings', []), true);
  assert.equal(siteAuthorised('annexe', []), false);
  assert.equal(siteAuthorised('annexe', ['secondment1']), true);
});

test('an order for a site the officer lost access to falls back, it does not throw', () => {
  // Reached on *read*, where the only sane behaviour is to send the recruit
  // somewhere safe. `updateOrders` refuses on the way in instead, so an officer
  // filing for a closed site is told rather than silently redirected.
  assert.equal(authorisedSite('annexe', []), 'holdings');
  assert.equal(authorisedSite('annexe', ['secondment1']), 'annexe');
});

/** One career, resolved for a fixed span, at one site. */
function run(site: 'holdings' | 'annexe', seed: string) {
  const start = succeed({
    id: seed, accountId: seed, previous: null, depthReached: 0, unlocks: [], atTick: 0,
  });
  let character = start.character;
  let inventory = start.inventory;
  let caseFiles = start.caseFiles;
  let permitAppliedTick: number | null = start.permitAppliedTick;
  let gold = 0;
  let deaths = 0;
  let n = 1;

  for (let tick = 0; tick < 14 * 1440; ) {
    const out = resolve({
      character, inventory, caseFiles, permitAppliedTick,
      orders: { ...DEFAULT_ORDERS, site },
      unlocks: [],
      toTick: Math.min(tick + 240, 14 * 1440),
      commendations: site === 'annexe' ? ['secondment1'] : [],
    });
    character = out.character;
    inventory = out.inventory;
    caseFiles = out.caseFiles;
    permitAppliedTick = out.permitAppliedTick;
    tick = character.lastResolvedTick;
    // The officer's visit, reduced to the one thing this test measures.
    gold += inventory.reduce((total, item) => total + item.unitValue * item.quantity, 0);
    inventory = [];

    if (!character.alive) {
      deaths += 1;
      n += 1;
      const heir = succeed({
        id: `${seed}-${n}`, accountId: seed, previous: character,
        depthReached: character.depth, unlocks: [], atTick: tick,
      });
      character = heir.character;
      inventory = heir.inventory;
      caseFiles = heir.caseFiles;
      permitAppliedTick = heir.permitAppliedTick;
    }
  }
  return { gold, deaths };
}

test('the Annexe pays for itself: more gold, and more deaths for it', () => {
  /**
   * The regression that matters most in this file.
   *
   * The Annexe shipped its first measurement at 1.35 danger and came out
   * strictly worse than the free site on *both* currencies — a place you pay a
   * Commendation to reach and then earn less at. Nothing failed; the numbers
   * were simply bad, and only a comparison caught it.
   */
  let annexeGold = 0;
  let holdingsGold = 0;
  let annexeDeaths = 0;
  let holdingsDeaths = 0;
  for (let seed = 0; seed < 6; seed += 1) {
    const a = run('annexe', `site-a-${seed}`);
    const h = run('holdings', `site-h-${seed}`);
    annexeGold += a.gold;
    holdingsGold += h.gold;
    annexeDeaths += a.deaths;
    holdingsDeaths += h.deaths;
  }

  assert.ok(
    annexeGold > holdingsGold,
    `the Annexe realised ${annexeGold} against Holdings' ${holdingsGold}`,
  );
  assert.ok(
    annexeDeaths > holdingsDeaths,
    `and it has to cost something: ${annexeDeaths} deaths against ${holdingsDeaths}`,
  );
});

test('a site multiplier cannot lift a blow above the cap', () => {
  /**
   * Danger is applied *before* `MAX_HIT_FRACTION`, so a harder site lands more
   * blows near the ceiling and never one above it. Applied after, it would
   * raise the ceiling instead — which is how the retreat threshold stopped
   * meaning anything the last time something was multiplied in the wrong
   * order, and the reason `maxHpForLevel` had to be capped at all.
   */
  const maxHp = 161;
  const ordinaryCap = Math.round(maxHp * MAX_HIT_FRACTION);
  const grievousCap = Math.round(maxHp * GRIEVOUS_MAX_FRACTION);
  const annexe = siteSpec('annexe').danger;

  let hardest = 0;
  let hardestGrievous = 0;
  for (let roll = 0; roll <= 1; roll += 0.01) {
    // A tenfold danger, well past anything the catalogue holds, so the cap is
    // proved rather than merely not reached by today's numbers.
    hardest = Math.max(hardest, encounterDamage(12, 12, roll, maxHp, false, 0, 10));
    hardestGrievous = Math.max(hardestGrievous, encounterDamage(12, 12, roll, maxHp, true, 0, 10));
  }
  assert.ok(hardest <= ordinaryCap, `${hardest} exceeds the ${ordinaryCap} cap`);
  assert.ok(hardestGrievous <= grievousCap, `${hardestGrievous} exceeds ${grievousCap}`);

  // And at the Annexe's real multiplier it does bite, or the field is scenery.
  const plain = encounterDamage(6, 6, 0.5, maxHp, false, 0, 1);
  const harder = encounterDamage(6, 6, 0.5, maxHp, false, 0, annexe);
  assert.ok(harder > plain, `${harder} should exceed ${plain}`);
});
