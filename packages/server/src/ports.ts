import type {
  Account,
  Character,
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
}
