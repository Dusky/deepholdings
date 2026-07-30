/**
 * Anything that crosses the wire comes from the shared contract, so the client
 * cannot drift from the server's idea of a loot priority or an unlock id.
 * UI-only shapes stay here.
 */
import type {
  LootPriority,
  SpendPolicy,
  StandingOrders,
  UnlockId,
} from '@deepholdings/shared';

export type { LootPriority, SpendPolicy, StandingOrders, UnlockId };

/** Which screen the shell is showing; never leaves the client. */
export type ScreenId = 'terminal' | 'tavern' | 'orders' | 'ledger' | 'bulletin';

export interface LogEntry {
  time: string;
  text: string;
}

export interface TavernMessage {
  id: number;
  author: string;
  body: string;
}

export interface InventoryItem {
  name: string;
  note: string;
}

export interface MarketLot {
  name: string;
  price: number;
}

export interface Guild {
  name: string;
  objective: string;
}

/** Maps to the spec's `pensions.unlocks` JSONB payload. */
export interface Unlock {
  id: UnlockId;
  label: string;
  cost: number;
  owned: boolean;
}

export interface DeathInfo {
  name: string;
  cause: string;
  floor: number;
  gold: number;
  pensionAwarded: number;
}
