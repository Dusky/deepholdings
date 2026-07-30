import type { ScreenId } from '../types';

export type Command = { kind: 'navigate'; screen: ScreenId } | { kind: 'die' } | { kind: 'unknown' };

const ALIASES: Record<string, ScreenId> = {
  status: 'terminal',
  terminal: 'terminal',
  log: 'terminal',
  tavern: 'tavern',
  chat: 'tavern',
  orders: 'orders',
  market: 'ledger',
  ledger: 'ledger',
  bulletin: 'bulletin',
  news: 'bulletin',
};

export function parseCommand(raw: string): Command {
  const token = raw.trim().toLowerCase();
  // Demo-only: production death is a server event, never a client command.
  if (token === 'die') return { kind: 'die' };
  const screen = ALIASES[token];
  return screen ? { kind: 'navigate', screen } : { kind: 'unknown' };
}

export const COMMAND_PLACEHOLDER =
  'type a command: status, orders, market, tavern, bulletin, die (demo)';
