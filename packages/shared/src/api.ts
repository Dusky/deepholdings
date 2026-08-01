/**
 * HTTP contract. The client imports these types directly, so a breaking server
 * change fails the client typecheck rather than production.
 *
 * Every read that touches a character resolves it first, server-side: there is
 * no endpoint that returns stale character state.
 */
import type { CaseFile } from './items.js';
import type {
  Account,
  Character,
  LootPriority,
  Office,
  RequisitionId,
  RequisitionTrack,
  ScreenId,
  ShiftDigest,
  DeathRecord,
  InventoryItem,
  JournalEntry,
  MarketQuote,
  Pension,
  StandingOrders,
  TavernMessage,
  UnlockId,
  UnlockTrack,
  WorldState,
} from './domain.js';

export const API_VERSION = 'v1';

export interface ApiError {
  error: {
    code:
      | 'unauthorized'
      | 'not_found'
      | 'invalid_request'
      | 'insufficient_pension'
      | 'insufficient_gold'
      | 'not_authorised'
      | 'already_owned'
      | 'character_dead'
      | 'rate_limited'
      | 'internal';
    message: string;
  };
}

/** POST /v1/auth/device — anonymous device account, upgradeable to a real
 *  sign-in before anything is ever purchased. */
export interface DeviceAuthRequest {
  deviceId: string;
}

export interface DeviceAuthResponse {
  token: string;
  account: Account;
}

/** GET /v1/state — one round trip for a cold client. */
export interface StateResponse {
  account: Account;
  character: Character;
  orders: StandingOrders;
  pension: Pension;
  /**
   * Equipment the office owns. On the state response rather than only the
   * Ledger because several requisitions change screens the Ledger is not.
   */
  office: Office;
  /** Case files the recruit is carrying. Lost when they are. */
  caseFiles: CaseFile[];
  world: WorldState;
  /** Newest journal entries, oldest first. */
  journal: JournalEntry[];
  /** Server time, so the client can render countdowns without trusting its clock. */
  now: string;
  /** Seconds until the next world heartbeat. */
  nextBeatInSeconds: number;
  /** Set when the recruit died and the pension has not been filed for yet. */
  pendingDeath: DeathRecord | null;
  /** Screens this officer has clearance for. The client shows no others. */
  clearance: ScreenId[];
  /** Present when enough happened since the last visit to be worth summarising. */
  digest: ShiftDigest | null;
  /** False until Form SO-1 has been filed at least once. */
  ordersFiled: boolean;
  /**
   * The next rung of the permit ladder, when one is being processed.
   *
   * Serves two jobs: the Terminal can show how far away the next floor is
   * (competitors lose hundred-hour players to "nothing is ahead of me"), and
   * the client can schedule a local notification for the moment it clears —
   * no push infrastructure required for an event whose time is already known.
   */
  pendingPermit: PendingPermit | null;
  /** What Form R-1 would pay right now. Null once the recruit is dead. */
  retirement: RetirementOffer | null;
  /** True when the server will accept `POST /v1/dev/advance`. Never in production. */
  devTools: boolean;
}

/**
 * POST /v1/dev/advance — simulate time passing, for playtesting.
 *
 * Runs the ordinary resolver over the requested span in catch-up-sized chunks,
 * so the result is exactly the state a real absence of that length produces —
 * journal, deaths, permits and all. Development only; the route does not exist
 * otherwise.
 */
export interface AdvanceTimeRequest {
  hours: number;
}

export interface AdvanceTimeResponse {
  ticksAdvanced: number;
  /** Careers lost along the way. Resolution stops at the first one. */
  died: boolean;
  character: Character;
}

/**
 * The standing offer to retire the current recruit.
 *
 * Quoted continuously rather than only when eligible, because the decision the
 * officer is actually making is "is this career worth more alive than banked",
 * and they cannot make it without the number.
 */
export interface RetirementOffer {
  eligible: boolean;
  /** Minutes the recruit has served. */
  serviceTicks: number;
  minServiceTicks: number;
  /** Pension this separation would award, at the current estate and depth. */
  award: number;
}

export interface PendingPermit {
  tier: number;
  /** Depth this permit will authorise. */
  authorisesDepth: number;
  readyAt: string;
  secondsRemaining: number;
}

/** POST /v1/pension/claim — banks the award and assigns the next recruit. */
export interface ClaimPensionResponse {
  character: Character;
  pension: Pension;
  orders: StandingOrders;
}

