import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { LIMITS, RateLimiter } from '../src/rateLimit.js';
import { MemoryRepository } from '../src/adapters/memory.js';

const config = loadConfig({ NODE_ENV: 'test', TOKEN_SECRET: 'rate-test' });

describe('the bucket', () => {
  test('a burst is allowed, and the one after it is not', () => {
    const limiter = new RateLimiter(() => 0);
    const limit = { burst: 3, perMinute: 6 };
    for (let i = 0; i < 3; i += 1) {
      assert.equal(limiter.take('a', limit), null, `request ${i + 1} of the burst`);
    }
    const wait = limiter.take('a', limit);
    assert.ok(wait !== null && wait > 0, 'the fourth should have been held');
  });

  test('tokens come back over time, at the stated rate', () => {
    let clock = 0;
    const limiter = new RateLimiter(() => clock);
    const limit = { burst: 2, perMinute: 6 }; // one token every ten seconds

    assert.equal(limiter.take('a', limit), null);
    assert.equal(limiter.take('a', limit), null);
    assert.ok(limiter.take('a', limit) !== null, 'burst spent');

    clock += 9_000;
    assert.ok(limiter.take('a', limit) !== null, 'nine seconds is not ten');

    clock += 2_000;
    assert.equal(limiter.take('a', limit), null, 'eleven seconds buys one');
  });

  test('the bucket refills continuously rather than resetting on a boundary', () => {
    // The reason this is a bucket and not a fixed window. A window lets someone
    // spend the whole allowance at the end of one and the whole of the next
    // immediately after — twice the intended rate, at the worst moment.
    let clock = 0;
    const limiter = new RateLimiter(() => clock);
    const limit = { burst: 5, perMinute: 60 }; // one a second

    for (let i = 0; i < 5; i += 1) assert.equal(limiter.take('a', limit), null);

    // A whole minute of sustained pressure, one request a second: every one
    // should be allowed, and never more than that.
    let allowed = 0;
    for (let second = 0; second < 60; second += 1) {
      clock += 1000;
      if (limiter.take('a', limit) === null) allowed += 1;
    }
    assert.equal(allowed, 60, `sustained rate was ${allowed}/min, expected 60`);
  });

  test('the wait it reports is long enough to actually succeed', () => {
    let clock = 0;
    const limiter = new RateLimiter(() => clock);
    const limit = { burst: 1, perMinute: 6 };

    assert.equal(limiter.take('a', limit), null);
    const wait = limiter.take('a', limit);
    assert.ok(wait !== null);

    clock += wait * 1000;
    assert.equal(limiter.take('a', limit), null, 'retry-after was too short to work');
  });

  test('keys do not share a bucket', () => {
    const limiter = new RateLimiter(() => 0);
    const limit = { burst: 1, perMinute: 6 };
    assert.equal(limiter.take('one', limit), null);
    assert.equal(limiter.take('two', limit), null, 'one officer throttled another');
  });

  test('idle buckets are forgotten', () => {
    // Otherwise the map grows with every account and address that has ever
    // written, forever, on a process that is meant to stay up.
    let clock = 0;
    const limiter = new RateLimiter(() => clock);
    const limit = { burst: 1, perMinute: 6 };

    for (let i = 0; i < 50; i += 1) limiter.take(`key-${i}`, limit);
    assert.equal(limiter.size, 50);

    clock += 60 * 60 * 1000;
    limiter.take('someone-new', limit);
    assert.equal(limiter.size, 1, 'stale buckets were kept');
  });
});

describe('the hook', () => {
  let repo!: MemoryRepository;
  let app!: ReturnType<typeof buildApp>;
  let token = '';

  before(async () => {
    repo = new MemoryRepository();
    await repo.init();
    app = buildApp({ repo, config });
    const auth = await app.inject({
      method: 'POST',
      url: '/v1/auth/device',
      payload: { deviceId: 'rate-limit-test' },
    });
    token = auth.json().token;
  });

  after(async () => {
    await app.close();
    await repo.close();
  });

  test('the tavern throttles, in voice, with a retry-after', async () => {
    const send = () =>
      app.inject({
        method: 'POST',
        url: '/v1/tavern',
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'anybody down there' },
      });

    const limit = LIMITS['POST /v1/tavern'];
    for (let i = 0; i < limit.burst; i += 1) {
      assert.equal((await send()).statusCode, 200, `message ${i + 1} of the burst`);
    }

    const blocked = await send();
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.json().error.code, 'rate_limited');
    assert.match(blocked.json().error.message, /clerk/i, 'a 429 should still be in voice');
    assert.ok(Number(blocked.headers['retry-after']) > 0, 'no retry-after to obey');
  });

  test('reads are never throttled', async () => {
    // Resolution happens on read. Throttling /v1/state would stall the game
    // itself, and the load check says a read costs about 12ms — nobody is
    // hurting Postgres from a phone.
    for (let i = 0; i < 40; i += 1) {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/state',
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(response.statusCode, 200, `read ${i + 1}`);
    }
  });

  test('a bad token gets 401, not 429', async () => {
    // The limiter runs first, so this needs it to deliberately stand aside.
    // "You are going too fast" is a confusing thing to tell someone whose real
    // problem is that they are logged out, and a client told to back off will
    // back off rather than re-authenticate — the one action that would fix it.
    // This test failed on the first run: bad tokens fell through to the IP
    // bucket and started 429ing on the fourth attempt.
    for (let i = 0; i < 30; i += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/tavern',
        headers: { authorization: 'Bearer nonsense' },
        payload: { body: 'hello' },
      });
      assert.equal(response.statusCode, 401, `attempt ${i + 1}`);
    }
  });
});
