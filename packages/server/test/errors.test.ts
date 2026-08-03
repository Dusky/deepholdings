/**
 * What reaches the error reporter, and — more importantly — what does not.
 *
 * A tracker that fires on ordinary play is muted within a day, and a muted
 * tracker looks like coverage while providing none. So the interesting
 * assertion here is the negative one.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MemoryRepository } from '../src/adapters/memory.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { LogReporter, RecordingReporter } from '../src/errors.js';

const config = loadConfig({ NODE_ENV: 'test', TOKEN_SECRET: 'test-secret' });

async function signedIn(repo: MemoryRepository, reporter: RecordingReporter) {
  const app = buildApp({ repo, config, reporter });
  const auth = await app.inject({
    method: 'POST', url: '/v1/auth/device', payload: { deviceId: `err-${Math.random()}` },
  });
  const { token } = auth.json() as { token: string };
  return { app, headers: { authorization: `Bearer ${token}` } };
}

test('the game saying no is not an incident', async () => {
  /**
   * `ServiceError` is the rules working: "not enough gold", "the post is
   * filled", "no such post". Reporting these would put ordinary play into the
   * alert channel, and the channel would be ignored by the end of the week.
   */
  const repo = new MemoryRepository();
  await repo.init();
  const reporter = new RecordingReporter();
  const { app, headers } = await signedIn(repo, reporter);

  const refused = await app.inject({
    method: 'POST', url: '/v1/registry/hire', headers, payload: { role: 'not-a-post' },
  });
  assert.equal(refused.statusCode, 400);
  assert.equal(refused.json().error.code, 'invalid_request');
  assert.equal(reporter.reported.length, 0, 'a refusal was reported as a failure');

  // And a genuine shortage, which is the most common one of all.
  const poor = await app.inject({
    method: 'POST', url: '/v1/registry/hire', headers, payload: { role: 'archivist' },
  });
  assert.equal(poor.json().error.code, 'insufficient_gold');
  assert.equal(reporter.reported.length, 0);
  await app.close();
});

test('an unexpected failure is reported once, with the request on it', async () => {
  const repo = new MemoryRepository();
  await repo.init();
  const reporter = new RecordingReporter();
  // Something no handler predicted, from inside the read path.
  repo.getWorld = async () => {
    throw new Error('storage exploded');
  };
  const { app, headers } = await signedIn(repo, reporter);

  const response = await app.inject({ method: 'GET', url: '/v1/state', headers });
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json().error.code, 'internal');
  assert.equal(reporter.reported.length, 1);
  assert.equal(reporter.reported[0].context.url, '/v1/state');
  assert.ok(reporter.reported[0].context.reqId, 'without a request id it cannot be traced');
  await app.close();
});

test('the log reporter serialises the error rather than passing it through', () => {
  /**
   * A bare `Error` in a JSON log line renders as `{}` in most drains, because
   * `stack` and `message` are not enumerable. Nobody discovers that until the
   * incident, which is the worst possible moment.
   */
  const lines: unknown[] = [];
  const reporter = new LogReporter({ error: (payload) => lines.push(payload) });
  reporter.report(new Error('boom'), { at: 'test' });

  const rendered = JSON.stringify(lines[0]);
  assert.match(rendered, /boom/);
  assert.match(rendered, /stack/);
  assert.match(rendered, /"at":"test"/);
});

test('a thrown non-Error still reports something readable', () => {
  const lines: unknown[] = [];
  const reporter = new LogReporter({ error: (payload) => lines.push(payload) });
  reporter.report('just a string');
  assert.match(JSON.stringify(lines[0]), /just a string/);
});
