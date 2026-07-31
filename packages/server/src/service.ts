import { randomUUID } from 'node:crypto';
import {
  BULK_FILING_MAX_STACKS,
  HEARTBEAT_SECONDS,
  MAX_DEPTH,
  HOARD_SALE_BONUS,
  REQUISITION_CATALOGUE,
  RETIREMENT_MIN_SERVICE_TICKS,
  clampRetreatPct,
  UNLOCK_CATALOGUE,
  journalLines,
  pensionAward,
  requisitionTier,
  TICK_SECONDS,
  type Account,
  type BulkSellRequest,
  type BulkSellResponse,
  type BulletinResponse,
  type Character,
  type ClaimPensionResponse,
  type DeathRecord,
  type InventoryItem,
  type LadderEntry,
  type LadderOffer,
  type LedgerResponse,
  type LedgerStack,
  type LootPriority,
  type Office,
  type PurchaseRequisitionResponse,
  type RequisitionId,
  type StandingOrders,
  type WorldState,
  permitProcessingTicks,
  unlockTier,
  TICK_SECONDS as TICK_SECS,
  permitDepthLimit,
  type PendingPermit,
  type RetirementOffer,
  type ScreenId,
  type SellItemResponse,
  type ShiftDigest,
  type StateResponse,
  type TavernResponse,
  type UnlockId,
  type UnlockOffer,
} from '@deepholdings/shared';
import { succeed } from './domain/character.js';
import { clearanceFor, clearanceGrantedText } from './domain/clearance.js';
import { resolve, tickOf, type ResolveCounters } from './domain/resolve.js';
import type { CharacterRecord, Repository } from './ports.js';

export class ServiceError extends Error {
  constructor(
    readonly code:
      | 'not_found'
      | 'invalid_request'
      | 'insufficient_pension'
      | 'insufficient_gold'
      | 'not_authorised'
      | 'already_owned'
      | 'character_dead',
    message: string,
  ) {
    super(message);
  }
}

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
  return succeed({
    id: randomUUID(),
    accountId,
    previous: null,
    depthReached: 0,
    unlocks: [],
    atTick: tickOf(new Date()),
  });
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
    const office = await tx.getOffice(accountId);
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

    // Extended Journal Retention buys more of this, and nothing else does.
    const journal = await tx.listJournal(
      current.character.id,
      -1,
      journalLines(office.requisitions),
    );

    return {
      account,
      clearance: clearanceFor(current.character, pension),
      digest,
      ordersFiled: await tx.hasFiledOrders(accountId),
      pendingPermit: pendingPermitOf(current, pension.unlocks, now),
      retirement: retirementOffer(current, pension.unlocks),
      character: current.character,
      orders,
      pension,
      office,
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
/** What Form R-1 would pay for this recruit right now. */
function retirementOffer(
  record: CharacterRecord,
  unlocks: readonly UnlockId[],
): RetirementOffer | null {
  if (!record.character.alive) return null;

  const serviceTicks = Math.max(0, record.character.lastResolvedTick - record.character.bornTick);
  const estate =
    record.character.gold +
    record.inventory.reduce((total, item) => total + item.unitValue * item.quantity, 0);

  return {
    eligible: serviceTicks >= RETIREMENT_MIN_SERVICE_TICKS,
    serviceTicks,
    minServiceTicks: RETIREMENT_MIN_SERVICE_TICKS,
    award: pensionAward(serviceTicks, record.character.depth, estate, unlocks),
  };
}

function pendingPermitOf(
  record: CharacterRecord,
  unlocks: readonly UnlockId[],
  now: Date,
): PendingPermit | null {
  if (record.permitAppliedTick === null || !record.character.alive) return null;

  const readyTick = record.permitAppliedTick + permitProcessingTicks(unlocks);
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
    !Number.isFinite(retreatPct) || retreatPct < 1 || retreatPct > 100 ||
    !lootOk || !spendOk
  ) {
    throw new ServiceError('invalid_request', 'invalid standing orders');
  }

  return {
    targetDepth,
    // Clamped rather than rejected: orders filed before the slider was narrowed
    // are stored anywhere in 5-80, and an old client putting one back should
    // not get a 400. Nothing is lost — 60 and 45 resolve identically.
    retreatPct: clampRetreatPct(retreatPct),
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
    const office = await tx.getOffice(accountId);
    const world = await tx.getWorld();
    const orders = await tx.getOrders(accountId);
    const gold = record?.character.gold ?? 0;
    return {
      inventory: quote(record?.inventory ?? [], world, orders),
      market: world.market,
      pension,
      unlocks: ladderOffers(UNLOCK_CATALOGUE, pension.unlocks, pension.total),
      gold,
      office,
      requisitions: ladderOffers(REQUISITION_CATALOGUE, office.requisitions, gold),
    };
  });
}

