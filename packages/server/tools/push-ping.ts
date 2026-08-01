/**
 * Sends one real notification to one device, through the configured sender.
 *
 * This exists to separate two questions that are otherwise tangled together
 * and both fail the same way — silently:
 *
 *   1. Are the credentials right and does the wire work?
 *   2. Does the sweep find deaths?
 *
 * Waiting for a recruit to die to test the first one means a fifteen-minute
 * away window and a die roll, and when nothing arrives you have learned
 * nothing about which half is broken. This answers (1) on its own, in about a
 * second.
 *
 *   npm run push:ping -w @deepholdings/server -- <device-token>
 *   npm run push:ping -w @deepholdings/server -- --account <account-id>
 *
 * With `--account` it rings every device registered to that account, which is
 * also how you check that registration actually stored anything.
 */
import { PostgresRepository } from '../src/adapters/postgres.js';
import { loadConfig } from '../src/config.js';
import type { Repository } from '../src/ports.js';
import { makeSender } from '../src/push/sender.js';

const log = {
  info: (message: string) => console.log(message),
  warn: (message: string) => console.warn(message),
};

const args = process.argv.slice(2);
const accountFlag = args.indexOf('--account');
const config = loadConfig();

if (args.length === 0) {
  console.error('usage: push:ping <device-token> | push:ping --account <account-id>');
  process.exit(2);
}

let tokens: string[];
let repo: Repository | null = null;

if (accountFlag !== -1) {
  const accountId = args[accountFlag + 1];
  if (!accountId) {
    console.error('--account needs an account id');
    process.exit(2);
  }
  if (!config.databaseUrl) {
    console.error('--account needs DATABASE_URL: the tokens live in Postgres.');
    process.exit(2);
  }
  repo = new PostgresRepository(config.databaseUrl);
  await repo.init({ autoMigrate: false });
  tokens = await repo.listPushTokens(accountId);
  console.log(`${tokens.length} device(s) registered to ${accountId}`);
  if (tokens.length === 0) {
    console.error(
      'Nothing registered. The app registers on launch when notifications and ' +
        '"Recruit lost" are both on, so this usually means the device never got ' +
        'a token — check that google-services.json is in place and the APK was ' +
        'rebuilt after it was added.',
    );
    await repo.close();
    process.exit(1);
  }
} else {
  tokens = [args[0]];
}

const sender = makeSender(config, log);
if (sender.constructor.name === 'NullSender') {
  console.error(
    '\nRunning without credentials — this would report success and send nothing. ' +
      'Set FCM_SERVICE_ACCOUNT_FILE and try again.',
  );
  await repo?.close();
  process.exit(1);
}

// Deliberately in voice, and deliberately not a fake death: a test push that
// says "TEST" cannot be mistaken for the real thing on a real phone, and the
// point of the exercise is the wire, not the copy.
const result = await sender.send(tokens, {
  title: 'Systems check',
  body: 'Notification delivery confirmed. No recruit was harmed in the sending of this message.',
  screen: 'terminal',
  key: `ping:${Date.now()}`,
});

console.log(`delivered ${result.delivered}/${tokens.length}`);
if (result.stale.length > 0) {
  console.log(`FCM rejected ${result.stale.length} token(s) as dead:`);
  for (const token of result.stale) console.log(`  ${token.slice(0, 24)}…`);
  console.log('The sweep deletes these automatically; this tool leaves them alone.');
}

await repo?.close();
process.exit(result.delivered > 0 ? 0 : 1);
