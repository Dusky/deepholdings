import { MemoryRepository } from '../src/adapters/memory.js';
import { PostgresRepository } from '../src/adapters/postgres.js';
import type { Repository } from '../src/ports.js';

/**
 * The same suites run against both adapters — that is the point of the port.
 *
 * Postgres joins in only when `TEST_DATABASE_URL` is set, because a laptop
 * without a database should still be able to run most of the suite. **Except
 * on CI**, where a silent skip is the failure mode this whole file exists to
 * prevent: `npm test` without the variable reports 68 passing tests and says
 * nothing about the 47 it did not run, so a green build would mean "the memory
 * adapter is fine" while claiming to mean rather more than that. On CI the
 * variable is mandatory and its absence is an error.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error(
    'TEST_DATABASE_URL is required on CI: without it the Postgres adapter is ' +
      'skipped silently and a green run proves half of what it appears to.',
  );
}

export const adapters: { name: string; make: () => Repository }[] = [
  { name: 'memory', make: () => new MemoryRepository() },
  ...(databaseUrl
    ? [{ name: 'postgres', make: () => new PostgresRepository(databaseUrl) as Repository }]
    : []),
];

/** For suites that are Postgres-only, such as the migration runner's. */
export const postgresUrl = databaseUrl;
