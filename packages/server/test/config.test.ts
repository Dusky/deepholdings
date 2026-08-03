/**
 * What the server refuses to start with.
 *
 * `loadConfig` takes its environment as an argument, so every one of these is a
 * pure-function test with no adapter and no server. That is deliberate: the
 * checks exist to fire during a deploy, and a test that needed a database to
 * prove it would be slower and prove less.
 *
 * The rule they all encode: **a misconfigured server that starts is worse than
 * one that does not.** It takes traffic, writes state, and tells nobody.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeConfig, loadConfig } from '../src/config.js';

const production = {
  NODE_ENV: 'production',
  TOKEN_SECRET: 'a-real-secret-of-adequate-length-32',
  DATABASE_URL: 'postgres://user:pass@db/deepholdings',
  CORS_ORIGINS: 'https://localhost',
};

test('production refuses the default token secret', () => {
  assert.throws(
    () => loadConfig({ ...production, TOKEN_SECRET: undefined }),
    /TOKEN_SECRET/,
  );
});

test('production refuses a short token secret', () => {
  // The old check only caught the literal default, so a one-character key
  // passed. It signs every device token; short means forgeable.
  assert.throws(() => loadConfig({ ...production, TOKEN_SECRET: 'x' }), /at least 32/);
});

test('production refuses to run without a database', () => {
  /**
   * The expensive footgun, and the reason this file exists.
   *
   * Without `DATABASE_URL` the server used to boot happily on the in-memory
   * adapter and log "State is lost on restart" at *warn* — so every account,
   * pension and commendation was discarded on the next deploy, with one line in
   * a log nobody reads as the only evidence.
   */
  assert.throws(() => loadConfig({ ...production, DATABASE_URL: undefined }), /DATABASE_URL/);
});

test('production refuses an empty CORS list', () => {
  // A server that boots, answers health checks, and rejects every browser at
  // the preflight looks like a client bug from every angle except this one.
  assert.throws(() => loadConfig({ ...production, CORS_ORIGINS: '' }), /CORS_ORIGINS/);
  assert.throws(() => loadConfig({ ...production, CORS_ORIGINS: ' , ' }), /CORS_ORIGINS/);
});

test('a valid production environment loads', () => {
  const config = loadConfig(production);
  assert.equal(config.databaseUrl, production.DATABASE_URL);
  assert.deepEqual(config.corsOrigins, ['https://localhost']);
  // Never reachable in production whatever the environment says: it rewrites a
  // player's career.
  assert.equal(loadConfig({ ...production, DEV_TOOLS: 'true' }).devTools, false);
  // And migrations are a deliberate deploy step, not a restart side effect.
  assert.equal(config.autoMigrate, false);
});

test('development keeps every convenience', () => {
  // None of the production guards may fire outside production, or a laptop
  // stops working the day someone tightens them.
  const config = loadConfig({});
  assert.equal(config.databaseUrl, null, 'the in-memory adapter is still reachable');
  assert.equal(config.autoMigrate, true);
  assert.equal(typeof config.corsOrigins, 'function', 'private-network origins still resolve');
  assert.equal(loadConfig({ DEV_TOOLS: 'true' }).devTools, true);
});

test('the boot line carries no keys', () => {
  /**
   * `tokenSecret` signs every device token and `fcmServiceAccount` can push to
   * every registered handset. Both are reported as presence, never as value —
   * a log line is the easiest place in a system to leak a credential into.
   */
  const described = describeConfig(
    loadConfig({ ...production, FCM_SERVICE_ACCOUNT: '{"private_key":"-----BEGIN-----"}' }),
  );
  const rendered = JSON.stringify(described);
  assert.ok(!rendered.includes('adequate-length'), 'the token secret was logged');
  assert.ok(!rendered.includes('BEGIN'), 'the FCM private key was logged');
  assert.ok(!rendered.includes('pass'), 'the database password was logged');
  assert.equal(described.fcm, 'configured');
  assert.equal(described.tokenSecret, 'set');
});
