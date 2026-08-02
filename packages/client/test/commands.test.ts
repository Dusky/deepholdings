import assert from 'node:assert/strict';
import test from 'node:test';
import type { StandingOrders } from '@deepholdings/shared';
import {
  COMMANDS,
  completionsFor,
  findCommand,
  parseCommand,
  type CommandContext,
} from '../src/lib/commands';

const ORDERS: StandingOrders = {
  targetDepth: 6,
  retreatPct: 28,
  lootPriority: 'gear',
  spendPolicy: 'resupply',
};

function context(overrides: Partial<CommandContext> = {}) {
  const filed: StandingOrders[] = [];
  const visited: string[] = [];
  const ctx: CommandContext = {
    navigate: (screen) => visited.push(screen),
    clearance: ['terminal', 'orders', 'ledger', 'bulletin', 'tavern', 'armoury'],
    devTools: false,
    advance: async (hours) => `advanced ${hours}`,
    refresh: async () => {},
    orders: ORDERS,
    fileOrders: async (orders) => {
      filed.push(orders);
      return 'ok';
    },
    sellByName: async (query) => `sold ${query}`,
    retire: async () => 'retired',
    ...overrides,
  };
  return { ctx, filed, visited };
}

const run = (input: string, ctx: CommandContext) => {
  const parsed = parseCommand(input);
  assert.ok(parsed, `${input} should parse`);
  return parsed.spec.run(parsed.args, ctx);
};

test('an unrecognised command is not silently swallowed', () => {
  // It used to return `{ kind: 'unknown' }` and the bar did nothing with it,
  // which reads as a broken input rather than a wrong word.
  assert.equal(parseCommand('wibble'), null);
  assert.equal(parseCommand('   '), null);
  assert.equal(parseCommand(''), null);
});

test('every command has help, and help lists every command', () => {
  const { ctx } = context();
  for (const spec of COMMANDS) {
    assert.ok(spec.summary.length > 0, `${spec.name} needs a summary`);
    assert.ok(spec.usage.startsWith(spec.name), `${spec.name} usage should start with its name`);
  }
  const help = String(run('help', { ...ctx, devTools: true }));
  for (const spec of COMMANDS) {
    assert.ok(help.includes(spec.name), `help omits ${spec.name}`);
  }
});

test('developer time travel does not exist unless the server offers it', async () => {
  let advanced = 0;
  const { ctx } = context({
    advance: async (hours) => {
      advanced += hours;
      return `advanced ${hours}`;
    },
  });

  // Off: indistinguishable from a word the game has never heard of, and it
  // must not reach the server either.
  assert.match(String(await run('advance 24', ctx)), /Unrecognised/);
  assert.equal(advanced, 0);
  assert.doesNotMatch(String(run('help', ctx)), /advance/);

  const dev = { ...ctx, devTools: true };
  assert.match(String(run('help', dev)), /advance/);
  assert.equal(await run('advance 24', dev), 'advanced 24');
  assert.equal(advanced, 24);
});

test('advance refuses spans it cannot simulate', async () => {
  const { ctx } = context();
  const dev = { ...ctx, devTools: true };
  for (const input of ['advance 0', 'advance -5', 'advance 5000', 'advance soon', 'advance']) {
    assert.match(String(await run(input, dev)), /Advance by 1 to 720 hours/);
  }
  assert.equal(await run('advance 24', dev), 'advanced 24');
});

test('aliases are unique across the whole table', () => {
  const seen = new Set<string>();
  for (const spec of COMMANDS) {
    for (const token of [spec.name, ...spec.aliases]) {
      assert.ok(!seen.has(token), `${token} is claimed twice`);
      seen.add(token);
    }
  }
});

test('navigation reports a screen the officer is not cleared for', () => {
  const { ctx, visited } = context({ clearance: ['terminal'] });
  const denied = String(run('ledger', ctx));
  assert.match(denied, /No clearance/);
  assert.deepEqual(visited, [], 'a refused command must not navigate');

  const allowed = String(run('status', context().ctx));
  assert.match(allowed, /Terminal/);
});

