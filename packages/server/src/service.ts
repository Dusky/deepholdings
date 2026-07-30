import { randomUUID } from 'node:crypto';
import {
  HEARTBEAT_SECONDS,
  MAX_DEPTH,
  UNLOCK_CATALOGUE,
  type Account,
  type BulletinResponse,
  type ClaimPensionResponse,
  type DeathRecord,
  type LedgerResponse,
  type StandingOrders,
  type StateResponse,
  type TavernResponse,
  type UnlockId,
  type UnlockOffer,
} from '@deepholdings/shared';
import { newRecruit, recruitName, STARTING_INVENTORY } from './domain/character.js';
import { resolve, tickOf } from './domain/resolve.js';
import type { CharacterRecord, Repository } from './ports.js';

export class ServiceError extends Error {
  constructor(
    readonly code: 'not_found' | 'invalid_request' | 'insufficient_pension' | 'already_owned' | 'character_dead',
    message: string,
  ) {
    super(message);
  }
}

const JOURNAL_PAGE = 60;
const TAVERN_PAGE = 50;
const PRESENCE_WINDOW_SECONDS = 900;

/** Anonymous sign-in: creates the account, first recruit, orders and pension row. */
export async function authenticateDevice(
  repo: Repository,
  deviceId: string,
): Promise<Account> {
  if (!deviceId || deviceId.length > 128) {
    throw new ServiceError('invalid_request', 'deviceId required');
  }

  return repo.transaction(async (tx) => {
    const existing = await tx.findAccountByDevice(deviceId);
    if (existing) return existing;

    const callsign = `CASE OFFICER ${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`;
    const account = await tx.createAccount(deviceId, callsign);

    await tx.savePension(account.id, { total: 0, spent: 0, unlocks: [] });
    await tx.saveOrders(account.id, {
      targetDepth: 3,
      retreatPct: 28,
      lootPriority: 'gear',
      spendPolicy: 'resupply',
    });
    await tx.insertCharacter(firstRecruit(account.id));
    return account;
  });
}

function firstRecruit(accountId: string): CharacterRecord {
  return {
    character: newRecruit(randomUUID(), accountId, 1, [], tickOf(new Date())),
    permitAppliedTick: null,
    inventory: STARTING_INVENTORY.map((item) => ({ ...item })),
  };
}

/**
 * The one read that matters. Resolves the missed ticks inside a transaction,
 * writes the journal, then returns everything a cold client needs.
 */
export async function loadState(repo: Repository, accountId: string): Promise<StateResponse> {
  const now = new Date();

  return repo.transaction(async (tx) => {
    const account = await tx.getAccount(accountId);
    if (!account) throw new ServiceError('not_found', 'account not found');
    await tx.touchAccountSeen(accountId);

    const record = await tx.getActiveCharacterForUpdate(accountId);
    const pension = await tx.getPension(accountId);
    const orders = await tx.getOrders(accountId);
    const world = await tx.getWorld();

    let pendingDeath: DeathRecord | null = null;
    let current = record;

    if (record) {
      const result = resolve({
        character: record.character,
        orders,
        unlocks: pension.unlocks,
        toTick: tickOf(now),
        permitAppliedTick: record.permitAppliedTick,
      });

      if (result.journal.length > 0) {
        await tx.appendJournal(
          result.journal.map((entry) => ({
            characterId: result.character.id,
            tick: entry.tick,
            at: entry.at,
            text: entry.text,
          })),
        );
      }

      current = {
        character: result.character,
        permitAppliedTick: result.permitAppliedTick,
        inventory: record.inventory,
      };

      if (result.ticksResolved > 0) await tx.saveCharacter(current);

      if (result.death) {
        pendingDeath = {
          id: randomUUID(),
          characterName: result.character.name,
          depth: result.death.depth,
          cause: result.death.cause,
          goldHandled: result.death.goldHandled,
          pensionAwarded: result.death.pensionAwarded,
          at: new Date().toISOString(),
        };
        await tx.recordDeath(accountId, pendingDeath);
      }
    }

    if (!current) throw new ServiceError('not_found', 'no character');

    // A dead recruit that was recorded on an earlier request still needs the
    // overlay, so surface the death record until the pension is filed for.
    if (!current.character.alive && !pendingDeath) {
      pendingDeath = await tx.getLatestDeath(accountId);
    }

    const journal = await tx.listJournal(current.character.id, -1, JOURNAL_PAGE);

    return {
      account,
      character: current.character,
      orders,
      pension,
      world,
      journal,
      now: now.toISOString(),
      nextBeatInSeconds: secondsUntil(world.nextBeatAt, now),
      pendingDeath,
    };
  });
}

