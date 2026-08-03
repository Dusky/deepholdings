/**
 * A retried purchase must not charge twice.
 *
 * The control test matters as much as the positive one: two requests with
 * *different* keys must both go through. Without it, a guard somewhere else in
 * the game could be doing the work and these would pass while the mechanism did
 * nothing.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { STAFF_LADDER, staffTier } from '@deepholdings/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { KEY_RETENTION_SECONDS, STALE_RESERVATION_SECONDS } from '../src/idempotency.js';
import { adapters } from './adapters.js';
import type { Repository } from '../src/ports.js';

const config = loadConfig({ NODE_ENV: 'test', TOKEN_SECRET: 'test-secret', DEV_TOOLS: 'true' });

/** An officer with gold in the purse and a permit, ready to spend. */
async function officer(repo: Repository, label: string) {
  const app = buildApp({ repo, config });
  const auth = await app.inject({
    method: 'POST', url: '/v1/auth/device', payload: { deviceId: `${label}-${randomUUID()}` },
  });
  const { token, account } = auth.json() as { token: string; account: { id: string } };
  const headers = { authorization: `Bearer ${token}` };

  const record = (await repo.getActiveCharacterForUpdate(account.id))!;
  await repo.saveCharacter({ ...record, character: { ...record.character, gold: 100_000 } });
  return { app, headers, accountId: account.id };
}

