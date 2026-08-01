import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { RETREAT_MIN_PCT, type StateResponse } from '@deepholdings/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { Repository } from '../src/ports.js';
import { NullSender } from '../src/push/port.js';
import { PUSH_DAILY_CAP, sweepOnce } from '../src/push/sweep.js';
import { parseServiceAccount } from '../src/push/fcm.js';
import { adapters } from './adapters.js';

const dev = loadConfig({ NODE_ENV: 'test', TOKEN_SECRET: 'push-test', DEV_TOOLS: 'true' });

/** Nothing about the sweep should ever surface an error in these tests. */
const strict = (error: unknown) => {
  throw error;
};

test('a service account is parsed, and a broken one is refused at parse time', () => {
  const account = parseServiceAccount(
    JSON.stringify({
      project_id: 'deep-holdings',
      client_email: 'push@deep-holdings.iam.gserviceaccount.com',
      // Environment variables cannot hold real newlines, so a PEM arrives
      // escaped and has to come back out with the newlines it needs to sign.
      private_key: '-----BEGIN PRIVATE KEY-----\\nAAAA\\n-----END PRIVATE KEY-----\\n',
    }),
  );
  assert.equal(account.project_id, 'deep-holdings');
  assert.match(account.private_key, /\n/, 'escaped newlines are restored');
  assert.doesNotMatch(account.private_key, /\\n/);

  assert.throws(
    () => parseServiceAccount(JSON.stringify({ project_id: 'x' })),
    /client_email, private_key/,
    'a partial credential fails at boot rather than at the first death',
  );
});

