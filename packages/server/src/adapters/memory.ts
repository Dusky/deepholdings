import { randomUUID } from 'node:crypto';
import type {
  Account,
  DeathRecord,
  JournalEntry,
  Office,
  Pension,
  Registry,
  StandingOrders,
  TavernMessage,
  AssignmentState,
  Transfer,
  WorldState,
} from '@deepholdings/shared';
import {
  DEFAULT_ORDERS,
  EMPTY_ASSIGNMENTS,
  EMPTY_TRANSFER,
  objectiveForCycle,
} from '@deepholdings/shared';
import { initialWorld } from '../domain/world.js';
import type { CharacterRecord, GuildStanding, NewJournalEntry, Repository } from '../ports.js';



/**
 * In-memory adapter for tests and offline work. Single-process only: the
 * "transaction" is a promise chain that serialises writers, which is enough to
 * hold the same invariant Postgres gives us with SELECT ... FOR UPDATE.
 */
export class MemoryRepository implements Repository {
  private accounts = new Map<string, Account & { deviceId: string; lastSeenAt: Date }>();
  private registries = new Map<string, Registry>();
  private characters = new Map<string, CharacterRecord & { diedAt: Date | null }>();
  private orders = new Map<string, StandingOrders>();
  private filedOrders = new Set<string>();
  private journal: JournalEntry[] = [];
  private pensions = new Map<string, Pension>();
  private offices = new Map<string, Office>();
  private deaths: (DeathRecord & { accountId: string })[] = [];
  private tavern: TavernMessage[] = [];
  private world: WorldState = initialWorld(new Date());
  private pushTokens = new Map<string, { accountId: string; platform: string }>();
  /** account -> event key -> when it was sent. */
  private pushSends = new Map<string, Map<string, number>>();
  private journalSeq = 0;
  private tavernSeq = 0;
  private queue: Promise<unknown> = Promise.resolve();

  // No schema to migrate; the option exists to satisfy the port.
  async init(_options?: { autoMigrate?: boolean }): Promise<void> {}
  async close(): Promise<void> {}