for (const { name, make } of adapters) {
  test(`the same key hires once (${name})`, async () => {
    /**
     * The sharp case. `hireStaff` climbs a *ladder*, so a duplicate request is
     * not a repeated purchase — it buys the next tier, which the officer never
     * asked for and which costs six thousand gold rather than eight hundred.
     */
    const repo = make();
    await repo.init();
    const { app, headers, accountId } = await officer(repo, 'idem-hire');
    const key = randomUUID();
    const send = () =>
      app.inject({
        method: 'POST', url: '/v1/registry/hire',
        headers: { ...headers, 'idempotency-key': key },
        payload: { role: 'clerk' },
      });

    const first = await send();
    const second = await send();

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.equal(second.headers['idempotency-replayed'], 'true');
    assert.deepEqual(second.json(), first.json(), 'the replay differed from the original');

    const registry = await repo.getRegistry(accountId);
    assert.equal(staffTier(registry, 'clerk'), 1, 'the retry promoted a post nobody hired for');
    assert.equal(registry.spent, STAFF_LADDER[0].cost, 'charged twice');
    await app.close();
  });

  test(`different keys still climb the ladder (${name})`, async () => {
    // The control. If this failed, some other guard would be doing the work and
    // the test above would prove nothing about idempotency.
    const repo = make();
    await repo.init();
    const { app, headers, accountId } = await officer(repo, 'idem-ladder');
    for (const key of [randomUUID(), randomUUID()]) {
      const response = await app.inject({
        method: 'POST', url: '/v1/registry/hire',
        headers: { ...headers, 'idempotency-key': key },
        payload: { role: 'clerk' },
      });
      assert.equal(response.statusCode, 200);
    }
    assert.equal(staffTier(await repo.getRegistry(accountId), 'clerk'), 2);
    await app.close();
  });

  test(`a key reused for a different request is refused (${name})`, async () => {
    // Otherwise a caller could send one key with two bodies and be handed the
    // first body's response for the second body's request — a worse failure
    // than the double-charge this exists to prevent.
    const repo = make();
    await repo.init();
    const { app, headers } = await officer(repo, 'idem-conflict');
    const key = randomUUID();

    await app.inject({
      method: 'POST', url: '/v1/registry/hire',
      headers: { ...headers, 'idempotency-key': key }, payload: { role: 'clerk' },
    });
    const other = await app.inject({
      method: 'POST', url: '/v1/registry/hire',
      headers: { ...headers, 'idempotency-key': key }, payload: { role: 'officer' },
    });
    assert.equal(other.statusCode, 409);
    assert.equal(other.json().error.code, 'duplicate_request');
    await app.close();
  });

  test(`a failure does not burn the key (${name})`, async () => {
    /**
     * Only 2xx is recorded. Replaying "insufficient gold" a minute later would
     * refuse a purchase the officer can now afford, which is the same class of
     * wrong as charging twice — the server answering from a stale world.
     */
    const repo = make();
    await repo.init();
    const app = buildApp({ repo, config });
    const auth = await app.inject({
      method: 'POST', url: '/v1/auth/device', payload: { deviceId: `idem-poor-${randomUUID()}` },
    });
    const { token, account } = auth.json() as { token: string; account: { id: string } };
    const headers = { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() };

    const broke = await app.inject({
      method: 'POST', url: '/v1/registry/hire', headers, payload: { role: 'clerk' },
    });
    assert.equal(broke.json().error.code, 'insufficient_gold');

    const record = (await repo.getActiveCharacterForUpdate(account.id))!;
    await repo.saveCharacter({ ...record, character: { ...record.character, gold: 100_000 } });

    const funded = await app.inject({
      method: 'POST', url: '/v1/registry/hire', headers, payload: { role: 'clerk' },
    });
    assert.equal(funded.statusCode, 200, 'the key was burned by a refusal');
    await app.close();
  });

  test(`a held key is refused, and reclaimed once abandoned (${name})`, async () => {
    /**
     * The residual risk, made visible. A process dying between the mutation and
     * the outcome write leaves the row at `status IS NULL`; without reclaim the
     * key jams forever, and with it there is a one-window double-charge. The
     * jam is worse, so the window is the accepted trade — and this is the test
     * that says so out loud.
     */
    const repo = make();
    await repo.init();
    const { app, headers, accountId } = await officer(repo, 'idem-stale');
    const key = randomUUID();

    const claim = await repo.beginIdempotent(
      accountId, key, 'POST /v1/registry/hire',
      // The hash the hook computes for this body.
      (await import('node:crypto')).createHash('sha256')
        .update(JSON.stringify({ role: 'clerk' })).digest('hex'),
      STALE_RESERVATION_SECONDS,
    );
    assert.equal(claim.state, 'fresh');

    const blocked = await app.inject({
      method: 'POST', url: '/v1/registry/hire',
      headers: { ...headers, 'idempotency-key': key }, payload: { role: 'clerk' },
    });
    assert.equal(blocked.statusCode, 409);
    assert.equal(blocked.json().error.code, 'duplicate_request');

    await repo.backdateIdempotentForTesting(accountId, key, STALE_RESERVATION_SECONDS + 10);
    const allowed = await app.inject({
      method: 'POST', url: '/v1/registry/hire',
      headers: { ...headers, 'idempotency-key': key }, payload: { role: 'clerk' },
    });
    assert.equal(allowed.statusCode, 200, 'an abandoned reservation jammed the key');
    await app.close();
  });

  test(`selling twice with one key sells once (${name})`, async () => {
    const repo = make();
    await repo.init();
    const { app, headers, accountId } = await officer(repo, 'idem-sell');
    const record = (await repo.getActiveCharacterForUpdate(accountId))!;
    const stack = record.inventory[0];
    assert.ok(stack, 'the starting kit should have something in it');

    const key = randomUUID();
    const send = () =>
      app.inject({
        method: 'POST', url: '/v1/ledger/sell',
        headers: { ...headers, 'idempotency-key': key },
        payload: { name: stack.name, quantity: 1 },
      });
    const first = await send();
    const second = await send();
    assert.equal(first.statusCode, 200);
    assert.deepEqual(second.json(), first.json());

    const after = (await repo.getActiveCharacterForUpdate(accountId))!;
    const held = after.inventory.find((item) => item.name === stack.name)?.quantity ?? 0;
    assert.equal(held, stack.quantity - 1, 'the retry sold another one');
    await app.close();
  });

  test(`expiry removes old keys and leaves fresh ones (${name})`, async () => {
    const repo = make();
    await repo.init();
    const { app, headers, accountId } = await officer(repo, 'idem-expire');
    const old = randomUUID();
    const recent = randomUUID();
    for (const key of [old, recent]) {
      await app.inject({
        method: 'POST', url: '/v1/ledger/sell',
        headers: { ...headers, 'idempotency-key': key },
        payload: { name: 'Torch, Municipal Issue', quantity: 1 },
      });
    }
    await repo.backdateIdempotentForTesting(accountId, old, KEY_RETENTION_SECONDS + 60);

    assert.ok((await repo.expireIdempotency(KEY_RETENTION_SECONDS)) >= 1);
    const stillThere = await repo.beginIdempotent(
      accountId, recent, 'POST /v1/ledger/sell', 'whatever', STALE_RESERVATION_SECONDS,
    );
    assert.equal(stillThere.state, 'conflict', 'the fresh key was swept away');
    await app.close();
  });

  test(`a request without a key is untouched (${name})`, async () => {
    // The header is not required today. Every existing client works unchanged,
    // and the guarantee simply does not apply to a caller that omits it.
    const repo = make();
    await repo.init();
    const { app, headers, accountId } = await officer(repo, 'idem-none');
    for (let i = 0; i < 2; i += 1) {
      await app.inject({
        method: 'POST', url: '/v1/registry/hire', headers, payload: { role: 'clerk' },
      });
    }
    assert.equal(staffTier(await repo.getRegistry(accountId), 'clerk'), 2);
    await app.close();
  });
}
