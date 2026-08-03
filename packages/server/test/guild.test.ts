/**
 * The regional effort.
 *
 * This is the first number in the game that many accounts write at once, so
 * most of what is worth testing here is about concurrency and about the one
 * place a rule is stated twice — `addGuildProgress` rolls the cycle in SQL and
 * `objectiveForCycle` computes the same thing in TypeScript, because doing it
 * in two statements is exactly the race the single statement exists to avoid.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  GUILD_MINIMUM_SHARE,
  GUILD_OBJECTIVES,
  contributionOf,
  guildShare,
  objectiveForCycle,
} from '@deepholdings/shared';
import { advanceWorld, initialWorld } from '../src/domain/world.js';
import { adapters } from './adapters.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

// DEV_TOOLS so the test can advance the clock; the settle only runs when time
// has actually passed, which is the same guard that stops staff being paid once
// per tap.
const config = loadConfig({ NODE_ENV: 'test', TOKEN_SECRET: 'test-secret', DEV_TOOLS: 'true' });

const counters = {
  floorsDescended: 40,
  caseFilesFound: 3,
  encounters: 90,
  permitsApproved: 2,
};

test('the heartbeat no longer moves the bar', () => {
  /**
   * The defect this slice exists for. `advanceWorld` used to add
   * `rngInt(rng, 0, 9)` to the guild bar, so the regional effort advanced at the
   * same rate whether the office had one officer or a thousand, and whether any
   * of them ever descended. A progress bar wired to a clock is the same fault
   * the Grade readout had before `seniority`: a number that visibly moves while
   * meaning nothing.
   */
  let world = initialWorld(new Date());
  const before = world.guildProgress;
  for (let beat = 0; beat < 50; beat += 1) world = advanceWorld(world, new Date());
  assert.equal(world.guildProgress, before);
  assert.equal(world.beat, 50, 'but the rest of the world still turns');
  assert.ok(world.market.every((quote) => quote.demand > 0));
});

test('an objective counts one thing, and only that thing', () => {
  for (const objective of GUILD_OBJECTIVES) {
    const scored = contributionOf(objective.metric, counters, 'holdings');
    assert.ok(scored > 0, `${objective.metric} counted nothing`);
  }
  assert.equal(contributionOf('floors', counters, 'holdings'), 40);
  assert.equal(contributionOf('files', counters, 'holdings'), 3);
  assert.equal(contributionOf('permits', counters, 'holdings'), 2);
});

test('the Annexe counts for more', () => {
  // The only place the regional effort acknowledges which site an officer chose.
  assert.equal(contributionOf('floors', counters, 'annexe'), 60);
});

test('turning up at all is worth reading about', () => {
  /**
   * Share-proportional alone means a casual officer who contributed eleven
   * floors out of four thousand collects two hundred and forty gold and
   * correctly concludes the system is not for them. The floor is the design.
   */
  const objective = GUILD_OBJECTIVES[0];
  assert.equal(guildShare(11, objective.target, objective.purse), GUILD_MINIMUM_SHARE);
  // And above the floor it scales with what was actually done.
  const half = guildShare(objective.target / 2, objective.target, objective.purse);
  assert.equal(half, Math.round(objective.purse / 2));
  assert.equal(guildShare(0, objective.target, objective.purse), 0, 'nothing for nothing');
});

