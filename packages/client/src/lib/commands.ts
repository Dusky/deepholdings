import {
  MAX_DEPTH,
  RETREAT_MAX_PCT,
  RETREAT_MIN_PCT,
  type LootPriority,
  type SpendPolicy,
  type StandingOrders,
} from '@deepholdings/shared';
import type { ScreenId } from '../types';

/**
 * The command line.
 *
 * It is a power-user path that some players should *prefer*, not the penalty
 * path for anyone who did not buy a tab — see `docs/design/requisitions.md`.
 * That means it has to do more than navigate, it has to answer when it does not
 * understand, and it has to remember what you typed. Silently swallowing an
 * unrecognised word, which is what it used to do, is the worst of all of those.
 */

export interface CommandContext {
  navigate(screen: ScreenId): void;
  /** Whether the server exposes developer time travel. Never true in production. */
  devTools: boolean;
  advance(hours: number): Promise<string>;
  clearance: readonly ScreenId[];
  refresh(): Promise<void>;
  orders: StandingOrders | null;
  fileOrders(orders: StandingOrders): Promise<string>;
  /** Sells a whole stack matched by name. Returns the receipt, in voice. */
  sellByName(query: string): Promise<string>;
  retire(): Promise<string>;
}

export interface CommandSpec {
  name: string;
  aliases: readonly string[];
  usage: string;
  summary: string;
  /** Completions for the argument, where the argument is a fixed set. */
  values?: readonly string[];
  run(args: readonly string[], ctx: CommandContext): Promise<string> | string;
}

const SCREEN_LABEL: Record<ScreenId, string> = {
  terminal: 'Terminal',
  orders: 'Standing Orders',
  ledger: 'Ledger',
  bulletin: 'Regional Bulletin',
  tavern: 'Tavern Channel',
  armoury: 'Armoury',
};

function go(name: string, screen: ScreenId, aliases: string[]): CommandSpec {
  return {
    name,
    aliases,
    usage: name,
    summary: `Open the ${SCREEN_LABEL[screen]}.`,
    run(_args, ctx) {
      // Clearance is the server's call. Saying so is better than bouncing the
      // officer back to the Terminal without explanation.
      if (!ctx.clearance.includes(screen)) {
        return `No clearance for the ${SCREEN_LABEL[screen]}. It is not yet on your file.`;
      }
      ctx.navigate(screen);
      return `${SCREEN_LABEL[screen]}.`;
    },
  };
}

const LOOT: readonly LootPriority[] = ['gold', 'gear', 'relics', 'knowledge'];
const SPEND: readonly SpendPolicy[] = ['resupply', 'hoard', 'insure'];

/** Amending one field of Form SO-1 without opening it. */
async function amend(
  ctx: CommandContext,
  patch: Partial<StandingOrders>,
  said: string,
): Promise<string> {
  if (!ctx.orders) return 'Standing orders are not on file yet. Try again in a moment.';
  await ctx.fileOrders({ ...ctx.orders, ...patch });
  return `Form SO-1 amended: ${said}.`;
}

