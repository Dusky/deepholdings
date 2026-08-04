import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type {
  Account,
  CaseFile,
  DeathRecord,
  Filing,
  InventoryItem,
  JournalEntry,
  Office,
  Pension,
  Registry,
  AssignmentState,
  Transfer,
  RequisitionId,
  StandingOrders,
  TavernMessage,
  UnlockId,
  WorldState,
} from '@deepholdings/shared';
import { DEFAULT_ORDERS, GUILD_OBJECTIVES, equipmentPolicyOf } from '@deepholdings/shared';
import { initialWorld } from '../domain/world.js';
import type { GuildStanding, IdempotentClaim } from '../ports.js';
import { pendingMigrations, runMigrations } from '../migrations/runner.js';
import type { CharacterRecord, NewJournalEntry, Repository } from '../ports.js';

const { Pool } = pg;

type Queryable = pg.Pool | pg.PoolClient;



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
    await this.awaitDatabase();
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
      `INSERT INTO world (id, beat, event, guild_name, guild_objective, guild_progress, guild_target, market, next_beat_at, guild_cycle)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      worldParams(initialWorld(new Date())),
    );
  }

  /**
   * Wait for Postgres to start accepting connections.
   *
   * A server and its database come up together — under compose, under a
   * platform that restarts both, and on a laptop where the test suite runs
   * seconds after `service postgresql start`. Postgres binds its socket before
   * it will answer, so the first connection loses a race that nothing is
   * actually wrong with, and the failure reads as a broken schema or a flaky
   * test rather than "ask again in a second".
   *
   * Bounded: a database that is genuinely unreachable still fails the boot,
   * about ten seconds later and with the real error attached.
   */
  private async awaitDatabase(): Promise<void> {
    const delays = [100, 200, 400, 800, 1600, 3200, 3200];
    for (const [attempt, delay] of delays.entries()) {
      try {
        await this.db.query('SELECT 1');
        return;
      } catch (cause) {
        if (attempt === delays.length - 1) throw cause;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
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

  async getLatestCharacter(accountId: string): Promise<CharacterRecord | null> {
    const { rows } = await this.db.query(
      'SELECT * FROM characters WHERE account_id = $1 ORDER BY recruit_num DESC LIMIT 1',
      [accountId],
    );
    return rows[0] ? toCharacterRecord(rows[0]) : null;
  }

  async insertCharacter(record: CharacterRecord): Promise<void> {
    const c = record.character;
    await this.db.query(
      `INSERT INTO characters
         (id, account_id, name, recruit_num, level, xp, hp, max_hp, depth, permit_tier,
          gold, supplies, alive, last_resolved_tick, permit_applied_tick, inventory, born_tick,
          case_files, filings, standing)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18::jsonb,
               $19::jsonb,$20)`,
      [
        c.id, c.accountId, c.name, c.recruitNum, c.level, c.xp, c.hp, c.maxHp, c.depth,
        c.permitTier, c.gold, c.supplies, c.alive, c.lastResolvedTick,
        record.permitAppliedTick, JSON.stringify(record.inventory), c.bornTick,
        JSON.stringify(record.caseFiles ?? []), JSON.stringify(record.filings ?? []),
        c.standing ?? 0,
      ],
    );
  }

  async saveCharacter(record: CharacterRecord): Promise<void> {
    const c = record.character;
    await this.db.query(
      `UPDATE characters SET
         name = $2, recruit_num = $3, level = $4, xp = $5, hp = $6, max_hp = $7, depth = $8,
         permit_tier = $9, gold = $10, supplies = $11, alive = $12, last_resolved_tick = $13,
         permit_applied_tick = $14, inventory = $15::jsonb, born_tick = $16,
         case_files = $17::jsonb, filings = $18::jsonb, standing = $19,
         permit_expedited_tick = $20,
         died_at = CASE WHEN $12 THEN died_at ELSE COALESCE(died_at, now()) END
       WHERE id = $1`,
      [
        c.id, c.name, c.recruitNum, c.level, c.xp, c.hp, c.maxHp, c.depth, c.permitTier,
        c.gold, c.supplies, c.alive, c.lastResolvedTick, record.permitAppliedTick,
        JSON.stringify(record.inventory), c.bornTick, JSON.stringify(record.caseFiles ?? []),
        JSON.stringify(record.filings ?? []), c.standing ?? 0,
        record.permitExpeditedTick ?? null,
      ],
    );
  }

  async getOrders(accountId: string): Promise<StandingOrders> {
    const { rows } = await this.db.query(
      'SELECT site, target_depth, retreat_pct, loot_priority, spend_policy, equipment_policy FROM standing_orders WHERE account_id = $1',
      [accountId],
    );
    if (!rows[0]) return { ...DEFAULT_ORDERS };
    return {
      site: rows[0].site ?? 'holdings',
      targetDepth: rows[0].target_depth,
      retreatPct: rows[0].retreat_pct,
      lootPriority: rows[0].loot_priority,
      spendPolicy: rows[0].spend_policy,
      equipmentPolicy: rows[0].equipment_policy,
    };
  }

  async saveOrders(
    accountId: string,
    orders: StandingOrders,
    options?: { markFiled?: boolean },
  ): Promise<void> {
    const filed = options?.markFiled ?? false;
    await this.db.query(
      `INSERT INTO standing_orders
         (account_id, target_depth, retreat_pct, loot_priority, spend_policy, site, equipment_policy, updated_at, filed_at)
       VALUES ($1, $2, $3, $4, $5, $7, $8, now(), CASE WHEN $6 THEN now() ELSE NULL END)
       ON CONFLICT (account_id) DO UPDATE SET
         site = EXCLUDED.site,
         target_depth = EXCLUDED.target_depth,
         retreat_pct = EXCLUDED.retreat_pct,
         loot_priority = EXCLUDED.loot_priority,
         spend_policy = EXCLUDED.spend_policy,
         equipment_policy = EXCLUDED.equipment_policy,
         updated_at = now(),
         -- Once filed, always filed.
         filed_at = COALESCE(standing_orders.filed_at, EXCLUDED.filed_at)`,
      [accountId, orders.targetDepth, orders.retreatPct, orders.lootPriority, orders.spendPolicy, filed,
       orders.site ?? 'holdings', equipmentPolicyOf(orders)],
    );
  }

  async hasFiledOrders(accountId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      'SELECT filed_at IS NOT NULL AS filed FROM standing_orders WHERE account_id = $1',
      [accountId],
    );
    return Boolean(rows[0]?.filed);
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
      // Ordered by id, not tick: id is the order things were actually written,
      // which is what "the most recent lines" means to a reader. Several lines
      // can share a tick, and a catch-up can write a line whose tick is older
      // than one already on file.
      `SELECT * FROM (
         SELECT id, character_id, tick, at, text FROM journal
         WHERE character_id = $1 AND tick > $2
         ORDER BY id DESC LIMIT $3
       ) recent ORDER BY id ASC`,
      [characterId, sinceTick, limit],
    );
    return rows.map(toJournalEntry);
  }

  async listJournalBefore(
    characterId: string,
    beforeId: string,
    limit: number,
  ): Promise<JournalEntry[]> {
    const { rows } = await this.db.query(
      `SELECT * FROM (
         SELECT id, character_id, tick, at, text FROM journal
         WHERE character_id = $1 AND id < $2
         ORDER BY id DESC LIMIT $3
       ) earlier ORDER BY id ASC`,
      [characterId, beforeId, limit],
    );
    return rows.map(toJournalEntry);
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

  async getOffice(accountId: string): Promise<Office> {
    const { rows } = await this.db.query(
      'SELECT spent, requisitions FROM offices WHERE account_id = $1',
      [accountId],
    );
    if (!rows[0]) return { spent: 0, requisitions: [] };
    return {
      spent: rows[0].spent,
      requisitions: (rows[0].requisitions ?? []) as RequisitionId[],
    };
  }

  async ping(): Promise<void> {
    // Deliberately the cheapest statement Postgres has. A readiness probe runs
    // on the platform's schedule, not ours, and one that cost a real query
    // would add load in exactly the conditions it exists to detect.
    await this.db.query('SELECT 1');
  }

  async getGuildStanding(accountId: string): Promise<GuildStanding> {
    const { rows } = await this.db.query(
      'SELECT cycle, contribution, paid FROM guild_contributions WHERE account_id = $1',
      [accountId],
    );
    if (!rows[0]) return { cycle: 0, contribution: 0, paid: 0 };
    return { cycle: rows[0].cycle, contribution: rows[0].contribution, paid: rows[0].paid };
  }

  async saveGuildStanding(accountId: string, standing: GuildStanding): Promise<void> {
    await this.db.query(
      `INSERT INTO guild_contributions (account_id, cycle, contribution, paid)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (account_id) DO UPDATE SET
         cycle = EXCLUDED.cycle, contribution = EXCLUDED.contribution, paid = EXCLUDED.paid`,
      [accountId, standing.cycle, standing.contribution, standing.paid],
    );
  }

  /**
   * One statement, and it has to be.
   *
   * This is the first number in the game that many accounts write at once. A
   * `SELECT` followed by an `UPDATE` would lose contributions the moment two
   * officers resolve together, and — worse — two callers could both see the
   * target crossed and both roll the cycle, paying one objective twice and
   * skipping the next. Doing the add, the completion test and the roll in a
   * single `UPDATE ... RETURNING` means exactly one caller can observe
   * `completed` for a given cycle, whatever the concurrency.
   *
   * The new objective's text and target are computed in SQL from the rolled
   * cycle via a CASE over the catalogue, which is duplication of
   * `objectiveForCycle` and is called out as such: the alternative is a second
   * statement, and a second statement is the bug this one exists to avoid.
   * `test/guild.test.ts` asserts the two agree for every cycle in the rotation.
   */
  async addGuildProgress(amount: number): Promise<{ cycle: number; completed: boolean }> {
    const add = Math.max(0, Math.round(amount));
    const catalogue = GUILD_OBJECTIVES.map((objective, index) => ({
      index,
      text: objective.text,
      target: objective.target,
    }));
    const textCase = catalogue
      .map((entry) => `WHEN ${entry.index} THEN $${entry.index * 2 + 2}::text`)
      .join(' ');
    const targetCase = catalogue
      .map((entry) => `WHEN ${entry.index} THEN $${entry.index * 2 + 3}::int`)
      .join(' ');
    const params: unknown[] = [add];
    for (const entry of catalogue) params.push(entry.text, entry.target);

    const { rows } = await this.db.query(
      `UPDATE world SET
         guild_progress = CASE WHEN guild_progress + $1 >= guild_target THEN 0
                               ELSE guild_progress + $1 END,
         guild_cycle    = CASE WHEN guild_progress + $1 >= guild_target THEN guild_cycle + 1
                               ELSE guild_cycle END,
         guild_objective = CASE WHEN guild_progress + $1 >= guild_target
                                THEN CASE (guild_cycle + 1) % ${catalogue.length} ${textCase} END
                                ELSE guild_objective END,
         guild_target   = CASE WHEN guild_progress + $1 >= guild_target
                                THEN CASE (guild_cycle + 1) % ${catalogue.length} ${targetCase} END
                                ELSE guild_target END
       WHERE id = 1
       RETURNING guild_cycle, (guild_cycle > (SELECT guild_cycle FROM world WHERE id = 1)) AS rolled`,
      params,
    );
    if (!rows[0]) return { cycle: 0, completed: false };
    // `guild_cycle` in RETURNING is the value *after* the update, so a roll is
    // detectable by comparing it with what the caller's contribution counted
    // toward — the completed cycle is one less than the new one.
    const cycle: number = rows[0].guild_cycle;
    const completed = Boolean(rows[0].rolled);
    return { cycle: completed ? cycle - 1 : cycle, completed };
  }

  async beginIdempotent(
    accountId: string,
    key: string,
    route: string,
    requestHash: string,
    staleAfterSeconds: number,
  ): Promise<IdempotentClaim> {
    /**
     * One statement to claim, and it has to be one statement.
     *
     * `INSERT … ON CONFLICT DO NOTHING RETURNING` is atomic: exactly one of two
     * simultaneous requests gets a row back, which is precisely the race this
     * table exists to settle. A `SELECT` first would have both see nothing and
     * both proceed — the double-charge, reintroduced by the mechanism meant to
     * prevent it.
     */
    const claimed = await this.db.query(
      `INSERT INTO idempotency_keys (account_id, key, route, request_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (account_id, key) DO NOTHING
       RETURNING account_id`,
      [accountId, key, route, requestHash],
    );
    if (claimed.rows.length > 0) return { state: 'fresh' };

    const { rows } = await this.db.query(
      `SELECT route, request_hash, status, response,
              EXTRACT(EPOCH FROM (now() - created_at)) AS age
         FROM idempotency_keys WHERE account_id = $1 AND key = $2`,
      [accountId, key],
    );
    // Deleted between the two statements by the expiry sweep: nobody holds it.
    if (!rows[0]) return { state: 'fresh' };

    const held = rows[0];
    if (held.route !== route || held.request_hash !== requestHash) return { state: 'conflict' };
    if (held.status === null) {
      if (Number(held.age) > staleAfterSeconds) {
        // Abandoned by a process that died mid-request. Reclaim it rather than
        // leave the key jammed forever — see `idempotency.ts` for the residual
        // risk that trade accepts.
        await this.db.query(
          'UPDATE idempotency_keys SET created_at = now() WHERE account_id = $1 AND key = $2',
          [accountId, key],
        );
        return { state: 'fresh' };
      }
      return { state: 'in_flight' };
    }
    return { state: 'replay', status: held.status, response: held.response };
  }

  async completeIdempotent(
    accountId: string,
    key: string,
    status: number,
    response: unknown,
  ): Promise<void> {
    await this.db.query(
      `UPDATE idempotency_keys SET status = $3, response = $4::jsonb
        WHERE account_id = $1 AND key = $2`,
      [accountId, key, status, JSON.stringify(response ?? null)],
    );
  }

  async releaseIdempotent(accountId: string, key: string): Promise<void> {
    await this.db.query('DELETE FROM idempotency_keys WHERE account_id = $1 AND key = $2', [
      accountId,
      key,
    ]);
  }

  async expireIdempotency(olderThanSeconds: number): Promise<number> {
    const { rowCount } = await this.db.query(
      `DELETE FROM idempotency_keys WHERE created_at < now() - ($1 || ' seconds')::interval`,
      [String(olderThanSeconds)],
    );
    return rowCount ?? 0;
  }

  async backdateIdempotentForTesting(
    accountId: string,
    key: string,
    seconds: number,
  ): Promise<void> {
    await this.db.query(
      `UPDATE idempotency_keys SET created_at = created_at - ($3 || ' seconds')::interval
        WHERE account_id = $1 AND key = $2`,
      [accountId, key, String(seconds)],
    );
  }

  async getAssignments(accountId: string): Promise<AssignmentState> {
    const { rows } = await this.db.query(
      'SELECT active, progress, started_tick, completed FROM assignments WHERE account_id = $1',
      [accountId],
    );
    if (!rows[0]) return { active: null, progress: 0, startedTick: 0, completed: [] };
    return {
      active: rows[0].active,
      progress: rows[0].progress,
      startedTick: rows[0].started_tick,
      completed: (rows[0].completed ?? []) as AssignmentState['completed'],
    };
  }

  async saveAssignments(accountId: string, state: AssignmentState): Promise<void> {
    await this.db.query(
      `INSERT INTO assignments (account_id, active, progress, started_tick, completed)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (account_id) DO UPDATE SET
         active = EXCLUDED.active, progress = EXCLUDED.progress,
         started_tick = EXCLUDED.started_tick, completed = EXCLUDED.completed`,
      [accountId, state.active, state.progress, state.startedTick, JSON.stringify(state.completed)],
    );
  }

  async getTransfer(accountId: string): Promise<Transfer> {
    const { rows } = await this.db.query(
      'SELECT commendations, spent, unlocks, careers FROM transfers WHERE account_id = $1',
      [accountId],
    );
    if (!rows[0]) return { total: 0, spent: 0, unlocks: [], careers: 0 };
    return {
      total: rows[0].commendations,
      spent: rows[0].spent,
      unlocks: (rows[0].unlocks ?? []) as Transfer['unlocks'],
      careers: rows[0].careers,
    };
  }

  async saveTransfer(accountId: string, transfer: Transfer): Promise<void> {
    await this.db.query(
      `INSERT INTO transfers (account_id, commendations, spent, unlocks, careers)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (account_id) DO UPDATE SET
         commendations = EXCLUDED.commendations, spent = EXCLUDED.spent,
         unlocks = EXCLUDED.unlocks, careers = EXCLUDED.careers`,
      [accountId, transfer.total, transfer.spent, JSON.stringify(transfer.unlocks), transfer.careers],
    );
  }

  async getRegistry(accountId: string): Promise<Registry> {
    const { rows } = await this.db.query(
      'SELECT staff, spent, unpaid FROM registries WHERE account_id = $1',
      [accountId],
    );
    if (!rows[0]) return { staff: [], spent: 0, unpaid: false };
    return {
      staff: (rows[0].staff ?? []) as Registry['staff'],
      spent: rows[0].spent,
      unpaid: rows[0].unpaid,
    };
  }

  async saveRegistry(accountId: string, registry: Registry): Promise<void> {
    await this.db.query(
      `INSERT INTO registries (account_id, staff, spent, unpaid)
       VALUES ($1, $2::jsonb, $3, $4)
       ON CONFLICT (account_id) DO UPDATE SET
         staff = EXCLUDED.staff, spent = EXCLUDED.spent, unpaid = EXCLUDED.unpaid`,
      [accountId, JSON.stringify(registry.staff), registry.spent, registry.unpaid],
    );
  }

  async saveOffice(accountId: string, office: Office): Promise<void> {
    await this.db.query(
      `INSERT INTO offices (account_id, spent, requisitions)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (account_id) DO UPDATE SET
         spent = EXCLUDED.spent, requisitions = EXCLUDED.requisitions`,
      [accountId, office.spent, JSON.stringify(office.requisitions)],
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
      guildCycle: row.guild_cycle ?? 0,
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
         guild_progress = $5, guild_target = $6, market = $7::jsonb, next_beat_at = $8,
         guild_cycle = $9
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

  async savePushToken(accountId: string, token: string, platform: string): Promise<void> {
    // A token can move between accounts on a shared device, so the conflict
    // updates the owner too rather than leaving a stranger's phone registered
    // to the previous officer.
    await this.db.query(
      `INSERT INTO push_tokens (token, account_id, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE
         SET account_id = EXCLUDED.account_id,
             platform = EXCLUDED.platform,
             refreshed_at = now()`,
      [token, accountId, platform],
    );
  }

  async deletePushTokens(tokens: readonly string[]): Promise<void> {
    if (tokens.length === 0) return;
    await this.db.query('DELETE FROM push_tokens WHERE token = ANY($1::text[])', [tokens]);
  }

  async listPushTokens(accountId: string): Promise<string[]> {
    const { rows } = await this.db.query(
      'SELECT token FROM push_tokens WHERE account_id = $1',
      [accountId],
    );
    return rows.map((row) => row.token as string);
  }

  async listSweepCandidates(awaySeconds: number, limit: number): Promise<string[]> {
    const { rows } = await this.db.query(
      `SELECT a.id
         FROM accounts a
        WHERE a.last_seen_at < now() - ($1 || ' seconds')::interval
          AND EXISTS (SELECT 1 FROM push_tokens t WHERE t.account_id = a.id)
        ORDER BY a.last_seen_at ASC
        LIMIT $2`,
      [awaySeconds, limit],
    );
    return rows.map((row) => row.id as string);
  }

  async markAwayForTesting(accountId: string, seconds: number): Promise<void> {
    await this.db.query(
      "UPDATE accounts SET last_seen_at = now() - ($2 || ' seconds')::interval WHERE id = $1",
      [accountId, seconds],
    );
  }

  async claimPushSend(accountId: string, eventKey: string, dailyCap: number): Promise<boolean> {
    // The insert is the dedupe: two workers racing on the same death both try
    // to write the same primary key and exactly one succeeds. Doing it as a
    // SELECT-then-INSERT would make that a coin toss.
    const { rows } = await this.db.query(
      `INSERT INTO push_sends (account_id, event_key)
       SELECT $1, $2
        WHERE (
          SELECT count(*) FROM push_sends
           WHERE account_id = $1 AND sent_at > now() - interval '1 day'
        ) < $3
       ON CONFLICT (account_id, event_key) DO NOTHING
       RETURNING event_key`,
      [accountId, eventKey, dailyCap],
    );
    return rows.length > 0;
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
    world.guildCycle,
  ];
}

function toJournalEntry(row: Record<string, unknown>): JournalEntry {
  return {
    id: String(row.id),
    characterId: row.character_id as string,
    tick: Number(row.tick),
    at: new Date(row.at as string).toISOString(),
    text: row.text as string,
  };
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
      standing: Number(row.standing ?? 0),
      alive: row.alive as boolean,
      lastResolvedTick: Number(row.last_resolved_tick),
      bornTick: Number(row.born_tick ?? row.last_resolved_tick),
    },
    permitAppliedTick:
      row.permit_applied_tick === null ? null : Number(row.permit_applied_tick),
    permitExpeditedTick:
      row.permit_expedited_tick === null || row.permit_expedited_tick === undefined
        ? null
        : Number(row.permit_expedited_tick),
    inventory: (row.inventory ?? []) as InventoryItem[],
    caseFiles: (row.case_files ?? []) as CaseFile[],
    filings: (row.filings ?? []) as Filing[],
  };
}