for (const adapter of adapters) {
  describe(`push (${adapter.name})`, () => {
    let repo!: Repository;
    let app!: ReturnType<typeof buildApp>;
    let token = '';
    let accountId = '';

    before(async () => {
      repo = adapter.make();
      await repo.init();
      app = buildApp({ repo, config: dev });
      const auth = await app.inject({
        method: 'POST',
        url: '/v1/auth/device',
        payload: { deviceId: `push-${Date.now()}-${Math.random()}` },
      });
      token = auth.json().token;
      accountId = auth.json().account.id;
    });

    after(async () => {
      await app.close();
      await repo.close();
    });

    const auth = () => ({ authorization: `Bearer ${token}` });

    test('a device registers, re-registers without duplicating, and unregisters', async () => {
      const first = await app.inject({
        method: 'POST',
        url: '/v1/push/register',
        headers: auth(),
        payload: { token: 'device-token-a', platform: 'android' },
      });
      assert.equal(first.statusCode, 200);
      assert.deepEqual(await repo.listPushTokens(accountId), ['device-token-a']);

      // FCM reissues tokens and apps get reinstalled; the same token arriving
      // twice is one device, not two.
      await app.inject({
        method: 'POST',
        url: '/v1/push/register',
        headers: auth(),
        payload: { token: 'device-token-a', platform: 'android' },
      });
      assert.equal((await repo.listPushTokens(accountId)).length, 1, 'still one device');

      // A second real device does get its own row.
      await app.inject({
        method: 'POST',
        url: '/v1/push/register',
        headers: auth(),
        payload: { token: 'device-token-b', platform: 'android' },
      });
      assert.equal((await repo.listPushTokens(accountId)).length, 2);

      await app.inject({
        method: 'POST',
        url: '/v1/push/unregister',
        headers: auth(),
        payload: { token: 'device-token-b' },
      });
      assert.deepEqual(await repo.listPushTokens(accountId), ['device-token-a']);
    });

    test('an empty token is refused', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/push/register',
        headers: auth(),
        payload: { token: '   ' },
      });
      assert.equal(response.statusCode, 400);
    });

    test('registration needs an account', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/push/register',
        payload: { token: 'no-bearer' },
      });
      assert.equal(response.statusCode, 401);
    });

    test('the budget refuses a repeat of the same event, and stops at the cap', async () => {
      const solo = adapter.make();
      await solo.init();
      const other = buildApp({ repo: solo, config: dev });
      const login = await other.inject({
        method: 'POST',
        url: '/v1/auth/device',
        payload: { deviceId: `budget-${Date.now()}-${Math.random()}` },
      });
      const id = login.json().account.id as string;

      assert.equal(await solo.claimPushSend(id, 'death:one', PUSH_DAILY_CAP), true);
      assert.equal(
        await solo.claimPushSend(id, 'death:one', PUSH_DAILY_CAP),
        false,
        'the same death must not ring twice',
      );

      // Fill the day, then confirm a genuinely new event is still refused.
      for (let i = 1; i < PUSH_DAILY_CAP; i += 1) {
        assert.equal(await solo.claimPushSend(id, `death:${i}`, PUSH_DAILY_CAP), true);
      }
      assert.equal(
        await solo.claimPushSend(id, 'death:overflow', PUSH_DAILY_CAP),
        false,
        'the daily cap holds even for events nobody has heard yet',
      );

      await other.close();
      await solo.close();
    });

    test('the sweep ignores accounts with no token, and accounts that were just read', async () => {
      const sender = new NullSender();

      // This account has been read (auth + the register calls above touched
      // last_seen_at), so it is not away, so nothing happens.
      const report = await sweepOnce(repo, sender, strict);
      assert.equal(report.pushed, 0);
      assert.equal(sender.sent.length, 0, 'a present officer is never swept');
    });

    test('the sweep finds a death nobody has read yet, and pushes exactly once', async () => {
      const solo = adapter.make();
      await solo.init();
      const other = buildApp({ repo: solo, config: dev });
      const login = await other.inject({
        method: 'POST',
        url: '/v1/auth/device',
        payload: { deviceId: `sweep-${Date.now()}-${Math.random()}` },
      });
      const headers = { authorization: `Bearer ${login.json().token}` };
      const id = login.json().account.id as string;

      await other.inject({
        method: 'POST',
        url: '/v1/push/register',
        headers,
        payload: { token: 'sweep-device', platform: 'android' },
      });

      // Orders that kill quickly, so the death is a certainty rather than a
      // die roll this test has to be lucky on.
      await other.inject({
        method: 'PUT',
        url: '/v1/orders',
        headers,
        payload: {
          orders: {
            targetDepth: 12,
            retreatPct: RETREAT_MIN_PCT,
            lootPriority: 'gold',
            spendPolicy: 'hoard',
          },
        },
      });

      // Wind the recruit's watermark back so there are unresolved ticks
      // waiting, exactly as a night's absence leaves them. Done through the
      // repository rather than the dev endpoint: the endpoint moves the world
      // clock, which would move it for every other test in this process.
      const record = (await solo.getLatestCharacter(id))!;
      await solo.saveCharacter({
        ...record,
        character: {
          ...record.character,
          lastResolvedTick: record.character.lastResolvedTick - 2880,
          bornTick: record.character.bornTick - 2880,
        },
      });
      // And make them away.
      await solo.transaction(async (tx) => {
        await tx.touchAccountSeen(id);
      });
      await makeAway(solo, id);

      const sender = new NullSender();
      await sweepOnce(solo, sender, strict);
      // Filtered by token rather than counted: the Postgres adapter shares one
      // database across the suite, so other tests' accounts are legitimately
      // in the candidate list and an exact count would be asserting about them.
      const mine = () => sender.sent.filter((s) => s.tokens.includes('sweep-device'));
      assert.equal(mine().length, 1, 'two days underground at retreat 10 kills somebody');
      assert.match(mine()[0].message.title, /did not return/);
      assert.equal(mine()[0].message.screen, 'terminal');

      // Beat again: the same death must not ring twice.
      await sweepOnce(solo, sender, strict);
      assert.equal(mine().length, 1, 'the same death rang twice');

      await other.close();
      await solo.close();
    });

    test('the sweep writes nothing, so the digest survives it', async () => {
      // The reason the sweep replays instead of calling loadState. "While you
      // were away" is derived from the ticks resolved *in that call*, so a
      // sweep that resolved them first would leave the players who were away
      // longest with nothing to read — a regression invisible to every other
      // test in this suite.
      const solo = adapter.make();
      await solo.init();
      const other = buildApp({ repo: solo, config: dev });
      const login = await other.inject({
        method: 'POST',
        url: '/v1/auth/device',
        payload: { deviceId: `digest-${Date.now()}-${Math.random()}` },
      });
      const headers = { authorization: `Bearer ${login.json().token}` };
      const id = login.json().account.id as string;

      await other.inject({
        method: 'POST',
        url: '/v1/push/register',
        headers,
        payload: { token: 'digest-device', platform: 'android' },
      });

      const before = (await solo.getLatestCharacter(id))!;
      await solo.saveCharacter({
        ...before,
        character: {
          ...before.character,
          lastResolvedTick: before.character.lastResolvedTick - 600,
          bornTick: before.character.bornTick - 600,
        },
      });
      await makeAway(solo, id);

      const watermark = (await solo.getLatestCharacter(id))!.character.lastResolvedTick;
      await sweepOnce(solo, new NullSender(), strict);
      assert.equal(
        (await solo.getLatestCharacter(id))!.character.lastResolvedTick,
        watermark,
        'the sweep advanced the watermark — the player would lose their digest',
      );

      // And the player's own read still gets the whole absence.
      const state = (await other.inject({
        method: 'GET',
        url: '/v1/state',
        headers,
      })).json() as StateResponse;
      assert.ok(state.digest, 'ten hours away produced no digest');
      assert.ok(state.digest.minutes > 0, `digest covered ${state.digest.minutes} minutes`);

      await other.close();
      await solo.close();
    });

    test('the sweep does not mark a swept officer as present', async () => {
      // touchAccountSeen drives the tavern's presence count and the sweep's own
      // away window. A sweep that touched it would report phantom officers in
      // the bar and drop the account out of its own candidate list.
      const solo = adapter.make();
      await solo.init();
      const other = buildApp({ repo: solo, config: dev });
      const login = await other.inject({
        method: 'POST',
        url: '/v1/auth/device',
        payload: { deviceId: `present-${Date.now()}-${Math.random()}` },
      });
      const headers = { authorization: `Bearer ${login.json().token}` };
      const id = login.json().account.id as string;

      await other.inject({
        method: 'POST',
        url: '/v1/push/register',
        headers,
        payload: { token: 'present-device', platform: 'android' },
      });
      await makeAway(solo, id);

      await sweepOnce(solo, new NullSender(), strict);
      const stillAway = await solo.listSweepCandidates(900, 500);
      assert.ok(stillAway.includes(id), 'the sweep marked the officer present');

      await other.close();
      await solo.close();
    });

    test('a token FCM rejects is deleted', async () => {
      const solo = adapter.make();
      await solo.init();
      const other = buildApp({ repo: solo, config: dev });
      const login = await other.inject({
        method: 'POST',
        url: '/v1/auth/device',
        payload: { deviceId: `stale-${Date.now()}-${Math.random()}` },
      });
      const id = login.json().account.id as string;

      await solo.savePushToken(id, 'dead-device', 'android');
      await solo.deletePushTokens(['dead-device']);
      assert.deepEqual(await solo.listPushTokens(id), []);

      await other.close();
      await solo.close();
    });
  });
}

/**
 * Backdates `last_seen_at` past the away window.
 *
 * There is no port method for this and there should not be — nothing in the
 * game moves an account backwards in time. The memory adapter is reachable
 * directly; Postgres needs SQL, which is why this is a helper rather than a
 * line in each test.
 */
async function makeAway(repo: Repository, accountId: string): Promise<void> {
  const asAny = repo as unknown as {
    accounts?: Map<string, { lastSeenAt: Date }>;
    db?: { query(sql: string, params: unknown[]): Promise<unknown> };
  };
  if (asAny.accounts) {
    const account = asAny.accounts.get(accountId);
    if (account) account.lastSeenAt = new Date(Date.now() - 3600 * 1000);
    return;
  }
  await asAny.db!.query(
    "UPDATE accounts SET last_seen_at = now() - interval '1 hour' WHERE id = $1",
    [accountId],
  );
}
