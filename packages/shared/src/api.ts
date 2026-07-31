/**
 * HTTP contract. The client imports these types directly, so a breaking server
 * change fails the client typecheck rather than production.
 *
 * Every read that touches a character resolves it first, server-side: there is
 * no endpoint that returns stale character state.
 */
import type {
  Account,
  Character,
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

/** GET /v1/journal?sinceTick=N */
export interface JournalResponse {
  entries: JournalEntry[];
  lastResolvedTick: number;
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
}

/**
 * The next rung of one prestige track.
 *
 * The server publishes one offer per track rather than the whole catalogue —
 * see `offers()` — so `owned` means "this track is maxed", not "this exact
 * tier is bought".
 */
export interface UnlockOffer {
  id: UnlockId;
  track: UnlockTrack;
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

/** POST /v1/pension/unlocks */
export interface PurchaseUnlockRequest {
  id: UnlockId;
}

export interface PurchaseUnlockResponse {
  pension: Pension;
  unlocks: UnlockOffer[];
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
