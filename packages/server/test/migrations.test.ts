import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { PostgresRepository } from '../src/adapters/postgres.js';
import { loadMigrations, pendingMigrations, runMigrations } from '../src/migrations/runner.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe('migrations', { skip: databaseUrl ? false : 'TEST_DATABASE_URL not set' }, () => {
  // A throwaway database per run, so "fresh" means fresh.
  const dbName = `dh_migrate_test_${Date.now()}`;
  let adminPool: pg.Pool;
  let pool: pg.Pool;
  let url = '';

  before(async () => {
    adminPool = new pg.Pool({ connectionString: databaseUrl });
    await adminPool.query(`CREATE DATABASE ${dbName}`);
    url = databaseUrl!.replace(/\/deepholdings/, `/${dbName}`);
    pool = new pg.Pool({ connectionString: url });
  });

  after(async () => {
    await pool?.end();
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await adminPool.end();
  });

  test('a fresh database has every migration pending', async () => {
    const all = await loadMigrations();
    assert.ok(all.length > 0, 'expected at least one migration file');

    const pending = await pendingMigrations(pool);
    assert.deepEqual(
      pending.map((m) => m.version),
      all.map((m) => m.version),
    );
  });

  test('running migrations applies them and records the versions', async () => {
    const applied = await runMigrations(pool);
    assert.ok(applied.includes('001_init'));

    const { rows } = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
    assert.deepEqual(
      rows.map((row) => row.version),
      applied,
    );

    // The schema is actually there, not just recorded.
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = tables.rows.map((row) => row.table_name);
    for (const expected of ['accounts', 'characters', 'journal', 'pensions', 'world']) {
      assert.ok(names.includes(expected), `expected table ${expected}`);
    }
  });

  test('running again is a no-op', async () => {
    assert.deepEqual(await runMigrations(pool), []);
    assert.deepEqual(await pendingMigrations(pool), []);
  });

  test('init refuses to start against a schema that is behind', async () => {
    await pool.query("DELETE FROM schema_migrations WHERE version = '001_init'");

    const repo = new PostgresRepository(url);
    await assert.rejects(() => repo.init({ autoMigrate: false }), /Database is behind/);
    await repo.close();

    // Put it back so the suite leaves the database consistent.
    await pool.query("INSERT INTO schema_migrations (version) VALUES ('001_init')");
  });
});