export const COMMANDS: readonly CommandSpec[] = [
  go('terminal', 'terminal', ['status', 'log']),
  go('orders', 'orders', ['so1']),
  go('ledger', 'ledger', ['market', 'cabinet']),
  go('bulletin', 'bulletin', ['news']),
  go('tavern', 'tavern', ['chat']),
  go('armoury', 'armoury', ['armory', 'files', 'drawer']),

  {
    name: 'depth',
    aliases: ['target'],
    usage: `depth <1-${MAX_DEPTH}>`,
    summary: 'Amend Target Depth. An aspiration, not an instruction.',
    run(args, ctx) {
      const value = Number(args[0]);
      if (!Number.isInteger(value) || value < 1 || value > MAX_DEPTH) {
        return `Target Depth must be a whole number from 1 to ${MAX_DEPTH}.`;
      }
      return amend(ctx, { targetDepth: value }, `Target Depth ${value}`);
    },
  },
  {
    name: 'retreat',
    aliases: ['withdraw'],
    usage: `retreat <${RETREAT_MIN_PCT}-${RETREAT_MAX_PCT}>`,
    summary: 'Amend Retreat Threshold, as a percentage of maximum condition.',
    run(args, ctx) {
      const value = Number(String(args[0] ?? '').replace('%', ''));
      if (!Number.isInteger(value) || value < RETREAT_MIN_PCT || value > RETREAT_MAX_PCT) {
        return `Retreat Threshold must be a whole number from ${RETREAT_MIN_PCT} to ${RETREAT_MAX_PCT}.`;
      }
      return amend(ctx, { retreatPct: value }, `Retreat Threshold ${value}%`);
    },
  },
  {
    name: 'loot',
    aliases: ['priority'],
    usage: 'loot <gold|gear|relics|knowledge>',
    summary: 'Amend Loot Priority.',
    values: LOOT,
    run(args, ctx) {
      const value = String(args[0] ?? '').toLowerCase() as LootPriority;
      if (!LOOT.includes(value)) return `Loot Priority must be one of: ${LOOT.join(', ')}.`;
      return amend(ctx, { lootPriority: value }, `Loot Priority ${value}`);
    },
  },
  {
    name: 'spend',
    aliases: ['policy'],
    usage: 'spend <resupply|hoard|insure>',
    summary: 'Amend Spend Policy.',
    values: SPEND,
    run(args, ctx) {
      const value = String(args[0] ?? '').toLowerCase() as SpendPolicy;
      if (!SPEND.includes(value)) return `Spend Policy must be one of: ${SPEND.join(', ')}.`;
      return amend(ctx, { spendPolicy: value }, `Spend Policy ${value}`);
    },
  },

  {
    name: 'sell',
    aliases: [],
    usage: 'sell <part of an item name>',
    summary: 'Sell a whole stack from the filing cabinet.',
    run(args, ctx) {
      const query = args.join(' ').trim();
      if (!query) return 'Name something to sell. Partial names are fine.';
      return ctx.sellByName(query);
    },
  },
  {
    name: 'retire',
    aliases: [],
    usage: 'retire confirm',
    summary: 'File Form R-1. Ends the current career and banks the pension.',
    values: ['confirm'],
    run(args, ctx) {
      // A one-way door does not open on a typo.
      if (String(args[0] ?? '').toLowerCase() !== 'confirm') {
        return 'Form R-1 ends this career and cannot be withdrawn. Type `retire confirm`.';
      }
      return ctx.retire();
    },
  },

  {
    name: 'advance',
    aliases: ['ff'],
    usage: 'advance <hours>',
    summary: 'Development only. Simulate time passing, to see a later shift.',
    run(args, ctx) {
      if (!ctx.devTools) {
        return 'Unrecognised: advance. Type `help`.';
      }
      const hours = Number(args[0]);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 720) {
        return 'Advance by 1 to 720 hours.';
      }
      return ctx.advance(hours);
    },
  },
  {
    name: 'sync',
    aliases: ['refresh'],
    usage: 'sync',
    summary: 'Ask the Authority for a fresh copy of the file.',
    async run(_args, ctx) {
      await ctx.refresh();
      return 'File refreshed.';
    },
  },
  {
    name: 'help',
    aliases: ['?', 'commands'],
    usage: 'help [command]',
    summary: 'What can be typed here.',
    run(args, ctx) {
      const listed = COMMANDS.filter((spec) => ctx.devTools || spec.name !== 'advance');
      const wanted = String(args[0] ?? '').toLowerCase();
      if (wanted) {
        const found = listed.find(
          (spec) => spec.name === wanted || spec.aliases.includes(wanted),
        );
        if (!found) return `No such command: ${wanted}.`;
        const also = found.aliases.length ? `\nAlso: ${found.aliases.join(', ')}` : '';
        return `${found.usage}\n${found.summary}${also}`;
      }
      return listed.map((spec) => `${spec.usage.padEnd(22)} ${spec.summary}`).join('\n');
    },
  },
];

export function findCommand(token: string): CommandSpec | undefined {
  const needle = token.toLowerCase();
  return COMMANDS.find((spec) => spec.name === needle || spec.aliases.includes(needle));
}

export interface Parsed {
  spec: CommandSpec;
  args: string[];
}

export function parseCommand(raw: string): Parsed | null {
  const [token, ...args] = raw.trim().split(/\s+/);
  if (!token) return null;
  const spec = findCommand(token);
  return spec ? { spec, args } : null;
}

/**
 * What could be typed next.
 *
 * Offered as tappable chips rather than only on Tab, because the platform this
 * ships on first does not have a Tab key. Completion that only works on a
 * desktop keyboard would make the command line exactly the second-class path
 * it is not supposed to be.
 */
export function completionsFor(raw: string): string[] {
  const trimmed = raw.trimStart();
  const parts = trimmed.split(/\s+/);
  const typingArgument = parts.length > 1 || /\s$/.test(raw);

  if (!typingArgument) {
    const prefix = (parts[0] ?? '').toLowerCase();
    const names = COMMANDS.map((spec) => spec.name);
    return prefix ? names.filter((name) => name.startsWith(prefix)) : names;
  }

  const spec = findCommand(parts[0] ?? '');
  if (!spec?.values) return [];
  const prefix = (parts[1] ?? '').toLowerCase();
  const values = spec.values.filter((value) => value.startsWith(prefix));
  return values.map((value) => `${spec.name} ${value}`);
}

export const COMMAND_PLACEHOLDER = 'type a command, or `help`';
