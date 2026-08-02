import type {
  Account,
  CaseFile,
  Character,
  Filing,
  DeathRecord,
  InventoryItem,
  JournalEntry,
  Office,
  Pension,
  StandingOrders,
  TavernMessage,
  WorldState,
} from '@deepholdings/shared';

/** Character row plus the fields the client never sees. */
export interface CharacterRecord {
  character: Character;
  permitAppliedTick: number | null;
  inventory: InventoryItem[];
  /** Case files the recruit is carrying. Lost with them, by design. */
  caseFiles: CaseFile[];
  /** Forms filed and still processing. Lost with the recruit for the same
   *  reason: a form is about a case file, and the file went down with them. */
  filings: Filing[];
}

export interface NewJournalEntry {
  characterId: string;
  tick: number;
  at: Date;
  text: string;
}

/**
 * Storage port. Two adapters implement it: Postgres for real deployments and an
 * in-memory one for tests and local work without a database.
 *
 * `transaction` exists because resolution must be atomic — two clients hitting
 * /v1/state at once must not both replay the same ticks.
 */
export interface Repository {
  init(options?: { autoMigrate?: boolean }): Promise<void>;
  close(): Promise<void>;

  transaction<T>(fn: (repo: Repository) => Promise<T>): Promise<T>;

  findAccountByDevice(deviceId: string): Promise<Account | null>;
  createAccount(deviceId: string, callsign: string): Promise<Account>;
  getAccount(accountId: string): Promise<Account | null>;

  /**
   * Loads the account's living character, taking a row lock so a concurrent
   * request waits rather than double-resolving.
   */
  getActiveCharacterForUpdate(accountId: string): Promise<CharacterRecord | null>;
  /**
   * The account's most recent recruit, alive or not.
   *
   * The successor path needs the deceased one's grade and permit, and by then
   * they are no longer the *active* character — which is how a successor came
   * to be issued at Grade I with Permit D-1 for as long as the game has
   * existed, wiping the case file the design promises is kept.
   */
  getLatestCharacter(accountId: string): Promise<CharacterRecord | null>;
  insertCharacter(record: CharacterRecord): Promise<void>;
  saveCharacter(record: CharacterRecord): Promise<void>;

  getOrders(accountId: string): Promise<StandingOrders>;
  /** `markFiled` records that the player filed these deliberately. */
  saveOrders(
    accountId: string,
    orders: StandingOrders,
    options?: { markFiled?: boolean },
  ): Promise<void>;
  /** False while the account is still running on the defaults it was given. */
  hasFiledOrders(accountId: string): Promise<boolean>;

  appendJournal(entries: NewJournalEntry[]): Promise<void>;
  listJournal(characterId: string, sinceTick: number, limit: number): Promise<JournalEntry[]>;
  /**
   * The `limit` entries immediately *before* `beforeId`, oldest first.
   *
   * Ordered by id rather than tick for the same reason `listJournal` is: several
   * lines share a tick, and a catch-up can write a line whose tick is older than
   * one already on file.
   */
  listJournalBefore(
    characterId: string,
    beforeId: string,
    limit: number,
  ): Promise<JournalEntry[]>;

  getPension(accountId: string): Promise<Pension>;
  savePension(accountId: string, pension: Pension): Promise<void>;

  getOffice(accountId: string): Promise<Office>;
  saveOffice(accountId: string, office: Office): Promise<void>;

  recordDeath(accountId: string, record: DeathRecord): Promise<void>;
  /** Public feed, all accounts. */
  listDeaths(limit: number): Promise<DeathRecord[]>;
  /** This account's most recent death — never another player's. */
  getLatestDeath(accountId: string): Promise<DeathRecord | null>;

  getWorld(): Promise<WorldState>;
  saveWorld(world: WorldState): Promise<void>;

  listTavern(sinceId: number, limit: number): Promise<TavernMessage[]>;
  appendTavern(accountId: string, author: string, body: string): Promise<TavernMessage>;
  countActiveOfficers(withinSeconds: number): Promise<number>;
  touchAccountSeen(accountId: string): Promise<void>;

  /** Upserts: FCM reissues tokens, and a reinstall must not add a second row. */
  savePushToken(accountId: string, token: string, platform: string): Promise<void>;
  deletePushTokens(tokens: readonly string[]): Promise<void>;
  listPushTokens(accountId: string): Promise<string[]>;

  /**
   * Accounts the sweep should resolve: they hold at least one push token and
   * have not been read for `awaySeconds`.
   *
   * `limit` is not politeness, it is the bound. A sweep that resolves every
   * away account on every heartbeat is a background job whose cost grows with
   * total signups rather than with players, which is the thing lazy resolution
   * exists to avoid. Oldest-seen first, so nobody starves.
   */
  listSweepCandidates(awaySeconds: number, limit: number): Promise<string[]>;

  /**
   * Records a push, and answers whether it was already recorded.
   *
   * Returns false if this account has already been sent this event, or has
   * spent its daily allowance. The check and the write are one operation on
   * purpose — two heartbeat workers racing on the same death must produce one
   * notification, and that is a property of the primary key, not of the
   * caller's care.
   */
  claimPushSend(accountId: string, eventKey: string, dailyCap: number): Promise<boolean>;

  /**
   * Backdates `last_seen_at`. Dev tooling and tests only — nothing in the game
   * moves an account backwards in time.
   *
   * It is on the port rather than reached for through a cast because the tests
   * need it on both adapters, and a helper that pokes at private fields is a
   * helper that breaks the first time an adapter is refactored.
   */
  markAwayForTesting(accountId: string, seconds: number): Promise<void>;
}
