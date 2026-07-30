import { randomUUID } from 'node:crypto';
import type {
  Account,
  DeathRecord,
  JournalEntry,
  Pension,
  StandingOrders,
  TavernMessage,
  WorldState,
} from '@deepholdings/shared';
import { initialWorld } from '../domain/world.js';
import type { CharacterRecord, NewJournalEntry, Repository } from '../ports.js';

const DEFAULT_ORDERS: StandingOrders = {
  targetDepth: 3,
  retreatPct: 28,
  lootPriority: 'gear',
  spendPolicy: 'resupply',
};

/**
 * In-memory adapter for tests and offline work. Single-process only: the
 * "transaction" is a promise chain that serialises writers, which is enough to
 * hold the same invariant Postgres gives us with SELECT ... FOR UPDATE.
 */
export class MemoryRepository implements Repository {
  private accounts = new Map<string, Account & { deviceId: string; lastSeenAt: Date }>();
  private characters = new Map<string, CharacterRecord & { diedAt: Date | null }>();
  private orders = new Map<string, StandingOrders>();
  private journal: JournalEntry[] = [];
  private pensions = new Map<string, Pension>();
  private deaths: (DeathRecord & { accountId: string })[] = [];
  private tavern: TavernMessage[] = [];
  private world: WorldState = initialWorld(new Date());
  private journalSeq = 0;
  private tavernSeq = 0;
  private queue: Promise<unknown> = Promise.resolve();

  async init(): Promise<void> {}
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

  async saveOrders(accountId: string, orders: StandingOrders): Promise<void> {
    this.orders.set(accountId, { ...orders });
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

  async getPension(accountId: string): Promise<Pension> {
    return this.pensions.get(accountId) ?? { total: 0, spent: 0, unlocks: [] };
  }

  async savePension(accountId: string, pension: Pension): Promise<void> {
    this.pensions.set(accountId, { ...pension, unlocks: [...pension.unlocks] });
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
