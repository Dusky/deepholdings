import assert from 'node:assert/strict';
import test from 'node:test';

import { randomId, type UuidSource } from '../src/api/deviceId';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A secure context: everything present. */
const secure: UuidSource = {
  randomUUID: () => '11111111-2222-4333-8444-555555555555',
  getRandomValues: (array) => array,
};

/**
 * An insecure context — `http://192.168.1.42:5173`, which is what
 * `docs/ops/device-testing.md` tells you to open on a phone. `randomUUID` is
 * gone; `getRandomValues` is not, and never was.
 */
function insecure(seed = 7): UuidSource {
  // xorshift32, and the whole byte comes from the mixed word. The first
  // version of this used an LCG's *low* byte, which is the textbook weak spot
  // — 500 seeds collided, and the failure looked like a bug in randomId until
  // I looked at which side had produced the duplicates. The fixture has to be
  // better than the thing it is checking.
  let n = seed + 0x9e3779b9;
  return {
    getRandomValues: (array) => {
      const bytes = array as unknown as Uint8Array;
      for (let i = 0; i < bytes.length; i += 1) {
        n ^= n << 13;
        n ^= n >>> 17;
        n ^= n << 5;
        n >>>= 0;
        bytes[i] = (n >>> 24) & 0xff;
      }
      return array;
    },
  };
}

test('a secure context uses the platform generator', () => {
  assert.equal(randomId(secure), '11111111-2222-4333-8444-555555555555');
});

test('an insecure context still mints a valid v4', () => {
  // The bug this exists for: crypto.randomUUID is secure-context only, and the
  // device id is the first thing the client needs. Without the fallback the
  // app does not degrade on a LAN address, it fails to start —
  // "crypto.randomUUID is not a function" before a single pixel.
  const id = randomId(insecure());
  assert.match(id, V4, `${id} is not a v4 uuid`);
});

test('the version and variant bits are set, not just the shape', () => {
  // A generator that emits the right *shape* from raw random bytes is wrong
  // one time in sixteen on each of two nibbles, so shape alone would pass by
  // luck most runs.
  for (let seed = 0; seed < 200; seed += 1) {
    const id = randomId(insecure(seed));
    assert.equal(id[14], '4', `seed ${seed}: version nibble is ${id[14]}`);
    assert.ok('89ab'.includes(id[19]), `seed ${seed}: variant nibble is ${id[19]}`);
  }
});

test('ids do not collide', () => {
  const seen = new Set<string>();
  for (let seed = 0; seed < 500; seed += 1) seen.add(randomId(insecure(seed)));
  assert.equal(seen.size, 500);
});

test('no Web Crypto at all still returns something usable', () => {
  // Vanishingly rare, and still better than throwing: this value names a
  // device to a server that issues its own signed token. It is a handle, not
  // a secret.
  assert.match(randomId({}), V4);
  assert.match(randomId(undefined), V4);
});

test('a hostile source that throws is not caught here', () => {
  // Deliberate. A `getRandomValues` that throws is a broken platform, not a
  // missing feature, and silently falling through to Math.random would hide
  // it. The two fallbacks are for *absence*.
  assert.throws(() =>
    randomId({
      getRandomValues: () => {
        throw new Error('nope');
      },
    }),
  );
});
