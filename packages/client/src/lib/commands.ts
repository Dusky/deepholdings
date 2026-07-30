import type { ScreenId } from '../types';

export type Command =
  | { kind: 'navigate'; screen: ScreenId }
  | { kind: 'refresh' }
  | { kind: 'unknown' };

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
  // Death is a server event now, so the old `die` demo trigger is gone.
  if (token === 'sync' || token === 'refresh') return { kind: 'refresh' };
  const screen = ALIASES[token];
  return screen ? { kind: 'navigate', screen } : { kind: 'unknown' };
}

export const COMMAND_PLACEHOLDER =
  'type a command: status, orders, market, tavern, bulletin, sync';
