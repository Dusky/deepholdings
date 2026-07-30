/** Domain model. Shared verbatim between server and client. */

export type LootPriority = 'gold' | 'gear' | 'relics' | 'knowledge';

export type SpendPolicy = 'resupply' | 'hoard' | 'insure';

export type UnlockId = 'permits' | 'recruit' | 'inherit' | 'green' | 'stipend';

/** The four knobs a case officer actually controls (spec §4). */
export interface StandingOrders {
  targetDepth: number;
  retreatPct: number;
  lootPriority: LootPriority;
  spendPolicy: SpendPolicy;
}

export interface Character {
  id: string;
  accountId: string;
  /** "GRIMWALD IV, THE UNREMARKABLE" */
  name: string;
  recruitNum: number;
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  /** Where the recruit currently is, not where they were ordered to go. */
  depth: number;
  /** Permit D-{permitTier}; descending past it stalls the run. */
  permitTier: number;
  gold: number;
  supplies: number;
  alive: boolean;
  /** Resolution watermark — everything before this is already journalled. */
  lastResolvedTick: number;
}

export interface JournalEntry {
  id: string;
  characterId: string;
  /** Absolute tick index, so clients can page without timestamps drifting. */
  tick: number;
  at: string;
  text: string;
}

export interface DeathRecord {
  id: string;
  characterName: string;
  depth: number;
  cause: string;
  goldHandled: number;
  pensionAwarded: number;
  at: string;
}

export interface Pension {
  total: number;
  spent: number;
  unlocks: UnlockId[];
}

export interface InventoryItem {
  name: string;
  note: string;
}

export interface MarketLot {
  name: string;
  price: number;
}

export interface WorldState {
  /** Heartbeat index; increments once per world tick. */
  beat: number;
  event: string;
  guildName: string;
  guildObjective: string;
  guildProgress: number;
  guildTarget: number;
  market: MarketLot[];
  /** ISO timestamp of the next scheduled heartbeat. */
  nextBeatAt: string;
}

export interface TavernMessage {
  id: number;
  author: string;
  body: string;
  at: string;
}

export interface Account {
  id: string;
  /** Display handle: "CASE OFFICER 4417". */
  callsign: string;
  createdAt: string;
}
