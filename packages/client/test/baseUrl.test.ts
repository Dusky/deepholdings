import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveBaseUrl,
  type BaseUrlEnvironment,
  type OverrideStorage,
} from '../src/api/baseUrl';

const KEY = 'deepholdings.apiUrl';

function memoryStorage(seed: Record<string, string> = {}): OverrideStorage {
  const cells = new Map(Object.entries(seed));
  return {
    getItem: (key) => cells.get(key) ?? null,
    setItem: (key, value) => void cells.set(key, value),
  };
}

/** A browser that hands over a storage object and then refuses to use it. */
function hostileStorage(seed: Record<string, string> = {}): OverrideStorage {
  const cells = new Map(Object.entries(seed));
  return {
    getItem: (key) => cells.get(key) ?? null,
    setItem: () => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    },
  };
}

function env(overrides: Partial<BaseUrlEnvironment> = {}): BaseUrlEnvironment {
  return {
    configured: 'http://localhost:8787',
    dev: true,
    search: '',
    storage: memoryStorage(),
    ...overrides,
  };
}

test('falls back to the configured host with no override', () => {
  assert.equal(resolveBaseUrl(env()), 'http://localhost:8787');
});

test('a release build ignores the query override entirely', () => {
  const url = resolveBaseUrl(
    env({
      dev: false,
      configured: 'https://api.deepholdings.example',
      search: '?api=http://192.168.1.2:8787',
      storage: memoryStorage({ [KEY]: 'http://192.168.1.2:8787' }),
    }),
  );
  assert.equal(url, 'https://api.deepholdings.example');
});

test('a dev build takes the query override and remembers it', () => {
  const storage = memoryStorage();
  const url = resolveBaseUrl(
    env({ search: '?api=http://192.168.1.2:8787', storage }),
  );
  assert.equal(url, 'http://192.168.1.2:8787');
  assert.equal(storage.getItem(KEY), 'http://192.168.1.2:8787');
});

test('a remembered override survives a reload without the query', () => {
  const url = resolveBaseUrl(
    env({ storage: memoryStorage({ [KEY]: 'http://192.168.1.2:8787' }) }),
  );
  assert.equal(url, 'http://192.168.1.2:8787');
});

// The LAN bug: a phone that refuses storage silently lost the override and
// talked to itself. Failing to remember must never mean failing to obey.
test('the query override still applies when storage refuses to keep it', () => {
  const url = resolveBaseUrl(
    env({ search: '?api=http://192.168.1.2:8787', storage: hostileStorage() }),
  );
  assert.equal(url, 'http://192.168.1.2:8787');
});

test('the query override still applies when there is no storage at all', () => {
  const url = resolveBaseUrl(
    env({ search: '?api=http://192.168.1.2:8787', storage: null }),
  );
  assert.equal(url, 'http://192.168.1.2:8787');
});

test('a throwing getItem degrades to the configured host', () => {
  const url = resolveBaseUrl(
    env({
      storage: {
        getItem: () => {
          throw new DOMException('blocked', 'SecurityError');
        },
        setItem: () => {},
      },
    }),
  );
  assert.equal(url, 'http://localhost:8787');
});

test('trailing slashes are stripped from every source', () => {
  assert.equal(
    resolveBaseUrl(env({ search: '?api=http://192.168.1.2:8787/' })),
    'http://192.168.1.2:8787',
  );
  assert.equal(
    resolveBaseUrl(env({ storage: memoryStorage({ [KEY]: 'http://h:1/' }) })),
    'http://h:1',
  );
  assert.equal(
    resolveBaseUrl(env({ configured: 'https://api.example/' })),
    'https://api.example',
  );
});

test('an empty ?api= is not an override', () => {
  assert.equal(resolveBaseUrl(env({ search: '?api=' })), 'http://localhost:8787');
});