/**
 * GET /v1/journal?before=<entry id>&limit=N — pages *backwards*.
 *
 * Nothing in the journal is ever deleted, so this is always available and
 * always reaches the start of the current recruit's file. Extended Journal
 * Retention buys how many lines the Terminal opens with, not how far back an
 * officer is permitted to read — a requisition may add a faster path to a
 * function and may never be the only path to one.
 */
export interface JournalResponse {
  /** Older entries, oldest first, ready to prepend to what is on screen. */
  entries: JournalEntry[];
  /** Whether anything remains before the first entry returned. */
  hasMore: boolean;
}

/** PUT /v1/orders */
export interface UpdateOrdersRequest {
  orders: StandingOrders;
}

export interface UpdateOrdersResponse {
  orders: StandingOrders;
  filedAt: string;
}

/**
 * A cabinet stack with the depot's current offer attached.
 *
 * The offer is quoted server-side rather than multiplied out on the client:
 * demand, hoarding and rounding all live in one place, so the number shown is
 * exactly the number a sale pays.
 */
export interface LedgerStack extends InventoryItem {
  /** Gold for one unit at today's demand, including any policy bonus. */
  unitOffer: number;
  /** Gold for the whole stack. */
  stackOffer: number;
}

/** GET /v1/ledger */
export interface LedgerResponse {
  inventory: LedgerStack[];
  market: MarketQuote[];
  pension: Pension;
  unlocks: UnlockOffer[];
  /** The purse the requisition offers are priced against. */
  gold: number;
  office: Office;
  requisitions: RequisitionOffer[];
}

/**
 * The next rung of one ladder.
 *
 * The server publishes one offer per track rather than the whole catalogue —
 * see `ladderOffers()` — so `owned` means "this track is maxed", not "this
 * exact tier is bought".
 */
export interface LadderOffer<Id extends string, Track extends string> {
  id: Id;
  track: Track;
  /** The tier this offer buys, or the top tier when the track is complete. */
  tier: number;
  maxTier: number;
  label: string;
  detail: string;
  cost: number;
  /** True only when every tier of the track is bought. */
  owned: boolean;
  affordable: boolean;
}

/** Priced in pension. */
export type UnlockOffer = LadderOffer<UnlockId, UnlockTrack>;

/** Priced in gold. */
export type RequisitionOffer = LadderOffer<RequisitionId, RequisitionTrack>;

/** POST /v1/ledger/sell */
export interface SellItemRequest {
  name: string;
  /** Omit to sell the whole stack. */
  quantity?: number;
}

export interface SellItemResponse {
  sold: number;
  goldReceived: number;
  gold: number;
  inventory: LedgerStack[];
}

/**
 * POST /v1/ledger/sell-bulk — one form, many stacks.
 *
 * Requires Bulk Filing Authorisation: tier I sells a whole category, tier II
 * also clears everything under a unit value. Exactly one selector must be
 * given, so "sell it all" is never something the client can ask for by
 * omission.
 */
export interface BulkSellRequest {
  category?: LootPriority;
  /** Sell stacks whose *unit* book value is at or below this. */
  maxUnitValue?: number;
}

export interface BulkSellResponse {
  /** Stacks cleared. */
  stacks: number;
  /** Units across those stacks. */
  sold: number;
  goldReceived: number;
  gold: number;
  inventory: LedgerStack[];
}

/** POST /v1/pension/unlocks */
export interface PurchaseUnlockRequest {
  id: UnlockId;
}

export interface PurchaseUnlockResponse {
  pension: Pension;
  unlocks: UnlockOffer[];
}

/** POST /v1/office/requisitions — priced in gold, taken from the recruit's purse. */
export interface PurchaseRequisitionRequest {
  id: RequisitionId;
}

export interface PurchaseRequisitionResponse {
  office: Office;
  requisitions: RequisitionOffer[];
  /** What the recruit has left. */
  gold: number;
}

/** GET /v1/bulletin */
export interface BulletinResponse {
  world: WorldState;
  deaths: DeathRecord[];
}

/** GET /v1/tavern?sinceId=N */
export interface TavernResponse {
  messages: TavernMessage[];
  present: number;
}

/** POST /v1/tavern */
export interface SendTavernMessageRequest {
  body: string;
}

export interface SendTavernMessageResponse {
  message: TavernMessage;
}
