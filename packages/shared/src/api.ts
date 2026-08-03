/**
 * HTTP contract. The client imports these types directly, so a breaking server
 * change fails the client typecheck rather than production.
 *
 * Every read that touches a character resolves it first, server-side: there is
 * no endpoint that returns stale character state.
 */
import type { CaseFile } from './items.js';
import type { FormId } from './forms.js';
import type { Registry, StaffRole } from './staff.js';
import type { CommendationId, CommendationTrack, Transfer } from './transfer.js';
import type { AssignmentId, AssignmentMetric } from './assignments.js';
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
      | 'insufficient_standing'
      | 'not_authorised'
      | 'already_owned'
      | 'character_dead'
      | 'rate_limited'
      | 'duplicate_request'
      | 'internal';
    message: string;
  };
}

/** POST /v1/auth/device — anonymous device account, upgradeable to a real
 *  sign-in before anything is ever purchased. */
export interface DeviceAuthRequest {
  deviceId: string;
}

/** A filed form, as the client needs it. */
export interface PendingFiling {
  id: string;
  form: FormId;
  caseFileId: string;
  clauseIndex: number;
  /** Form 19: the clause on its way in, so the drawer can say what is coming. */
  bringsClauseId?: string;
  /** Honest, like the permit ETA: derived from the resolution tick, not faked. */
  secondsRemaining: number;
}

/** POST /v1/registry/hire */
export interface HireStaffRequest {
  role: StaffRole;
}

/** PUT /v1/registry/policy */
export interface StaffPolicyRequest {
  role: StaffRole;
  policy: number;
}

export interface RegistryResponse {
  registry: Registry;
  /** The purse after the charge, so the client need not refetch to show it. */
  gold: number;
}

/** POST /v1/armoury/file */
export interface FileFormRequest {
  form: FormId;
  /** The file that survives. For 12-C, the only file involved. */
  caseFileId: string;
  /** The slot on that file: contested by 12-C, overwritten by 19. */
  clauseIndex: number;
  /** Form 19: the file consumed to supply the clause. */
  donorCaseFileId?: string;
  /** Form 19: which of the donor's clauses crosses over. */
  donorClauseIndex?: number;
}

export interface FileFormResponse {
  filing: PendingFiling;
  goldCharged: number;
  standingCharged: number;
  character: Character;
}

export interface DeviceAuthResponse {
  token: string;
  account: Account;
}

/** GET /v1/state — one round trip for a cold client. */
/**
 * The answer to "what am I doing, and what should I do now?"
 *
 * Neither question was answered anywhere in the product before this existed.
 * Computed server-side in `domain/guidance.ts`; see there for the ordering
 * argument and for why `action` is allowed to be null.
 */
export interface Guidance {
  /** The nearest concrete thing arriving. Never empty. */
  aim: string;
  /**
   * Which tutorial step this is, when one is running.
   *
   * Present only while the first three steps are outstanding. The client shows
   * it as "1 of 3" so the player can see the end of the tutorial from the
   * start — an unnumbered prompt that keeps reappearing reads as nagging.
   */
  step: { index: number; total: number } | null;
  /**
   * The one most useful thing to do now, or null when nothing needs the player.
   *
   * Null is a supported, common and deliberate answer: absence is never
   * punished here, so a line that invented a chore to avoid being empty would
   * be a daily obligation wearing a hint's clothes.
   */
  action: { text: string; screen: ScreenId } | null;
}

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
  /**
   * The department, and what it is costing.
   *
   * On the state response rather than only the Ledger because the payroll flag
   * changes what the officer is looking at everywhere: staff who have downed
   * tools are the explanation for a cabinet that stopped emptying itself, and
   * finding that out requires visiting the screen that is no longer working.
   */
  registry: Registry;
  /**
   * Forms filed and still processing, with the wait already computed.
   *
   * Sent whole rather than as a count: the ARMOURY has to mark which clause of
   * which file is before the panel, because a player who files a form and sees
   * no trace of it will file it again.
   */
  filings: PendingFiling[];
  world: WorldState;
  /** Newest journal entries, oldest first. */
  journal: JournalEntry[];
  /** Server time, so the client can render countdowns without trusting its clock. */
  now: string;
  /** Seconds until the next world heartbeat. */
  nextBeatInSeconds: number;
  /** Set when the recruit died and the pension has not been filed for yet. */
  pendingDeath: DeathRecord | null;
  /**
   * The last recruit to die on this account, if any.
   *
   * The journal is scoped to a character, which is right — it is their case
   * file. But it means that the moment a recruit dies the Terminal empties, and
   * a player returning after a week finds two lines and no trace of the week.
   * That breaks the promise that absence is never punished at exactly the point
   * where the most interesting thing happened.
   *
   * This is the officer's continuity rather than the recruit's: one line saying
   * who went before, how deep they got and what they paid. The file starts
   * fresh; the career does not.
   */
  predecessor: DeathRecord | null;
  /** Screens this officer has clearance for. The client shows no others. */
  clearance: ScreenId[];
  /**
   * What the officer is working toward, and the one thing worth doing now.
   *
   * Derived on the server beside clearance, because answering it needs the
   * permit clock, the pension, the payroll and the catalogues at once — and
   * because a client that worked it out itself would be a second opinion about
   * the game's state, which is what product goal #6 exists to prevent.
   *
   * `action` is null when nothing needs the player, and that is a real answer
   * rather than a gap to fill.
   */
  guidance: Guidance;
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
  /**
   * Commendations held, and what a transfer would pay right now.
   *
   * On the state response for the same reason `retirement` is: the decision an
   * officer is making is "is this posting worth more continued than banked",
   * and they cannot make it without the number in front of them.
   */
  transfer: Transfer;
  transferAward: number;
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
  /**
   * Gold to file Form 4-E against this application, and whether it is still
   * available. Quoted continuously so the officer can decide without a round
   * trip that might tell them they were too late.
   */
  expediteCost: number;
  expedited: boolean;
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

/** POST /v1/career/transfer, POST /v1/transfer/commendations */
export interface TransferResponse {
  transfer: Transfer;
  /** Commendations this call banked. Zero when it was a purchase. */
  awarded: number;
  /** The recruit now on the books, or null when nobody is. */
  character: Character | null;
  commendations: CommendationOffer[];
}

export type CommendationOffer = LadderOffer<CommendationId, CommendationTrack>;

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
  /**
   * The commendation ladder, beside the pension one it outlives.
   *
   * On the Ledger rather than a screen of its own: it is a third column of the
   * same shape as the two already there, and a seventh tab for one ladder would
   * cost the tab row more than the ladder is worth. `npm run viewports` is what
   * decides that, not this comment — see the check in the client package.
   */
  commendations: CommendationOffer[];
  transfer: Transfer;
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
/** One row of the assignment board. */
export interface AssignmentOffer {
  id: AssignmentId;
  name: string;
  brief: string;
  reward: number;
  target: number;
  metric: AssignmentMetric;
  completed: boolean;
  active: boolean;
  progress: number;
}

export interface BulletinResponse {
  world: WorldState;
  deaths: DeathRecord[];
  /**
   * Special Assignments, on the Bulletin because the Authority is the one
   * offering them — and because it gives that screen a second reason to be
   * open, which it did not have.
   */
  assignments: AssignmentOffer[];
  /**
   * What this office has put in, and been paid.
   *
   * On the Bulletin because a shared bar with no personal number on it is a
   * bar you cannot tell whether you are affecting — which is the defect this
   * whole thing was fixed for, one level up.
   */
  guild: { contribution: number; paid: number };
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
