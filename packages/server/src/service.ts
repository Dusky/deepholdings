import { randomUUID } from 'node:crypto';
import {
  HEARTBEAT_SECONDS,
  MAX_DEPTH,
  HOARD_SALE_BONUS,
  UNLOCK_CATALOGUE,
  TICK_SECONDS,
  type Account,
  type BulletinResponse,
  type Character,
  type ClaimPensionResponse,
  type DeathRecord,
  type InventoryItem,
  type LedgerResponse,
  type LedgerStack,
  type LootPriority,
  type StandingOrders,
  type WorldState,
  PERMIT_PROCESSING_TICKS,
  PERMIT_PROCESSING_TICKS_FAST,
  TICK_SECONDS as TICK_SECS,
  permitDepthLimit,
  type PendingPermit,
  type ScreenId,
  type SellItemResponse,
  type ShiftDigest,
  type StateResponse,
  type TavernResponse,
  type UnlockId,
  type UnlockOffer,
} from '@deepholdings/shared';
import { newRecruit, recruitName, STARTING_INVENTORY } from './domain/character.js';
import { clearanceFor, clearanceGrantedText } from './domain/clearance.js';
import { resolve, tickOf, type ResolveCounters } from './domain/resolve.js';
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
    const recruit = firstRecruit(account.id);
    await tx.insertCharacter(recruit);
    await tx.appendJournal(onboardingEntries(recruit.character));
    return account;
  });
}

function entry_(character: Character, text: string, offset = 0) {
  return entry(character, text, offset);
}

function entry(character: Character, text: string, offset = 0) {
  return {
    characterId: character.id,
    tick: character.lastResolvedTick,
    at: new Date(Date.now() + offset),
    text,
  };
}

/**
 * The first thing a new officer reads.
 *
 * A brand-new account has no resolved ticks, so without this the flagship
 * screen is blank. It also carries the onboarding: what you have, what you
 * control, and — the line that matters most — that death is how progress is
 * banked. "Not obvious when or why to prestige" is a standing complaint across
 * the genre, and it costs nothing to say so up front, in voice.
 */
function onboardingEntries(character: Character) {
  return [
    entry(
      character,
      `Case file opened. ${character.name} assigned as your recruit. Permit D-${character.permitTier} issued. Do not lose the permit.`,
      0,
    ),
    entry(
      character,
      'Your recruit descends without supervision. You file the orders; they file the paperwork. Form SO-1 governs depth, retreat, loot and spending.',
      1,
    ),
    entry(
      character,
      'Pensions are paid on death and are permanent. Your recruit is not. Plan accordingly.',
      2,
    ),
  ];
}

