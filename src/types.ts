export type ScreenId = 'terminal' | 'tavern' | 'orders' | 'ledger' | 'bulletin';

export type LootPriority = 'gold' | 'gear' | 'relics' | 'knowledge';

export type SpendPolicy = 'resupply' | 'hoard' | 'insure';

export type UnlockId = 'permits' | 'recruit' | 'inherit' | 'green' | 'stipend';

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

/** Maps to the spec's `standing_orders` table (§4's four knobs). */
export interface StandingOrders {
  targetDepth: number;
  retreatPct: number;
  lootPriority: LootPriority;
  spendPolicy: SpendPolicy;
}

export interface DeathInfo {
  name: string;
  cause: string;
  floor: number;
  gold: number;
  pensionAwarded: number;
}