test('every screen is reachable by typing its name', () => {
  // A tab and a command are the two halves of navigation, and a screen that
  // has one but not the other is the kind of gap nothing else would catch.
  for (const screen of ['terminal', 'orders', 'ledger', 'bulletin', 'tavern', 'armoury']) {
    const { ctx, visited } = context();
    run(screen, ctx);
    assert.deepEqual(visited, [screen], `typing ${screen} should open it`);
  }

  // The drawer is spelled both ways on purpose.
  const { ctx, visited } = context();
  run('armory', ctx);
  assert.deepEqual(visited, ['armoury']);
});

test('orders can be amended one field at a time', async () => {
  const { ctx, filed } = context();
  assert.match(String(await run('depth 9', ctx)), /Target Depth 9/);
  assert.deepEqual(filed.at(-1), { ...ORDERS, targetDepth: 9 });

  assert.match(String(await run('retreat 30', ctx)), /30%/);
  assert.deepEqual(filed.at(-1), { ...ORDERS, retreatPct: 30 });

  // A percentage sign is the natural thing to type.
  await run('retreat 25%', ctx);
  assert.deepEqual(filed.at(-1), { ...ORDERS, retreatPct: 25 });

  assert.match(String(await run('loot relics', ctx)), /relics/);
  assert.deepEqual(filed.at(-1), { ...ORDERS, lootPriority: 'relics' });

  assert.match(String(await run('spend hoard', ctx)), /hoard/);
  assert.deepEqual(filed.at(-1), { ...ORDERS, spendPolicy: 'hoard' });
});

test('bad order values are refused without filing anything', async () => {
  const { ctx, filed } = context();
  for (const input of [
    'depth 0', 'depth 13', 'depth two', 'depth 6.5',
    'retreat 5', 'retreat 90', 'retreat nine',
    'loot bullion', 'spend gamble', 'loot', 'depth',
  ]) {
    const message = String(await run(input, ctx));
    assert.ok(message.length > 0, `${input} must say something`);
    assert.doesNotMatch(message, /amended/, `${input} should not have filed`);
  }
  assert.equal(filed.length, 0, 'nothing should have reached the server');
});

test('Form R-1 does not open on a typo', async () => {
  let retired = 0;
  const { ctx } = context({
    retire: async () => {
      retired += 1;
      return 'retired';
    },
  });

  const warned = String(await run('retire', ctx));
  assert.match(warned, /cannot be withdrawn/);
  assert.equal(retired, 0, 'a bare `retire` must not end the career');

  await run('retire confirm', ctx);
  assert.equal(retired, 1);
});

test('completion offers commands, then that command\'s values', () => {
  // Every command, before anything is typed after a space.
  assert.ok(completionsFor('d').includes('depth'));
  assert.deepEqual(completionsFor('retr'), ['retreat']);
  assert.deepEqual(completionsFor('zzz'), []);

  // Once a command is complete, its argument values.
  assert.deepEqual(completionsFor('loot '), [
    'loot gold', 'loot gear', 'loot relics', 'loot knowledge',
  ]);
  assert.deepEqual(completionsFor('loot re'), ['loot relics']);
  assert.deepEqual(completionsFor('spend h'), ['spend hoard']);

  // Free-text arguments have nothing to offer, and must not offer commands.
  assert.deepEqual(completionsFor('sell buck'), []);
});

test('aliases resolve to the same command', () => {
  assert.equal(findCommand('status'), findCommand('terminal'));
  assert.equal(findCommand('market'), findCommand('ledger'));
  assert.equal(findCommand('?'), findCommand('help'));
  assert.equal(findCommand('nonsense'), undefined);
});

test('help on a single command explains it', () => {
  const { ctx } = context();
  const text = String(run('help retreat', ctx));
  assert.match(text, /retreat </);
  assert.match(text, /Also: withdraw/);
  assert.match(String(run('help wibble', ctx)), /No such command/);
});