  transaction<T>(fn: (repo: Repository) => Promise<T>): Promise<T> {
    const run = this.queue.then(() => fn(this));
    // Keep the chain alive even if this transaction rejects.
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async findAccountByDevice(deviceId: string): Promise<Account | null> {
    for (const account of this.accounts.values()) {
      if (account.deviceId === deviceId) return toAccount(account);
    }
    return null;
  }

  async createAccount(deviceId: string, callsign: string): Promise<Account> {
    const account = {
      id: randomUUID(),
      callsign,
      createdAt: new Date().toISOString(),
      deviceId,
      lastSeenAt: new Date(),
    };
    this.accounts.set(account.id, account);
    return toAccount(account);
  }

  async getAccount(accountId: string): Promise<Account | null> {
    const found = this.accounts.get(accountId);
    return found ? toAccount(found) : null;
  }

  async getActiveCharacterForUpdate(accountId: string): Promise<CharacterRecord | null> {
    for (const record of this.characters.values()) {
      if (record.character.accountId === accountId && record.character.alive) {
        return clone(record);
      }
    }
    return null;
  }

  async getLatestCharacter(accountId: string): Promise<CharacterRecord | null> {
    let latest: (CharacterRecord & { diedAt: Date | null }) | null = null;
    for (const record of this.characters.values()) {
      if (record.character.accountId !== accountId) continue;
      if (!latest || record.character.recruitNum > latest.character.recruitNum) latest = record;
    }
    return latest ? clone(latest) : null;
  }

  async insertCharacter(record: CharacterRecord): Promise<void> {
    this.characters.set(record.character.id, { ...clone(record), diedAt: null });
  }

  async saveCharacter(record: CharacterRecord): Promise<void> {
    const existing = this.characters.get(record.character.id);
    this.characters.set(record.character.id, {
      ...clone(record),
      diedAt: record.character.alive ? (existing?.diedAt ?? null) : (existing?.diedAt ?? new Date()),
    });
  }

  async getOrders(accountId: string): Promise<StandingOrders> {
    return this.orders.get(accountId) ?? { ...DEFAULT_ORDERS };
  }

  async saveOrders(
    accountId: string,
    orders: StandingOrders,
    options?: { markFiled?: boolean },
  ): Promise<void> {
    this.orders.set(accountId, { ...orders });
    if (options?.markFiled) this.filedOrders.add(accountId);
  }

  async hasFiledOrders(accountId: string): Promise<boolean> {
    return this.filedOrders.has(accountId);
  }

  async appendJournal(entries: NewJournalEntry[]): Promise<void> {
    for (const entry of entries) {
      this.journalSeq += 1;
      this.journal.push({
        id: String(this.journalSeq),
        characterId: entry.characterId,
        tick: entry.tick,
        at: entry.at.toISOString(),
        text: entry.text,
      });
    }
  }

  async listJournal(characterId: string, sinceTick: number, limit: number): Promise<JournalEntry[]> {
    return this.journal
      .filter((e) => e.characterId === characterId && e.tick > sinceTick)
      .slice(-limit);
  }

  async listJournalBefore(
    characterId: string,
    beforeId: string,
    limit: number,
  ): Promise<JournalEntry[]> {
    const cutoff = Number(beforeId);
    if (!Number.isFinite(cutoff)) return [];
    return this.journal
      .filter((e) => e.characterId === characterId && Number(e.id) < cutoff)
      .slice(-limit);
  }

  private readonly transfers = new Map<string, Transfer>();

  async getPension(accountId: string): Promise<Pension> {
    return this.pensions.get(accountId) ?? { total: 0, spent: 0, unlocks: [] };
  }

  async savePension(accountId: string, pension: Pension): Promise<void> {
    this.pensions.set(accountId, { ...pension, unlocks: [...pension.unlocks] });
  }

  private readonly guild = new Map<string, GuildStanding>();

  async getGuildStanding(accountId: string): Promise<GuildStanding> {
    return this.guild.get(accountId) ?? { cycle: 0, contribution: 0, paid: 0 };
  }

  async saveGuildStanding(accountId: string, standing: GuildStanding): Promise<void> {
    this.guild.set(accountId, { ...standing });
  }

  async addGuildProgress(amount: number): Promise<{ cycle: number; completed: boolean }> {
    // Single-threaded here, so the atomicity the Postgres version needs is free.
    const world = this.world;
    const progress = world.guildProgress + Math.max(0, amount);
    if (progress < world.guildTarget) {
      this.world = { ...world, guildProgress: progress };
      return { cycle: world.guildCycle, completed: false };
    }
    const cycle = world.guildCycle + 1;
    const next = objectiveForCycle(cycle);
    this.world = {
      ...world,
      guildCycle: cycle,
      guildObjective: next.text,
      guildTarget: next.target,
      guildProgress: 0,
    };
    return { cycle: world.guildCycle, completed: true };
  }

  private readonly assignments = new Map<string, AssignmentState>();

  async getAssignments(accountId: string): Promise<AssignmentState> {
    return this.assignments.get(accountId) ?? { ...EMPTY_ASSIGNMENTS, completed: [] };
  }

  async saveAssignments(accountId: string, state: AssignmentState): Promise<void> {
    this.assignments.set(accountId, { ...state, completed: [...state.completed] });
  }

  async getTransfer(accountId: string): Promise<Transfer> {
    return this.transfers.get(accountId) ?? { ...EMPTY_TRANSFER, unlocks: [] };
  }

  async saveTransfer(accountId: string, transfer: Transfer): Promise<void> {
    this.transfers.set(accountId, { ...transfer, unlocks: [...transfer.unlocks] });
  }

  async getOffice(accountId: string): Promise<Office> {
    return this.offices.get(accountId) ?? { spent: 0, requisitions: [] };
  }

  async saveOffice(accountId: string, office: Office): Promise<void> {
    this.offices.set(accountId, { ...office, requisitions: [...office.requisitions] });
  }

  async getRegistry(accountId: string): Promise<Registry> {
    return clone(this.registries.get(accountId) ?? { staff: [], spent: 0, unpaid: false });
  }

  async saveRegistry(accountId: string, registry: Registry): Promise<void> {
    this.registries.set(accountId, clone(registry));
  }

  async recordDeath(accountId: string, record: DeathRecord): Promise<void> {
    this.deaths.unshift({ ...record, accountId });
  }

  async listDeaths(limit: number): Promise<DeathRecord[]> {
    return this.deaths.slice(0, limit).map(stripAccount);
  }

  async getLatestDeath(accountId: string): Promise<DeathRecord | null> {
    const found = this.deaths.find((death) => death.accountId === accountId);
    return found ? stripAccount(found) : null;
  }

  async getWorld(): Promise<WorldState> {
    return clone(this.world);
  }

  async saveWorld(world: WorldState): Promise<void> {
    this.world = clone(world);
  }

  async listTavern(sinceId: number, limit: number): Promise<TavernMessage[]> {
    return this.tavern.filter((m) => m.id > sinceId).slice(-limit);
  }

  async appendTavern(_accountId: string, author: string, body: string): Promise<TavernMessage> {
    this.tavernSeq += 1;
    const message: TavernMessage = {
      id: this.tavernSeq,
      author,
      body,
      at: new Date().toISOString(),
    };
    this.tavern.push(message);
    return message;
  }

  async countActiveOfficers(withinSeconds: number): Promise<number> {
    const cutoff = Date.now() - withinSeconds * 1000;
    let count = 0;
    for (const account of this.accounts.values()) {
      if (account.lastSeenAt.getTime() >= cutoff) count += 1;
    }
    return count;
  }

  async touchAccountSeen(accountId: string): Promise<void> {
    const account = this.accounts.get(accountId);
    if (account) account.lastSeenAt = new Date();
  }

  async savePushToken(accountId: string, token: string, platform: string): Promise<void> {
    this.pushTokens.set(token, { accountId, platform });
  }

  async deletePushTokens(tokens: readonly string[]): Promise<void> {
    for (const token of tokens) this.pushTokens.delete(token);
  }

  async listPushTokens(accountId: string): Promise<string[]> {
    return [...this.pushTokens.entries()]
      .filter(([, row]) => row.accountId === accountId)
      .map(([token]) => token);
  }

  async listSweepCandidates(awaySeconds: number, limit: number): Promise<string[]> {
    const cutoff = Date.now() - awaySeconds * 1000;
    const withTokens = new Set([...this.pushTokens.values()].map((row) => row.accountId));
    return [...this.accounts.values()]
      .filter((account) => withTokens.has(account.id) && account.lastSeenAt.getTime() < cutoff)
      .sort((a, b) => a.lastSeenAt.getTime() - b.lastSeenAt.getTime())
      .slice(0, limit)
      .map((account) => account.id);
  }

  async markAwayForTesting(accountId: string, seconds: number): Promise<void> {
    const account = this.accounts.get(accountId);
    if (account) account.lastSeenAt = new Date(Date.now() - seconds * 1000);
  }

  async claimPushSend(accountId: string, eventKey: string, dailyCap: number): Promise<boolean> {
    const day = Date.now() - 24 * 3600 * 1000;
    const sent = this.pushSends.get(accountId) ?? new Map<string, number>();
    if (sent.has(eventKey)) return false;
    let recent = 0;
    for (const at of sent.values()) if (at > day) recent += 1;
    if (recent >= dailyCap) return false;
    sent.set(eventKey, Date.now());
    this.pushSends.set(accountId, sent);
    return true;
  }
}

function stripAccount(record: DeathRecord & { accountId: string }): DeathRecord {
  const { accountId: _accountId, ...death } = record;
  return death;
}

function toAccount(row: Account & { deviceId: string }): Account {
  return { id: row.id, callsign: row.callsign, createdAt: row.createdAt };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