function replacementEntry(character: Character) {
  return entry(
    character,
    `Replacement recruit assigned: ${character.name}. Permit D-${character.permitTier} issued. Effects of the deceased remain in Arbitration.`,
  );
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
    let digest: ShiftDigest | null = null;
    // Clearance is derived, so the "before" picture has to be taken before the
    // ticks are replayed — that difference is what gets journalled.
    const clearanceBefore: ScreenId[] = record
      ? clearanceFor(record.character, pension)
      : ['terminal'];

    if (record) {
      const result = resolve({
        character: record.character,
        inventory: record.inventory,
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
        inventory: result.inventory,
      };

      if (result.ticksResolved > 0) {
        await tx.saveCharacter(current);
        digest = digestOf(result.counters, result.ticksResolved, Boolean(result.death));
      }

      // New screens are announced in the log, so clearance feels granted
      // rather than silently appearing.
      const granted = clearanceFor(result.character, pension).filter(
        (screen) => !clearanceBefore.includes(screen),
      );
      if (granted.length > 0) {
        await tx.appendJournal(
          granted.map((screen, i) => ({
            characterId: result.character.id,
            tick: result.character.lastResolvedTick,
            at: new Date(Date.now() + i),
            text: clearanceGrantedText(screen),
          })),
        );
      }

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
      clearance: clearanceFor(current.character, pension),
      digest,
      ordersFiled: await tx.hasFiledOrders(accountId),
      pendingPermit: pendingPermitOf(current, pension.unlocks.includes('permits'), now),
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

/**
 * Worth showing only if enough happened to be worth reading. A player who
 * tabbed away for two minutes does not need a summary of two minutes.
 */
const DIGEST_MIN_TICKS = 15;

function digestOf(
  counters: ResolveCounters,
  ticksResolved: number,
  died: boolean,
): ShiftDigest | null {
  if (ticksResolved < DIGEST_MIN_TICKS && !died) return null;
  return {
    minutes: Math.round((ticksResolved * TICK_SECONDS) / 60),
    goldDelta: counters.goldAfter - counters.goldBefore,
    levelsGained: counters.levelsGained,
    deepestFloor: counters.deepestFloor,
    encounters: counters.encounters,
    acquisitions: counters.acquisitions,
    permitsApproved: counters.permitsApproved,
    died,
  };
}

/**
 * When the permit office will get round to it. Null when nothing is filed.
 */
function pendingPermitOf(
  record: CharacterRecord,
  fastPermits: boolean,
  now: Date,
): PendingPermit | null {
  if (record.permitAppliedTick === null || !record.character.alive) return null;

  const processing = fastPermits ? PERMIT_PROCESSING_TICKS_FAST : PERMIT_PROCESSING_TICKS;
  const readyTick = record.permitAppliedTick + processing;
  const readyAt = new Date(readyTick * TICK_SECS * 1000);
  const tier = record.character.permitTier + 1;

  return {
    tier,
    authorisesDepth: permitDepthLimit(tier),
    readyAt: readyAt.toISOString(),
    secondsRemaining: Math.max(0, Math.round((readyAt.getTime() - now.getTime()) / 1000)),
  };
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
    await tx.saveOrders(accountId, clean, { markFiled: true });
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
    inventory: record.inventory,
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
    inventory: result.inventory,
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

/** Par for anything the market has no quote for, rather than a free item. */
function demandFor(world: WorldState, category: LootPriority): number {
  return world.market.find((quote) => quote.category === category)?.demand ?? 1;
}

/** What the depot pays per unit right now, demand and spend policy included. */
function saleRate(world: WorldState, category: LootPriority, orders: StandingOrders): number {
  return demandFor(world, category) * (orders.spendPolicy === 'hoard' ? HOARD_SALE_BONUS : 1);
}

function quote(
  inventory: readonly InventoryItem[],
  world: WorldState,
  orders: StandingOrders,
): LedgerStack[] {
  return inventory.map((item) => {
    const rate = saleRate(world, item.category, orders);
    return {
      ...item,
      unitOffer: Math.round(item.unitValue * rate),
      stackOffer: Math.round(item.unitValue * item.quantity * rate),
    };
  });
}

export async function getLedger(repo: Repository, accountId: string): Promise<LedgerResponse> {
  return repo.transaction(async (tx) => {
    const record = await tx.getActiveCharacterForUpdate(accountId);
    const pension = await tx.getPension(accountId);
    const world = await tx.getWorld();
    const orders = await tx.getOrders(accountId);
    return {
      inventory: quote(record?.inventory ?? [], world, orders),
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

/**
 * Sells from the filing cabinet. Server-priced, server-validated: the client
 * says what and how many, never what it is worth.
 */
export async function sellItem(
  repo: Repository,
  accountId: string,
  name: string,
  quantity?: number,
): Promise<SellItemResponse> {
  if (!name || typeof name !== 'string') {
    throw new ServiceError('invalid_request', 'name required');
  }

  return repo.transaction(async (tx) => {
    // Resolve first: a sale must not race a tick that changes the cabinet.
    const record = (await loadStateInside(tx, accountId)) ?? (await tx.getActiveCharacterForUpdate(accountId));
    if (!record) throw new ServiceError('character_dead', 'no living recruit');

    const orders = await tx.getOrders(accountId);
    const entry = record.inventory.find((item) => item.name === name);
    if (!entry) throw new ServiceError('not_found', 'no such item on file');

    // Whole units only. Rounding a fractional request would quietly sell
    // something other than what was asked for.
    const wanted = quantity === undefined ? entry.quantity : Number(quantity);
    if (!Number.isInteger(wanted) || wanted < 1 || wanted > entry.quantity) {
      throw new ServiceError('invalid_request', 'invalid quantity');
    }

    // Price at the world's published demand for this category, so the number
    // on the MARKET column is the number the depot actually pays.
    const world = await tx.getWorld();
    const goldReceived = Math.round(
      entry.unitValue * wanted * saleRate(world, entry.category, orders),
    );

    entry.quantity -= wanted;
    entry.note = `x${entry.quantity}`;
    const inventory = record.inventory.filter((item) => item.quantity > 0);

    const character = { ...record.character, gold: record.character.gold + goldReceived };
    await tx.saveCharacter({ ...record, character, inventory });
    await tx.appendJournal([
      entry_(character, `Sold ${wanted} x ${name} for ${goldReceived} gold. Receipt filed in triplicate.`),
    ]);

    return {
      sold: wanted,
      goldReceived,
      gold: character.gold,
      inventory: quote(inventory, world, orders),
    };
  });
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
    await tx.appendJournal([replacementEntry(character)]);

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
