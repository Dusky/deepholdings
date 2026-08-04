/** Domain model. Shared verbatim between server and client. */
import type { SiteId } from './sites.js';

export type LootPriority = 'gold' | 'gear' | 'relics' | 'knowledge';

export type SpendPolicy = 'resupply' | 'hoard' | 'insure';

/**
 * What the quartermaster optimises for when the drawer is full.
 *
 * ## The hole this fills
 *
 * `file()` keeps three case files and silently discards the weakest by a fixed
 * formula — `vigour + survival×200 + lootValue×120` — that the officer could
 * neither see nor change. So an officer who wanted a survival build could not
 * keep one: the quartermaster would bin it for something scoring higher on a
 * metric nobody had told them about.
 *
 * That was survivable while case files were only found. It stops being
 * survivable the moment they can be *invested in*: Union Standing is scarce
 * (measured median 2 held against a form costing 3), and spending it on a file
 * the game may bin without asking is not a system anyone will use twice. Hence
 * this lands before the rest of the crafting forms rather than after them.
 *
 * `officer` disables the quartermaster's substitution entirely — nothing is ever
 * swapped out, and a full drawer simply refuses new arrivals. For the player who
 * wants to run every slot by hand.
 */
export type EquipmentPolicy = 'vigour' | 'survival' | 'lootValue' | 'balanced' | 'officer';

/**
 * The officer's policy, defaulting to the behaviour that already shipped.
 *
 * Orders stored before this field existed have no value for it, and `balanced`
 * is the formula `file()` used all along — so an existing officer's drawer
 * behaves identically until they choose otherwise. One accessor rather than
 * `?? 'balanced'` scattered about, because a default that disagrees with itself
 * in one call site is the kind of bug this codebase has had before.
 */
export function equipmentPolicyOf(orders: {
  equipmentPolicy?: EquipmentPolicy;
}): EquipmentPolicy {
  return orders.equipmentPolicy ?? 'balanced';
}

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

/**
 * Office equipment, bought with gold rather than pension.
 *
 * The distinction that makes this worth having as a separate currency sink:
 * gold dies with the recruit, equipment does not. A desk is not buried with
 * the officer who requisitioned it. That is the only way to move value across
 * that line by choice, and it is what gives Form R-1 something to weigh
 * against — bank the pension now, or keep this career running because you are
 * four hundred short of the filing trolley.
 *
 * The rule every entry is held to: **a requisition may add a faster path to a
 * function. It may never be the only path to one.** See
 * `docs/design/requisitions.md`.
 */
export type RequisitionTrack = 'bulk' | 'index' | 'journal' | 'readouts';

/** `track` + tier, e.g. `bulk2`. Stored on the office, never recomputed. */
export type RequisitionId = `${RequisitionTrack}${1 | 2 | 3}`;

/** The account's permanent equipment. Outlives every recruit. */
export interface Office {
  requisitions: RequisitionId[];
  /** Gold spent on equipment, ever. Shown as a total, never re-credited. */
  spent: number;
}

/** The screens of the terminal. Which ones a player has is server-decided. */
export type ScreenId = 'terminal' | 'tavern' | 'orders' | 'ledger' | 'bulletin' | 'armoury';

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
  /**
   * Where the recruit works.
   *
   * A fifth field on the form the officer already files rather than a screen of
   * its own — choosing a site is the same *kind* of decision as choosing a
   * depth, and putting it anywhere else would imply it is a bigger one.
   *
   * Optional on the way in: orders were stored before sites existed, and a row
   * saved then has no column for it. Every read goes through `siteOf`, which
   * treats a missing site as the home one. Migration 012 backfills.
   */
  site?: SiteId;
  targetDepth: number;
  retreatPct: number;
  lootPriority: LootPriority;
  spendPolicy: SpendPolicy;
  /**
   * Which case file the quartermaster keeps when the drawer is full.
   *
   * Optional on the way in for the same reason `site` is: orders were stored
   * before this existed, and `equipmentPolicyOf` treats a missing value as
   * `balanced` — the metric the hidden formula already used, so an officer who
   * never touches this control sees no change in behaviour.
   */
  equipmentPolicy?: EquipmentPolicy;
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
  /**
   * Union Standing. Earned at a grade review, spent filing forms.
   *
   * The log copy has been awarding this since the prototype — *"Union Standing
   * +1 for prompt filing"* — against no number at all. This is the number.
   * Per-recruit, like the case files the forms operate on: a successor
   * inherits the office, not the reputation.
   */
  standing: number;
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
  /**
   * What sort of line this is, so the client can colour it. Derived server-side
   * from the text — see `journalKind` — rather than stored, so it applies to
   * journals written before this field existed.
   *
   * Optional because a client older than this field must still render: it
   * falls back to the body colour, which is exactly what every line used to be.
   */
  kind?: JournalKind;
}

export type JournalKind =
  | 'death'
  /** Not a death — a recruit who is about to be one. Starvation, bad injury. */
  | 'alert'
  | 'authority'
  | 'loot'
  | 'combat'
  | 'progress'
  | 'routine';

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
  /**
   * Which objective is in force. Increments when one completes.
   *
   * The payout is claimed lazily, so this is the watermark a contributor's own
   * row is compared against — the same shape as `lastResolvedTick`, and for the
   * same reason: nothing in this game runs per-player on a schedule.
   */
  guildCycle: number;
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