export async function updateOrders(
  repo: Repository,
  accountId: string,
  orders: StandingOrders,
): Promise<StandingOrders> {
  const clean = validateOrders(orders);
  await repo.transaction(async (tx) => {
    // Resolve first: orders must not retroactively change ticks already lived.
    await loadStateInside(tx, accountId);
    await tx.saveOrders(accountId, clean);
  });
  return clean;
}

function validateOrders(orders: StandingOrders): StandingOrders {
  const targetDepth = Math.round(Number(orders?.targetDepth));
  const retreatPct = Math.round(Number(orders?.retreatPct));
  const lootOk = ['gold', 'gear', 'relics', 'knowledge'].includes(orders?.lootPriority);
  const spendOk = ['resupply', 'hoard', 'insure'].includes(orders?.spendPolicy);

  if (
    !Number.isFinite(targetDepth) || targetDepth < 1 || targetDepth > MAX_DEPTH ||
    !Number.isFinite(retreatPct) || retreatPct < 5 || retreatPct > 80 ||
    !lootOk || !spendOk
  ) {
    throw new ServiceError('invalid_request', 'invalid standing orders');
  }

  return {
    targetDepth,
    retreatPct,
    lootPriority: orders.lootPriority,
    spendPolicy: orders.spendPolicy,
  };
}

/** Resolution step reused by writes that must not act on stale state. */
async function loadStateInside(tx: Repository, accountId: string): Promise<CharacterRecord | null> {
  const record = await tx.getActiveCharacterForUpdate(accountId);
  if (!record) return null;

  const orders = await tx.getOrders(accountId);
  const pension = await tx.getPension(accountId);
  const result = resolve({
    character: record.character,
    orders,
    unlocks: pension.unlocks,
    toTick: tickOf(new Date()),
    permitAppliedTick: record.permitAppliedTick,
  });

  if (result.ticksResolved === 0) return record;

  if (result.journal.length > 0) {
    await tx.appendJournal(
      result.journal.map((entry) => ({
        characterId: result.character.id,
        tick: entry.tick,
        at: entry.at,
        text: entry.text,
      })),
    );
  }

  const updated: CharacterRecord = {
    character: result.character,
    permitAppliedTick: result.permitAppliedTick,
    inventory: record.inventory,
  };
  await tx.saveCharacter(updated);

  if (result.death) {
    await tx.recordDeath(accountId, {
      id: randomUUID(),
      characterName: result.character.name,
      depth: result.death.depth,
      cause: result.death.cause,
      goldHandled: result.death.goldHandled,
      pensionAwarded: result.death.pensionAwarded,
      at: new Date().toISOString(),
    });
  }

  return updated;
}

export async function getLedger(repo: Repository, accountId: string): Promise<LedgerResponse> {
  return repo.transaction(async (tx) => {
    const record = await tx.getActiveCharacterForUpdate(accountId);
    const pension = await tx.getPension(accountId);
    const world = await tx.getWorld();
    return {
      inventory: record?.inventory ?? [],
      market: world.market,
      pension,
      unlocks: offers(pension.unlocks, pension.total),
    };
  });
}

