/** Domain model. Shared verbatim between server and client. */

export type LootPriority = 'gold' | 'gear' | 'relics' | 'knowledge';

export type SpendPolicy = 'resupply' | 'hoard' | 'insure';

/**
 * Prestige tracks. Each is a ladder of tiers bought in order, so there is
 * always a next thing to work toward — a flat list of five is a demo, not a
 * progression.
 */
export type UnlockTrack =
  | 'permits'
  | 'recruit'
  | 'estate'
  | 'stipend'
  | 'cabinet'
  | 'service'
  | 'phosphor';

/** `track` + tier, e.g. `permits2`. Stored on the pension, never recomputed. */
export type UnlockId = `${UnlockTrack}${1 | 2 | 3}`;

/** The screens of the terminal. Which ones a player has is server-decided. */
export type ScreenId = 'terminal' | 'tavern' | 'orders' | 'ledger' | 'bulletin';

/**
 * What happened while the player was away. Counted by the resolver as it runs,
 * so it describes the ticks actually simulated rather than being re-derived
 * from the journal afterwards.
 */
export interface ShiftDigest {
  /** Real minutes covered. */
  minutes: number;
  goldDelta: number;
  levelsGained: number;
  deepestFloor: number;
  encounters: number;
  acquisitions: number;
  permitsApproved: number;
  died: boolean;
}

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
  /** Tick the recruit entered service. Pensions accrue from here. */
  bornTick: number;
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
  /** Right-aligned annotation on the Ledger: "x3", "disputed". */
  note: string;
  quantity: number;
  /** Book value of one unit at depot rates, before demand. */
  unitValue: number;
  /** Which market quote prices this stack. */
  category: LootPriority;
}

/**
 * A category's standing demand, published by the world heartbeat.
 *
 * The market does not list individual goods — every officer's cabinet holds
 * different things, and quoting absolute prices for four fixed items next to a
 * real appraisal only ever read as a contradiction. It quotes the multiplier
 * applied to the book value instead, which is the number a decision to sell
 * now or hold actually turns on.
 */
export interface MarketQuote {
  category: LootPriority;
  label: string;
  /** Multiplier on book value. 1 is par. */
  demand: number;
}

export interface WorldState {
  /** Heartbeat index; increments once per world tick. */
  beat: number;
  event: string;
  guildName: string;
  guildObjective: string;
  guildProgress: number;
  guildTarget: number;
  market: MarketQuote[];
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
