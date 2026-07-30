import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type {
  Account,
  DeathRecord,
  InventoryItem,
  JournalEntry,
  Pension,
  StandingOrders,
  TavernMessage,
  UnlockId,
  WorldState,
} from '@deepholdings/shared';
import { initialWorld } from '../domain/world.js';
import { pendingMigrations, runMigrations } from '../migrations/runner.js';
import type { CharacterRecord, NewJournalEntry, Repository } from '../ports.js';

const { Pool } = pg;

type Queryable = pg.Pool | pg.PoolClient;

const DEFAULT_ORDERS: StandingOrders = {
  targetDepth: 3,
  retreatPct: 28,
  lootPriority: 'gear',
  spendPolicy: 'resupply',
};

export class PostgresRepository implements Repository {
  private readonly pool: pg.Pool;
  private readonly db: Queryable;
  private readonly owned: boolean;

  constructor(connectionString: string);
  constructor(pool: pg.Pool, client: pg.PoolClient);
  constructor(poolOrConnectionString: pg.Pool | string, client?: pg.PoolClient) {
    if (typeof poolOrConnectionString === 'string') {
      this.pool = new Pool({ connectionString: poolOrConnectionString });
      this.db = this.pool;
      this.owned = true;
    } else {
      this.pool = poolOrConnectionString;
      this.db = client as pg.PoolClient;
      this.owned = false;
    }
  }

  /**
   * Brings the schema up to date when `autoMigrate` is on, and otherwise
   * refuses to start against a schema it does not recognise — a server quietly
   * serving an old shape is worse than one that will not boot.
   */
  async init(options: { autoMigrate?: boolean } = {}): Promise<void> {
    const autoMigrate = options.autoMigrate ?? true;
    if (autoMigrate) {
      await runMigrations(this.pool);
    } else {
      const pending = await pendingMigrations(this.pool);
      if (pending.length > 0) {
        throw new Error(
          `Database is behind: ${pending.map((m) => m.version).join(', ')}. Run \`npm run migrate\`.`,
        );
      }
    }

    await this.db.query(
      `INSERT INTO world (id, beat, event, guild_name, guild_objective, guild_progress, guild_target, market, next_beat_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       ON CONFLICT (id) DO NOTHING`,
      worldParams(initialWorld(new Date())),
    );
  }

  async close(): Promise<void> {
    if (this.owned) await this.pool.end();
  }