function offers(owned: readonly UnlockId[], available: number): UnlockOffer[] {
  return UNLOCK_CATALOGUE.map((entry) => ({
    id: entry.id,
    label: entry.label,
    cost: entry.cost,
    owned: owned.includes(entry.id),
    affordable: !owned.includes(entry.id) && available >= entry.cost,
  }));
}

/** Prestige spend. Validated here because the client is never trusted with it. */
export async function purchaseUnlock(
  repo: Repository,
  accountId: string,
  id: UnlockId,
): Promise<{ pension: LedgerResponse['pension']; unlocks: UnlockOffer[] }> {
  const entry = UNLOCK_CATALOGUE.find((candidate) => candidate.id === id);
  if (!entry) throw new ServiceError('invalid_request', 'unknown unlock');

  return repo.transaction(async (tx) => {
    const pension = await tx.getPension(accountId);
    if (pension.unlocks.includes(id)) throw new ServiceError('already_owned', 'unlock already owned');
    if (pension.total < entry.cost) {
      throw new ServiceError('insufficient_pension', 'not enough pension');
    }

    const updated = {
      total: pension.total - entry.cost,
      spent: pension.spent + entry.cost,
      unlocks: [...pension.unlocks, id],
    };
    await tx.savePension(accountId, updated);
    return { pension: updated, unlocks: offers(updated.unlocks, updated.total) };
  });
}

/** "FILE FOR PENSION & CONTINUE": bank the award, take delivery of the next recruit. */
export async function claimPension(
  repo: Repository,
  accountId: string,
): Promise<ClaimPensionResponse> {
  return repo.transaction(async (tx) => {
    const record = await tx.getActiveCharacterForUpdate(accountId);
    if (record) throw new ServiceError('invalid_request', 'character is still alive');

    const death = await tx.getLatestDeath(accountId);
    if (!death) throw new ServiceError('not_found', 'no death on file');

    const pension = await tx.getPension(accountId);
    const banked = {
      total: pension.total + death.pensionAwarded,
      spent: pension.spent,
      unlocks: pension.unlocks,
    };
    await tx.savePension(accountId, banked);

    const recruitNum = nextRecruitNumber(death.characterName);
    const character = newRecruit(
      randomUUID(),
      accountId,
      recruitNum,
      banked.unlocks,
      tickOf(new Date()),
    );
    await tx.insertCharacter({
      character,
      permitAppliedTick: null,
      inventory: STARTING_INVENTORY.map((item) => ({ ...item })),
    });

    return { character, pension: banked, orders: await tx.getOrders(accountId) };
  });
}

/** Recruit ordinals are part of the joke, so they have to keep counting. */
function nextRecruitNumber(previousName: string): number {
  for (let n = 1; n < 200; n += 1) {
    if (recruitName(n) === previousName) return n + 1;
  }
  return 1;
}

export async function getBulletin(repo: Repository): Promise<BulletinResponse> {
  const world = await repo.getWorld();
  const deaths = await repo.listDeaths(12);
  return { world, deaths };
}

export async function getTavern(repo: Repository, sinceId: number): Promise<TavernResponse> {
  const messages = await repo.listTavern(sinceId, TAVERN_PAGE);
  const present = await repo.countActiveOfficers(PRESENCE_WINDOW_SECONDS);
  return { messages, present };
}

export async function sendTavernMessage(
  repo: Repository,
  accountId: string,
  body: string,
) {
  const trimmed = (body ?? '').trim();
  if (!trimmed || trimmed.length > 280) {
    throw new ServiceError('invalid_request', 'message must be 1-280 characters');
  }
  const account = await repo.getAccount(accountId);
  if (!account) throw new ServiceError('not_found', 'account not found');
  return repo.appendTavern(accountId, account.callsign, trimmed);
}

function secondsUntil(iso: string, now: Date): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - now.getTime()) / 1000));
}

export { HEARTBEAT_SECONDS };