/**
 * One offer per track: the next unbought rung, or the top rung marked owned.
 *
 * Showing every tier at once would be a wall the officer has to read on every
 * visit, and most of it is unreachable. The ladder is legible precisely because
 * only the next step is on it.
 *
 * Shared by both currencies — the pension ladder and the gold one differ in
 * what pays for them, not in how they are climbed.
 */
function ladderOffers<Id extends string, Track extends string>(
  catalogue: readonly LadderEntry<Id, Track>[],
  owned: readonly Id[],
  available: number,
): LadderOffer<Id, Track>[] {
  const tracks = [...new Set(catalogue.map((entry) => entry.track))];
  return tracks.map((track) => {
    const rungs = catalogue.filter((entry) => entry.track === track);
    const next = rungs.find((entry) => !owned.includes(entry.id));
    const shown = next ?? rungs[rungs.length - 1];
    const complete = next === undefined;
    return {
      id: shown.id,
      track,
      tier: shown.tier,
      maxTier: rungs[rungs.length - 1].tier,
      label: shown.label,
      detail: shown.detail,
      cost: shown.cost,
      owned: complete,
      affordable: !complete && available >= shown.cost,
    };
  });
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

const LOOT_CATEGORIES: readonly LootPriority[] = ['gold', 'gear', 'relics', 'knowledge'];

/**
 * Bulk Filing Authorisation: clear many stacks on one form.
 *
 * This saves taps and nothing else — every stack it sells could be sold one at
 * a time, at exactly the same price, by an officer who never requisitioned
 * anything. That is the whole test a requisition has to pass.
 *
 * A selector is mandatory. "Sell everything" is deliberately not expressible:
 * a one-tap irreversible liquidation of the entire cabinet is the kind of
 * button players press by accident once and never forgive.
 */
export async function bulkSell(
  repo: Repository,
  accountId: string,
  request: BulkSellRequest,
): Promise<BulkSellResponse> {
  const { category, maxUnitValue } = request;
  const byCategory = category !== undefined;
  const byValue = maxUnitValue !== undefined;

  if (byCategory === byValue) {
    throw new ServiceError('invalid_request', 'exactly one selector required');
  }
  if (byCategory && !LOOT_CATEGORIES.includes(category)) {
    throw new ServiceError('invalid_request', 'unknown category');
  }
  if (byValue && (!Number.isFinite(maxUnitValue) || maxUnitValue < 0)) {
    throw new ServiceError('invalid_request', 'invalid threshold');
  }

  return repo.transaction(async (tx) => {
    const office = await tx.getOffice(accountId);
    const tier = requisitionTier(office.requisitions, 'bulk');
    // Tier I files by category; the value threshold is what tier II adds.
    const required = byValue ? 2 : 1;
    if (tier < required) {
      throw new ServiceError('not_authorised', `Bulk Filing Authorisation ${'I'.repeat(required)} not held`);
    }

    // Resolve first, exactly as a single sale does: a disposal must not race a
    // tick that adds to the cabinet.
    const record =
      (await loadStateInside(tx, accountId)) ?? (await tx.getActiveCharacterForUpdate(accountId));
    if (!record) throw new ServiceError('character_dead', 'no living recruit');

    const orders = await tx.getOrders(accountId);
    const world = await tx.getWorld();

    const matches = record.inventory
      .filter((item) =>
        byCategory ? item.category === category : item.unitValue <= (maxUnitValue as number),
      )
      .slice(0, BULK_FILING_MAX_STACKS);

    let goldReceived = 0;
    let sold = 0;
    for (const item of matches) {
      goldReceived += Math.round(
        item.unitValue * item.quantity * saleRate(world, item.category, orders),
      );
      sold += item.quantity;
    }

    const cleared = new Set(matches.map((item) => item.name));
    const inventory = record.inventory.filter((item) => !cleared.has(item.name));
    const character = { ...record.character, gold: record.character.gold + goldReceived };
    await tx.saveCharacter({ ...record, character, inventory });

    if (matches.length > 0) {
      const what = byCategory ? `all ${category}` : `everything under ${maxUnitValue}g a unit`;
      await tx.appendJournal([
        entry_(
          character,
          `Bulk disposal filed: ${what}. ${matches.length} stacks, ${sold} items, ${goldReceived} gold. The clerk did not look up.`,
        ),
      ]);
    }

    return {
      stacks: matches.length,
      sold,
      goldReceived,
      gold: character.gold,
      inventory: quote(inventory, world, orders),
    };
  });
}

/**
 * Requisition office equipment with gold.
 *
 * The gold comes out of the living recruit's purse, which is the point: it is
 * the only way to move value out of a career that would otherwise convert to
 * pension the moment it ends. Buying a desk is choosing not to bank.
 */
export async function purchaseRequisition(
  repo: Repository,
  accountId: string,
  id: RequisitionId,
): Promise<PurchaseRequisitionResponse> {
  const entry = REQUISITION_CATALOGUE.find((candidate) => candidate.id === id);
  if (!entry) throw new ServiceError('invalid_request', 'unknown requisition');

  return repo.transaction(async (tx) => {
    const office = await tx.getOffice(accountId);
    if (office.requisitions.includes(id)) {
      throw new ServiceError('already_owned', 'requisition already filed');
    }
    if (requisitionTier(office.requisitions, entry.track) !== entry.tier - 1) {
      throw new ServiceError('invalid_request', 'previous tier not held');
    }

    // Resolve before reading the purse, or a returning officer is told they
    // cannot afford something the last hour already paid for.
    const record =
      (await loadStateInside(tx, accountId)) ?? (await tx.getActiveCharacterForUpdate(accountId));
    if (!record) throw new ServiceError('character_dead', 'no living recruit');
    if (record.character.gold < entry.cost) {
      throw new ServiceError('insufficient_gold', 'not enough gold');
    }

    const character = { ...record.character, gold: record.character.gold - entry.cost };
    const updated: Office = {
      spent: office.spent + entry.cost,
      requisitions: [...office.requisitions, id],
    };
    await tx.saveCharacter({ ...record, character });
    await tx.saveOffice(accountId, updated);
    await tx.appendJournal([
      entry_(
        character,
        `Requisition approved: ${entry.label}. ${entry.cost} gold drawn. Delivery to your desk, eventually.`,
      ),
    ]);

    return {
      office: updated,
      requisitions: ladderOffers(REQUISITION_CATALOGUE, updated.requisitions, character.gold),
      gold: character.gold,
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
    // Ladders are climbed in order. Without this a client could post `permits3`
    // directly and buy the top rung at the top rung's price.
    if (unlockTier(pension.unlocks, entry.track) !== entry.tier - 1) {
      throw new ServiceError('invalid_request', 'previous tier not held');
    }
    if (pension.total < entry.cost) {
      throw new ServiceError('insufficient_pension', 'not enough pension');
    }

    const updated = {
      total: pension.total - entry.cost,
      spent: pension.spent + entry.cost,
      unlocks: [...pension.unlocks, id],
    };
    await tx.savePension(accountId, updated);
    return { pension: updated, unlocks: ladderOffers(UNLOCK_CATALOGUE, updated.unlocks, updated.total) };
  });
}

/**
 * Form R-1: retire the current recruit on purpose.
 *
 * Without this the only way to bank a pension and start again is to write
 * standing orders you know will kill somebody, which is a miserable thing to
 * make the intended progression path. Retirement pays exactly what death would
 * — service, depth reached, and the estate — so it is not a bonus, it is a
 * *choice*: dying is the same award taken at a moment you did not pick, with
 * whatever the recruit was carrying at the time.
 *
 * The recruit is recorded in the death feed as a separation rather than a
 * casualty, so the Bulletin does not claim they died.
 */
export async function retireRecruit(
  repo: Repository,
  accountId: string,
): Promise<ClaimPensionResponse> {
  return repo.transaction(async (tx) => {
    // Resolve first: retiring must not discard ticks the officer already earned.
    const record = (await loadStateInside(tx, accountId)) ?? null;
    if (!record || !record.character.alive) {
      throw new ServiceError('character_dead', 'no living recruit');
    }

    const service = record.character.lastResolvedTick - record.character.bornTick;
    if (service < RETIREMENT_MIN_SERVICE_TICKS) {
      throw new ServiceError(
        'invalid_request',
        `separation requires ${RETIREMENT_MIN_SERVICE_TICKS} minutes of service`,
      );
    }

    const pension = await tx.getPension(accountId);
    const estate =
      record.character.gold +
      record.inventory.reduce((total, item) => total + item.unitValue * item.quantity, 0);
    const award = pensionAward(service, record.character.depth, estate, pension.unlocks);

    const separation: DeathRecord = {
      id: randomUUID(),
      characterName: record.character.name,
      depth: record.character.depth,
      cause: 'honourable separation (Form R-1)',
      goldHandled: record.character.gold,
      pensionAwarded: award,
      at: new Date().toISOString(),
    };
    await tx.saveCharacter({
      ...record,
      character: { ...record.character, alive: false, hp: record.character.hp },
    });
    await tx.appendJournal([
      entry_(
        record.character,
        `Form R-1 filed. ${record.character.name} retires on Floor ${record.character.depth} after ${service} minutes of service. Pension assessed at ${award}. Nobody claps.`,
      ),
    ]);
    await tx.recordDeath(accountId, separation);

    return claimInside(tx, accountId, separation);
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

    return claimInside(tx, accountId, death);
  });
}

/**
 * Bank an award and take delivery of the successor.
 *
 * Shared by death and by Form R-1 so the two paths cannot drift: the only
 * difference between them is who decided the career was over.
 */
async function claimInside(
  tx: Repository,
  accountId: string,
  award: DeathRecord,
): Promise<ClaimPensionResponse> {
  const pension = await tx.getPension(accountId);
  const banked = {
    total: pension.total + award.pensionAwarded,
    spent: pension.spent,
    unlocks: pension.unlocks,
  };
  await tx.savePension(accountId, banked);

  // The deceased is no longer the *active* character, so it has to be fetched
  // deliberately. Without this the successor is issued off the street at Grade
  // I with Permit D-1 — every measurement of what death costs assumed a case
  // file the server was quietly throwing away.
  const previous = await tx.getLatestCharacter(accountId);

  const record = succeed({
    id: randomUUID(),
    accountId,
    previous: previous?.character ?? null,
    depthReached: award.depth,
    unlocks: banked.unlocks,
    atTick: tickOf(new Date()),
  });
  await tx.insertCharacter(record);
  await tx.appendJournal([replacementEntry(record.character)]);

  return {
    character: record.character,
    pension: banked,
    orders: await tx.getOrders(accountId),
  };
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