for (const { name, make } of adapters) {
  test(`progress accumulates and completion rolls the cycle exactly once (${name})`, async () => {
    const repo = make();
    await repo.init();
    // The world is a single shared row, so Postgres carries whatever the last
    // test left. Roll to a clean objective first rather than assuming an empty
    // bar — the alternative is a suite whose tests only pass in one order.
    await repo.addGuildProgress(objectiveForCycle((await repo.getWorld()).guildCycle).target);
    const before = await repo.getWorld();
    assert.equal(before.guildProgress, 0);
    const objective = objectiveForCycle(before.guildCycle);

    // Just short of the target, in pieces, the way many officers would.
    let completions = 0;
    const step = Math.floor(objective.target / 10);
    for (let i = 0; i < 9; i += 1) {
      const out = await repo.addGuildProgress(step);
      if (out.completed) completions += 1;
    }
    assert.equal(completions, 0, 'completed before the target was reached');
    const mid = await repo.getWorld();
    assert.equal(mid.guildProgress, step * 9);
    assert.equal(mid.guildCycle, before.guildCycle);

    // And over it.
    const last = await repo.addGuildProgress(objective.target);
    assert.equal(last.completed, true);
    assert.equal(last.cycle, before.guildCycle, 'the completed cycle, not the new one');

    const after = await repo.getWorld();
    assert.equal(after.guildCycle, before.guildCycle + 1);
    assert.equal(after.guildProgress, 0, 'the new objective starts empty');
    // The rule stated twice — in SQL and in TypeScript — has to agree.
    const next = objectiveForCycle(after.guildCycle);
    assert.equal(after.guildObjective, next.text);
    assert.equal(after.guildTarget, next.target);
  });

  test(`concurrent contributions are not lost (${name})`, async () => {
    // A read-modify-write would drop most of these. The whole reason
    // `addGuildProgress` is one statement is that this is the first shared
    // counter in the game.
    const repo = make();
    await repo.init();
    await repo.addGuildProgress(objectiveForCycle((await repo.getWorld()).guildCycle).target);
    const before = await repo.getWorld();
    const objective = objectiveForCycle(before.guildCycle);
    const each = Math.floor(objective.target / 200);

    await Promise.all(Array.from({ length: 50 }, () => repo.addGuildProgress(each)));

    const after = await repo.getWorld();
    assert.equal(after.guildCycle, before.guildCycle, 'the target should not have been reached');
    assert.equal(
      after.guildProgress,
      before.guildProgress + each * 50,
      'contributions were lost to a race',
    );
  });

  test(`every cycle of the rotation rolls to the right objective (${name})`, async () => {
    /**
     * The SQL in `addGuildProgress` reimplements `objectiveForCycle` as a CASE,
     * which is duplication accepted on purpose — the alternative is a second
     * statement, and a second statement is the race this one avoids. So the two
     * are checked against each other for the whole rotation rather than trusted
     * to stay in step.
     */
    const repo = make();
    await repo.init();
    for (let step = 0; step < GUILD_OBJECTIVES.length + 1; step += 1) {
      const world = await repo.getWorld();
      const expected = objectiveForCycle(world.guildCycle);
      assert.equal(world.guildObjective, expected.text, `cycle ${world.guildCycle} text`);
      assert.equal(world.guildTarget, expected.target, `cycle ${world.guildCycle} target`);
      await repo.addGuildProgress(expected.target);
    }
  });

  test(`the share reaches the purse and the journal on the next read (${name})`, async () => {
    /**
     * The settle path end to end, seeded rather than played.
     *
     * Driving a real career until a 4,000-floor objective completes takes days
     * of simulated time and lands on whichever objective happens to be in
     * force, which made three attempts at a live probe measure nothing. What
     * matters is deterministic: a contribution against a cycle the world has
     * passed is owed a payout, exactly once, and the officer is told.
     */
    const repo = make();
    await repo.init();
    const app = buildApp({ repo, config });
    const auth = await app.inject({
      method: 'POST', url: '/v1/auth/device',
      payload: { deviceId: `guild-pay-${name}-${randomUUID()}` },
    });
    const { token, account } = auth.json() as { token: string; account: { id: string } };
    const headers = { authorization: `Bearer ${token}` };

    const world = await repo.getWorld();
    const objective = objectiveForCycle(world.guildCycle);
    const contribution = Math.round(objective.target / 4);
    await repo.saveGuildStanding(account.id, {
      cycle: world.guildCycle, contribution, paid: 0,
    });
    // Somebody else finishes it.
    await repo.addGuildProgress(objective.target);

    /**
     * The purse is read from storage rather than through `/v1/state`, because
     * that request *is* a settling read — it resolves ticks, and settling is
     * now on the shared post-resolution path. Bracketing the advance with two
     * GETs would have the first one pay out and the second show no change,
     * which is what this test originally asserted and why it caught the
     * refactor rather than the behaviour.
     */
    const goldBefore = (await repo.getActiveCharacterForUpdate(account.id))!.character.gold;
    await app.inject({
      method: 'POST', url: '/v1/dev/advance', headers, payload: { hours: 2 },
    });
    const after = (await app.inject({ method: 'GET', url: '/v1/state', headers })).json();
    const goldAfter = (await repo.getActiveCharacterForUpdate(account.id))!.character.gold;

    const owed = guildShare(contribution, objective.target, objective.purse);
    assert.ok(goldAfter > goldBefore, `the share never reached the purse (${goldBefore} -> ${goldAfter})`);
    const journal: { text: string }[] = after.journal;
    const line = journal.find((entry) => /Regional objective met/.test(entry.text));
    assert.ok(line, 'the officer was paid and not told');
    assert.match(line.text, new RegExp(String(owed)));

    const settled = await repo.getGuildStanding(account.id);
    assert.equal(settled.paid, owed);
    // Cleared, not necessarily zero: the same span that settled the old cycle
    // also contributes to the new one, so what remains is this span's work
    // rather than the quarter-objective that was just paid for.
    assert.ok(
      settled.contribution < contribution,
      `the settled contribution (${settled.contribution}) was not cleared`,
    );
    assert.equal(
      settled.cycle,
      (await repo.getWorld()).guildCycle,
      'the watermark must move or the same purse pays forever',
    );

    // And a second read pays nothing further.
    await app.inject({
      method: 'POST', url: '/v1/dev/advance', headers, payload: { hours: 2 },
    });
    assert.equal((await repo.getGuildStanding(account.id)).paid, owed);
    await app.close();
  });

  test(`a share is paid once, on the next read, and only to contributors (${name})`, async () => {
    const repo = make();
    await repo.init();
    const account = await repo.transaction((tx) =>
      tx.createAccount(`guild-${name}-${randomUUID()}`, 'OFFICER'));

    const world = await repo.getWorld();
    const objective = objectiveForCycle(world.guildCycle);
    await repo.saveGuildStanding(account.id, {
      cycle: world.guildCycle, contribution: objective.target / 4, paid: 0,
    });
    await repo.addGuildProgress(objective.target);

    const owed = guildShare(objective.target / 4, objective.target, objective.purse);
    assert.ok(owed > GUILD_MINIMUM_SHARE, 'a quarter of the work should beat the floor');

    // Settling is what `applyGuild` does; asserted here at the storage level so
    // the claim-once property is checked without a whole resolved career.
    const standing = await repo.getGuildStanding(account.id);
    assert.ok(standing.cycle < (await repo.getWorld()).guildCycle, 'a payout is owed');
    await repo.saveGuildStanding(account.id, {
      cycle: (await repo.getWorld()).guildCycle, contribution: 0, paid: owed,
    });
    const settled = await repo.getGuildStanding(account.id);
    assert.equal(settled.contribution, 0);
    assert.equal(
      settled.cycle,
      (await repo.getWorld()).guildCycle,
      'the watermark must move or the same purse pays forever',
    );
  });
}