  /** Real transaction: the row locks taken inside are what stop double-resolution. */
  async transaction<T>(fn: (repo: Repository) => Promise<T>): Promise<T> {
    if (!this.owned) return fn(this);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(new PostgresRepository(this.pool, client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findAccountByDevice(deviceId: string): Promise<Account | null> {
    const { rows } = await this.db.query(
      'SELECT id, callsign, created_at FROM accounts WHERE device_id = $1',
      [deviceId],
    );
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async createAccount(deviceId: string, callsign: string): Promise<Account> {
    const { rows } = await this.db.query(
      `INSERT INTO accounts (id, device_id, callsign) VALUES ($1, $2, $3)
       RETURNING id, callsign, created_at`,
      [randomUUID(), deviceId, callsign],
    );
    return toAccount(rows[0]);
  }

  async getAccount(accountId: string): Promise<Account | null> {
    const { rows } = await this.db.query(
      'SELECT id, callsign, created_at FROM accounts WHERE id = $1',
      [accountId],
    );
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async getActiveCharacterForUpdate(accountId: string): Promise<CharacterRecord | null> {
    const { rows } = await this.db.query(
      `SELECT * FROM characters WHERE account_id = $1 AND alive FOR UPDATE`,
      [accountId],
    );
    return rows[0] ? toCharacterRecord(rows[0]) : null;
  }

  async insertCharacter(record: CharacterRecord): Promise<void> {
    const c = record.character;
    await this.db.query(
      `INSERT INTO characters
         (id, account_id, name, recruit_num, level, xp, hp, max_hp, depth, permit_tier,
          gold, supplies, alive, last_resolved_tick, permit_applied_tick, inventory)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)`,
      [
        c.id, c.accountId, c.name, c.recruitNum, c.level, c.xp, c.hp, c.maxHp, c.depth,
        c.permitTier, c.gold, c.supplies, c.alive, c.lastResolvedTick,
        record.permitAppliedTick, JSON.stringify(record.inventory),
      ],
    );
  }

  async saveCharacter(record: CharacterRecord): Promise<void> {
    const c = record.character;
    await this.db.query(
      `UPDATE characters SET
         name = $2, recruit_num = $3, level = $4, xp = $5, hp = $6, max_hp = $7, depth = $8,
         permit_tier = $9, gold = $10, supplies = $11, alive = $12, last_resolved_tick = $13,
         permit_applied_tick = $14, inventory = $15::jsonb,
         died_at = CASE WHEN $12 THEN died_at ELSE COALESCE(died_at, now()) END
       WHERE id = $1`,
      [
        c.id, c.name, c.recruitNum, c.level, c.xp, c.hp, c.maxHp, c.depth, c.permitTier,
        c.gold, c.supplies, c.alive, c.lastResolvedTick, record.permitAppliedTick,
        JSON.stringify(record.inventory),
      ],
    );
  }

  async getOrders(accountId: string): Promise<StandingOrders> {
    const { rows } = await this.db.query(
      'SELECT target_depth, retreat_pct, loot_priority, spend_policy FROM standing_orders WHERE account_id = $1',
      [accountId],
    );
    if (!rows[0]) return { ...DEFAULT_ORDERS };
    return {
      targetDepth: rows[0].target_depth,
      retreatPct: rows[0].retreat_pct,
      lootPriority: rows[0].loot_priority,
      spendPolicy: rows[0].spend_policy,
    };
  }

  async saveOrders(accountId: string, orders: StandingOrders): Promise<void> {
    await this.db.query(
      `INSERT INTO standing_orders (account_id, target_depth, retreat_pct, loot_priority, spend_policy, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (account_id) DO UPDATE SET
         target_depth = EXCLUDED.target_depth,
         retreat_pct = EXCLUDED.retreat_pct,
         loot_priority = EXCLUDED.loot_priority,
         spend_policy = EXCLUDED.spend_policy,
         updated_at = now()`,
      [accountId, orders.targetDepth, orders.retreatPct, orders.lootPriority, orders.spendPolicy],
    );
  }

  async appendJournal(entries: NewJournalEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const values: unknown[] = [];
    const tuples = entries.map((entry, i) => {
      values.push(entry.characterId, entry.tick, entry.at, entry.text);
      const base = i * 4;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    });
    await this.db.query(
      `INSERT INTO journal (character_id, tick, at, text) VALUES ${tuples.join(', ')}`,
      values,
    );
  }

  async listJournal(characterId: string, sinceTick: number, limit: number): Promise<JournalEntry[]> {
    const { rows } = await this.db.query(
      `SELECT * FROM (
         SELECT id, character_id, tick, at, text FROM journal
         WHERE character_id = $1 AND tick > $2
         ORDER BY tick DESC, id DESC LIMIT $3
       ) recent ORDER BY tick ASC, id ASC`,
      [characterId, sinceTick, limit],
    );
    return rows.map((row) => ({
      id: String(row.id),
      characterId: row.character_id,
      tick: Number(row.tick),
      at: new Date(row.at).toISOString(),
      text: row.text,
    }));
  }

  async getPension(accountId: string): Promise<Pension> {
    const { rows } = await this.db.query(
      'SELECT total, spent, unlocks FROM pensions WHERE account_id = $1',
      [accountId],
    );
    if (!rows[0]) return { total: 0, spent: 0, unlocks: [] };
    return {
      total: rows[0].total,
      spent: rows[0].spent,
      unlocks: (rows[0].unlocks ?? []) as UnlockId[],
    };
  }

  async savePension(accountId: string, pension: Pension): Promise<void> {
    await this.db.query(
      `INSERT INTO pensions (account_id, total, spent, unlocks)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (account_id) DO UPDATE SET
         total = EXCLUDED.total, spent = EXCLUDED.spent, unlocks = EXCLUDED.unlocks`,
      [accountId, pension.total, pension.spent, JSON.stringify(pension.unlocks)],
    );
  }

  async recordDeath(accountId: string, record: DeathRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO deaths (id, account_id, character_name, depth, cause, gold_handled, pension_awarded, at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        record.id, accountId, record.characterName, record.depth, record.cause,
        record.goldHandled, record.pensionAwarded, record.at,
      ],
    );
  }

  async listDeaths(limit: number): Promise<DeathRecord[]> {
    const { rows } = await this.db.query(
      `SELECT id, character_name, depth, cause, gold_handled, pension_awarded, at
       FROM deaths ORDER BY at DESC LIMIT $1`,
      [limit],
    );
    return rows.map(toDeath);
  }

  async getLatestDeath(accountId: string): Promise<DeathRecord | null> {
    const { rows } = await this.db.query(
      `SELECT id, character_name, depth, cause, gold_handled, pension_awarded, at
       FROM deaths WHERE account_id = $1 ORDER BY at DESC LIMIT 1`,
      [accountId],
    );
    return rows[0] ? toDeath(rows[0]) : null;
  }

  async getWorld(): Promise<WorldState> {
    const { rows } = await this.db.query('SELECT * FROM world WHERE id = 1 FOR UPDATE');
    const row = rows[0];
    return {
      beat: Number(row.beat),
      event: row.event,
      guildName: row.guild_name,
      guildObjective: row.guild_objective,
      guildProgress: row.guild_progress,
      guildTarget: row.guild_target,
      market: row.market,
      nextBeatAt: new Date(row.next_beat_at).toISOString(),
    };
  }

  async saveWorld(world: WorldState): Promise<void> {
    await this.db.query(
      `UPDATE world SET beat = $1, event = $2, guild_name = $3, guild_objective = $4,
         guild_progress = $5, guild_target = $6, market = $7::jsonb, next_beat_at = $8
       WHERE id = 1`,
      worldParams(world),
    );
  }

  async listTavern(sinceId: number, limit: number): Promise<TavernMessage[]> {
    const { rows } = await this.db.query(
      `SELECT * FROM (
         SELECT id, author, body, at FROM tavern_messages
         WHERE id > $1 ORDER BY id DESC LIMIT $2
       ) recent ORDER BY id ASC`,
      [sinceId, limit],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      author: row.author,
      body: row.body,
      at: new Date(row.at).toISOString(),
    }));
  }

  async appendTavern(accountId: string, author: string, body: string): Promise<TavernMessage> {
    const { rows } = await this.db.query(
      `INSERT INTO tavern_messages (account_id, author, body) VALUES ($1, $2, $3)
       RETURNING id, author, body, at`,
      [accountId, author, body],
    );
    return {
      id: Number(rows[0].id),
      author: rows[0].author,
      body: rows[0].body,
      at: new Date(rows[0].at).toISOString(),
    };
  }

  async countActiveOfficers(withinSeconds: number): Promise<number> {
    const { rows } = await this.db.query(
      `SELECT count(*)::int AS count FROM accounts WHERE last_seen_at > now() - ($1 || ' seconds')::interval`,
      [withinSeconds],
    );
    return rows[0].count;
  }

  async touchAccountSeen(accountId: string): Promise<void> {
    await this.db.query('UPDATE accounts SET last_seen_at = now() WHERE id = $1', [accountId]);
  }
}

function toDeath(row: Record<string, unknown>): DeathRecord {
  return {
    id: row.id as string,
    characterName: row.character_name as string,
    depth: row.depth as number,
    cause: row.cause as string,
    goldHandled: row.gold_handled as number,
    pensionAwarded: row.pension_awarded as number,
    at: new Date(row.at as string).toISOString(),
  };
}

function worldParams(world: WorldState): unknown[] {
  return [
    world.beat, world.event, world.guildName, world.guildObjective,
    world.guildProgress, world.guildTarget, JSON.stringify(world.market), world.nextBeatAt,
  ];
}

function toAccount(row: { id: string; callsign: string; created_at: Date }): Account {
  return { id: row.id, callsign: row.callsign, createdAt: new Date(row.created_at).toISOString() };
}

function toCharacterRecord(row: Record<string, unknown>): CharacterRecord {
  return {
    character: {
      id: row.id as string,
      accountId: row.account_id as string,
      name: row.name as string,
      recruitNum: row.recruit_num as number,
      level: row.level as number,
      xp: row.xp as number,
      hp: row.hp as number,
      maxHp: row.max_hp as number,
      depth: row.depth as number,
      permitTier: row.permit_tier as number,
      gold: row.gold as number,
      supplies: row.supplies as number,
      alive: row.alive as boolean,
      lastResolvedTick: Number(row.last_resolved_tick),
    },
    permitAppliedTick:
      row.permit_applied_tick === null ? null : Number(row.permit_applied_tick),
    inventory: (row.inventory ?? []) as InventoryItem[],
  };
}
