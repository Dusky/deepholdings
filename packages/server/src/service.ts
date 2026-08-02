import { randomUUID } from 'node:crypto';
import {
  BULK_FILING_MAX_STACKS,
  DEFAULT_ORDERS,
  MAX_CATCHUP_TICKS,
  HEARTBEAT_SECONDS,
  MAX_DEPTH,
  HOARD_SALE_BONUS,
  REQUISITION_CATALOGUE,
  RETIREMENT_MIN_SERVICE_TICKS,
  clampPolicy,
  clampRetreatPct,
  clauseById,
  isHired,
  staffSpec,
  formGoldCost,
  formSpec,
  UNLOCK_CATALOGUE,
  JOURNAL_PAGE_SIZE,
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
  type CaseFile,
  type Clause,
  type DeathRecord,
  type FileFormRequest,
  type FileFormResponse,
  type Filing,
  type AdvanceTimeResponse,
  type InventoryItem,
  type JournalEntry,
  type JournalResponse,
  type LadderEntry,
  type LadderOffer,
  type LedgerResponse,
  type LedgerStack,
  type LootPriority,
  type Office,
  type Pension,
  type PendingFiling,
  type Registry,
  type RegistryResponse,
  type StaffRole,
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
import { journalKind } from './domain/flavor.js';
import { resolve, tickOf, type ResolveCounters } from './domain/resolve.js';
import { runStaff } from './domain/staff.js';
import { advanceClock, now as worldNow } from './clock.js';
import type { CharacterRecord, Repository } from './ports.js';

export class ServiceError extends Error {
  constructor(
    readonly code:
      | 'not_found'
      | 'invalid_request'
      | 'insufficient_pension'
      | 'insufficient_gold'
      | 'insufficient_standing'
      | 'not_authorised'
      | 'already_owned'
      | 'character_dead',
    message: string,
  ) {
    super(message);
  }
}

/** Thirty days. Long enough to see the wall, short enough to finish. */
const MAX_ADVANCE_TICKS = 30 * 24 * 60;

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
    await tx.saveOrders(account.id, { ...DEFAULT_ORDERS });
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
    `Replacement recruit assigned: ${character.name}. Permit D-${character.permitTier} issued. Effects of the deceased were not recovered.`,
  );
}

function firstRecruit(accountId: string): CharacterRecord {
  return succeed({
    id: randomUUID(),
    accountId,
    previous: null,
    depthReached: 0,
    unlocks: [],
    atTick: tickOf(worldNow()),
  });
}

/**
 * The one read that matters. Resolves the missed ticks inside a transaction,
 * writes the journal, then returns everything a cold client needs.
 */
export async function loadState(
  repo: Repository,
  accountId: string,
  devTools = false,
): Promise<StateResponse> {
  const now = worldNow();

  return repo.transaction(async (tx) => {
    const account = await tx.getAccount(accountId);
    if (!account) throw new ServiceError('not_found', 'account not found');
    await tx.touchAccountSeen(accountId);

    const record = await tx.getActiveCharacterForUpdate(accountId);
    // A dead recruit still has a screen — the death overlay, and the button
    // that files for their pension. Loading only the *active* character meant
    // every request after the one they died in returned 404, so the game
    // bricked on the first death: no overlay, no way to claim, nothing to do
    // but reinstall. The branch below that surfaces a death "recorded on an
    // earlier request" has never been reachable.
    const existing = record ?? (await tx.getLatestCharacter(accountId));
    let pension = await tx.getPension(accountId);
    const office = await tx.getOffice(accountId);
    const orders = await tx.getOrders(accountId);
    const world = await tx.getWorld();

    let pendingDeath: DeathRecord | null = null;
    let current = existing;
    let digest: ShiftDigest | null = null;
    // Clearance is derived, so the "before" picture has to be taken before the
    // ticks are replayed — that difference is what gets journalled.
    const clearanceBefore: ScreenId[] = existing
      ? clearanceFor(existing.character, pension)
      : ['terminal'];

    if (record) {
      const result = resolve({
        character: record.character,
        inventory: record.inventory,
        orders,
        unlocks: pension.unlocks,
        toTick: tickOf(now),
        permitAppliedTick: record.permitAppliedTick,
        caseFiles: record.caseFiles,
        filings: record.filings,
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

      const worked = await applyStaff(
        tx,
        accountId,
        {
          character: result.character,
          permitAppliedTick: result.permitAppliedTick,
          inventory: result.inventory,
          caseFiles: result.caseFiles,
          filings: result.filings,
        },
        pension,
        result.ticksResolved,
      );
      current = worked.record;
      pension = worked.pension;

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
    const journal = withKinds(
      await tx.listJournal(current.character.id, -1, journalLines(office.requisitions)),
    );

    return {
      account,
      clearance: clearanceFor(current.character, pension),
      digest,
      ordersFiled: await tx.hasFiledOrders(accountId),
      caseFiles: current.caseFiles ?? [],
      filings: pendingFilings(current, now),
      registry: await tx.getRegistry(accountId),
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
      devTools,
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

/**
 * Forms in processing, with an honest wait.
 *
 * Same rule as the permit ETA: the number comes from the resolution tick the
 * filing already carries, not from a timer the client is asked to believe in.
 * A filing whose tick has passed but whose ruling has not been replayed yet
 * reports zero rather than a negative — it resolves on the next read, which is
 * usually the same request that produced this.
 */
function pendingFilings(record: CharacterRecord, now: Date): PendingFiling[] {
  if (!record.character.alive) return [];
  return (record.filings ?? []).map((filing) => ({
    id: filing.id,
    form: filing.form,
    caseFileId: filing.caseFileId,
    clauseIndex: filing.clauseIndex,
    bringsClauseId: filing.bringsClauseId,
    secondsRemaining: Math.max(
      0,
      Math.round((filing.resolvesTick * TICK_SECS * 1000 - now.getTime()) / 1000),
    ),
  }));
}

/**
 * Filing a form.
 *
 * Everything the form costs is taken here and never returned — the fee for
 * 12-C, and for 19 the entire donor case file. That is the design's risk made
 * literal: "Case dismissed. Fee retained." only means anything if the fee left
 * the account when the form went in, rather than being refunded on a bad
 * ruling. A wager settled in the player's favour when they lose is not a
 * wager.
 *
 * Form 19 cannot be dismissed, so nothing is lost to chance there — but the
 * donor still goes at filing rather than at resolution, for a different
 * reason: if it survived the four hours, the same file could be requisitioned
 * into two others at once and the officer would get two clauses for one file.
 */
export async function fileForm(
  repo: Repository,
  accountId: string,
  request: FileFormRequest,
): Promise<FileFormResponse> {
  const spec = formSpec(request.form);
  if (!spec) throw new ServiceError('invalid_request', 'unknown form');
  if (typeof request.caseFileId !== 'string' || !Number.isInteger(request.clauseIndex)) {
    throw new ServiceError('invalid_request', 'form requires a case file and a clause');
  }

  return repo.transaction(async (tx) => {
    // Resolve first, like every other mutation: a form filed against a clause
    // that this minute's catch-up already amended must fail here rather than
    // being queued against a file that no longer looks like that.
    const record =
      (await loadStateInside(tx, accountId)) ?? (await tx.getActiveCharacterForUpdate(accountId));
    if (!record) throw new ServiceError('character_dead', 'no living recruit');
    if (!record.character.alive) throw new ServiceError('character_dead', 'no living recruit');

    const file = record.caseFiles.find((candidate) => candidate.id === request.caseFileId);
    if (!file) throw new ServiceError('not_found', 'no such case file');

    const wasClauseId = file.clauseIds[request.clauseIndex];
    if (!wasClauseId) throw new ServiceError('invalid_request', 'no clause at that index');

    // One form per clause. Two forms racing the same slot would see the second
    // resolve against a clause the first had already replaced, and the honest
    // outcome there is a refusal rather than a wasted fee.
    const contested = (record.filings ?? []).some(
      (filing) =>
        filing.caseFileId === file.id && filing.clauseIndex === request.clauseIndex,
    );
    if (contested) throw new ServiceError('invalid_request', 'that clause is already before the panel');

    let donor: CaseFile | undefined;
    let brings: Clause | undefined;
    if (spec.id === '19') {
      donor = record.caseFiles.find((candidate) => candidate.id === request.donorCaseFileId);
      if (!donor) throw new ServiceError('not_found', 'no such case file to requisition');
      if (donor.id === file.id) {
        throw new ServiceError('invalid_request', 'a file cannot be requisitioned into itself');
      }
      brings = clauseById(donor.clauseIds[Number(request.donorClauseIndex)]);
      if (!brings) throw new ServiceError('invalid_request', 'no clause at that index on the donor');

      // A clause may not appear twice on one file, and may not sit above the
      // grade of the file carrying it — the same two rules a roll obeys. A
      // transfer that ignored them would make Form 19 the way to build a file
      // no drop could ever produce.
      if (file.clauseIds.some((id, at) => id === brings!.id && at !== request.clauseIndex)) {
        throw new ServiceError('invalid_request', 'that clause is already on the surviving file');
      }
      if (brings.minGrade > file.grade) {
        throw new ServiceError('invalid_request', 'the surviving file is not of a grade to carry it');
      }
      // The donor is about to be destroyed, so any form still processing
      // against it would resolve against nothing. Refuse rather than quietly
      // stranding a fee the officer already paid.
      const donorBusy = (record.filings ?? []).some((filing) => filing.caseFileId === donor!.id);
      if (donorBusy) {
        throw new ServiceError('invalid_request', 'that file is already before the panel');
      }
    }

    const gold = formGoldCost(spec, file.grade);
    if (record.character.gold < gold) throw new ServiceError('insufficient_gold', 'not enough gold');
    if (record.character.standing < spec.standing) {
      throw new ServiceError('insufficient_standing', 'not enough Union Standing');
    }

    const filedTick = record.character.lastResolvedTick;
    const filing: Filing = {
      id: randomUUID(),
      form: spec.id,
      caseFileId: file.id,
      clauseIndex: request.clauseIndex,
      filedTick,
      resolvesTick: filedTick + spec.ticks,
      wasClauseId,
      ...(brings ? { bringsClauseId: brings.id, donorName: `case ${donor!.id}` } : {}),
    };

    const character: Character = {
      ...record.character,
      gold: record.character.gold - gold,
      standing: record.character.standing - spec.standing,
    };
    const filings = [...(record.filings ?? []), filing];
    const caseFiles = donor
      ? record.caseFiles.filter((candidate) => candidate.id !== donor!.id)
      : record.caseFiles;
    await tx.saveCharacter({ ...record, character, caseFiles, filings });

    const clause = clauseById(wasClauseId);
    const hours = Math.round(spec.ticks / 60);
    await tx.appendJournal([
      entry_(
        character,
        spec.id === '19'
          ? `Form 19 filed. Case ${donor!.id} requisitioned into case ${file.id}: ` +
            `"${brings!.text}" to replace "${clause?.text ?? wasClauseId}". ` +
            `Fee ${gold} gold. ${donor!.name} has been struck from the register. ` +
            `Estimated processing: ${hours} hours.`
          : `Form ${spec.id} filed against case ${file.id}, contesting "${clause?.text ?? wasClauseId}". ` +
            `Fee ${gold} gold, Union Standing ${spec.standing}. Estimated processing: ${hours} hours.`,
      ),
    ]);

    return {
      filing: {
        id: filing.id,
        form: filing.form,
        caseFileId: filing.caseFileId,
        clauseIndex: filing.clauseIndex,
        bringsClauseId: filing.bringsClauseId,
        secondsRemaining: spec.ticks * TICK_SECS,
      },
      goldCharged: gold,
      standingCharged: spec.standing,
      character,
    };
  });
}

/**
 * Hiring.
 *
 * The cost is gold and it is not refundable, like every other thing the office
 * buys. There is deliberately no way to dismiss staff: the interesting decision
 * is whether you can carry the wage, and an undo turns that into a free trial.
 * A department that has outgrown its income downs tools until it is paid, which
 * is a state the officer can read and recover from.
 */
export async function hireStaff(
  repo: Repository,
  accountId: string,
  role: StaffRole,
): Promise<RegistryResponse> {
  const spec = staffSpec(role);
  if (!spec) throw new ServiceError('invalid_request', 'no such post');

  return repo.transaction(async (tx) => {
    const record =
      (await loadStateInside(tx, accountId)) ?? (await tx.getActiveCharacterForUpdate(accountId));
    if (!record) throw new ServiceError('character_dead', 'no living recruit');

    const registry = await tx.getRegistry(accountId);
    if (isHired(registry, role)) throw new ServiceError('already_owned', 'the post is filled');
    if (record.character.gold < spec.hire) {
      throw new ServiceError('insufficient_gold', 'not enough gold');
    }

    const character = { ...record.character, gold: record.character.gold - spec.hire };
    const updated: Registry = {
      staff: [...registry.staff, { role, policy: spec.policyDefault }],
      spent: registry.spent + spec.hire,
      unpaid: registry.unpaid,
    };
    await tx.saveCharacter({ ...record, character });
    await tx.saveRegistry(accountId, updated);
    await tx.appendJournal([
      entry_(
        character,
        `${spec.title} appointed to the registry. ${spec.hire} gold, and ${spec.upkeep} gold a minute thereafter.`,
      ),
    ]);

    return { registry: updated, gold: character.gold };
  });
}

/** Amending a standing instruction. Free — it is a form, not a purchase. */
export async function setStaffPolicy(
  repo: Repository,
  accountId: string,
  role: StaffRole,
  policy: number,
): Promise<RegistryResponse> {
  const spec = staffSpec(role);
  if (!spec) throw new ServiceError('invalid_request', 'no such post');

  return repo.transaction(async (tx) => {
    const registry = await tx.getRegistry(accountId);
    if (!isHired(registry, role)) throw new ServiceError('not_found', 'the post is vacant');

    const updated: Registry = {
      ...registry,
      staff: registry.staff.map((member) =>
        member.role === role ? { ...member, policy: clampPolicy(role, policy) } : member,
      ),
    };
    await tx.saveRegistry(accountId, updated);
    const record = await tx.getActiveCharacterForUpdate(accountId);
    return { registry: updated, gold: record?.character.gold ?? 0 };
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

/**
 * The department works the span that was just resolved.
 *
 * After resolution rather than inside it, because the Junior Officer spends
 * pension and the Filing Clerk reads the cabinet — see `domain/staff.ts`.
 *
 * One function for both read paths on purpose. `loadState` and
 * `loadStateInside` each resolve independently — `loadState` needs the digest
 * and the clearance diff, which the write path has no use for — and staff
 * bolted onto one of them would have been a department that worked when you
 * sold something and not when you opened the app, or the reverse. Whichever
 * half was missed, the symptom would have been "sometimes my clerk does
 * nothing", which is close to unreportable.
 *
 * Returns the record *and* the pension, both unchanged when nothing happened.
 * The pension has to come back because the Junior Officer spends it: a caller
 * that kept the copy it read before resolution would answer the request with a
 * balance the officer had already been charged against, and the redemption
 * would appear to un-happen until the next refresh.
 */
async function applyStaff(
  tx: Repository,
  accountId: string,
  record: CharacterRecord,
  pension: Pension,
  ticksResolved: number,
): Promise<{ record: CharacterRecord; pension: Pension }> {
  if (ticksResolved <= 0) return { record, pension };
  const registry = await tx.getRegistry(accountId);
  if (registry.staff.length === 0) return { record, pension };

  const worked = runStaff({
    character: record.character,
    inventory: record.inventory,
    caseFiles: record.caseFiles,
    filings: record.filings,
    pension,
    registry,
    ticksResolved,
    newId: randomUUID,
  });
  if (!worked.changed) return { record, pension };

  await tx.saveRegistry(accountId, worked.registry);
  // Compared by content rather than identity: `runStaff` copies the pension
  // whether or not the officer bought anything, so a reference check would
  // write it on every read forever.
  if (worked.pension.total !== pension.total || worked.pension.spent !== pension.spent) {
    await tx.savePension(accountId, worked.pension);
  }
  if (worked.notes.length > 0) {
    await tx.appendJournal(
      worked.notes.map((text, i) => ({
        characterId: worked.character.id,
        tick: worked.character.lastResolvedTick,
        at: new Date(Date.now() + i),
        text,
      })),
    );
  }

  return {
    record: {
      ...record,
      character: worked.character,
      inventory: worked.inventory,
      caseFiles: worked.caseFiles,
      filings: worked.filings,
    },
    pension: worked.pension,
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
    toTick: tickOf(worldNow()),
    permitAppliedTick: record.permitAppliedTick,
    caseFiles: record.caseFiles,
    filings: record.filings,
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

  let updated: CharacterRecord = {
    character: result.character,
    permitAppliedTick: result.permitAppliedTick,
    inventory: result.inventory,
    caseFiles: result.caseFiles,
    filings: result.filings,
  };

  updated = (await applyStaff(tx, accountId, updated, pension, result.ticksResolved)).record;

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
    let pension = await tx.getPension(accountId);
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
    atTick: tickOf(worldNow()),
  });
  await tx.insertCharacter(record);
  await tx.appendJournal([replacementEntry(record.character)]);

  return {
    character: record.character,
    pension: banked,
    orders: await tx.getOrders(accountId),
  };
}


/**
 * Page backwards through the current recruit's journal.
 *
 * Scoped to the account's own recruit, never an id the client happened to
 * guess: `before` selects a position in *this* character's file and nothing
 * else. Always available at every tier of Extended Journal Retention, which
 * buys how much arrives unasked rather than how far back reading is permitted.
 */
export async function getJournalPage(
  repo: Repository,
  accountId: string,
  before: string,
): Promise<JournalResponse> {
  if (!/^\d+$/.test(before)) {
    throw new ServiceError('invalid_request', 'before must be an entry id');
  }

  return repo.transaction(async (tx) => {
    const record = await tx.getLatestCharacter(accountId);
    if (!record) throw new ServiceError('not_found', 'no character');

    // One extra tells us whether anything remains, without a second count.
    const found = await tx.listJournalBefore(
      record.character.id,
      before,
      JOURNAL_PAGE_SIZE + 1,
    );
    const hasMore = found.length > JOURNAL_PAGE_SIZE;
    return { entries: withKinds(hasMore ? found.slice(1) : found), hasMore };
  });
}

/**
 * Developer time travel.
 *
 * There is no new simulation here, and there must not be. Advancing moves the
 * world clock forward and lets the ordinary resolver catch up to it — so a
 * fast-forwarded career is bit-for-bit the career a real absence of that
 * length produces, including its journal, its permits and its deaths.
 *
 * It runs in catch-up-sized chunks because a single span longer than
 * `MAX_CATCHUP_TICKS` is deliberately summarised rather than simulated. Ten
 * days advanced in one call would produce a recess note and nothing else, which
 * is the opposite of what a playtester wants to look at.
 *
 * **This used to wind the character backwards instead**, on the reasoning that
 * moving the recruit relative to a fixed now is the same as moving now. It is
 * not, and the difference is the whole point of the endpoint. Every tick is
 * seeded from `tickSeed(characterId, tick)`, so rewinding to the same absolute
 * window replays the same seeds: six one-hour advances simulated the same hour
 * six times, and the journal proved it — sixty entries across twenty-eight
 * distinct ticks spanning fifty-nine minutes. A recruit fast-forwarded through
 * a fortnight lived one hour, over and over, and died only if that particular
 * hour killed them. Death rates measured through the old endpoint came out
 * about sixteen times too low.
 */
export async function advanceTime(
  repo: Repository,
  accountId: string,
  ticks: number,
): Promise<AdvanceTimeResponse> {
  if (!Number.isInteger(ticks) || ticks < 1 || ticks > MAX_ADVANCE_TICKS) {
    throw new ServiceError(
      'invalid_request',
      `advance by 1 to ${MAX_ADVANCE_TICKS} ticks (${MAX_ADVANCE_TICKS / 60} hours)`,
    );
  }

  let advanced = 0;
  let died = false;

  while (advanced < ticks && !died) {
    const chunk = Math.min(MAX_CATCHUP_TICKS, ticks - advanced);
    advanceClock(chunk);
    const resolved = await repo.transaction((tx) => loadStateInside(tx, accountId));
    advanced += chunk;
    died = !resolved || !resolved.character.alive;
  }

  // The death record and the successor are the ordinary flow's business, so a
  // fast-forwarded death lands on the same overlay a real one does.
  const state = await loadState(repo, accountId);
  return { ticksAdvanced: advanced, died, character: state.character };
}

/**
 * Registers a device for push.
 *
 * The platform string is recorded but not validated against a list: a new
 * Capacitor target should be able to register before this file has heard of
 * it, and nothing here branches on the value.
 */
export async function registerPushToken(
  repo: Repository,
  accountId: string,
  token: unknown,
  platform: unknown,
): Promise<{ registered: true }> {
  const value = typeof token === 'string' ? token.trim() : '';
  // 4096 is well above any FCM registration token and well below anything
  // worth storing by accident.
  if (value.length === 0 || value.length > 4096) {
    throw new ServiceError('invalid_request', 'a push token is required');
  }
  const kind = typeof platform === 'string' && platform.trim() ? platform.trim().slice(0, 32) : 'unknown';
  await repo.savePushToken(accountId, value, kind);
  return { registered: true };
}

/**
 * Unregisters a device.
 *
 * Deliberately not scoped to the calling account: a token names one device,
 * the device is asking to stop being rung, and refusing because the row is
 * filed under a previous owner would leave a phone permanently subscribed to
 * somebody else's deaths.
 */
export async function unregisterPushToken(
  repo: Repository,
  token: unknown,
): Promise<{ registered: false }> {
  const value = typeof token === 'string' ? token.trim() : '';
  if (value) await repo.deletePushTokens([value]);
  return { registered: false };
}

/**
 * Simulates a night's absence: time passes, and nobody reads it.
 *
 * Dev only, and it exists because the death sweep is otherwise close to
 * untestable by hand. The sweep wants two things at once — an account unread
 * for fifteen minutes, *and* unresolved ticks containing a death — and there
 * is no ordinary way to produce the second without producing a read. Every
 * other path through the server resolves as a side effect of looking:
 * `/v1/dev/advance` advances the clock and then immediately catches up, so it
 * leaves nothing outstanding, which is the opposite of what is wanted here.
 *
 * So this moves the world clock forward and does *not* read. Both halves are
 * the real mechanism rather than a special case: `last_seen_at` is genuinely
 * backdated, the sweep's own filter is untouched, and the ticks waiting
 * afterwards are ticks that genuinely have not been resolved.
 *
 * Capped at the catch-up window. Past `MAX_CATCHUP_TICKS` a replay is
 * summarised into a recess note instead of simulated, so a longer absence
 * would test the summariser rather than the sweep.
 */
export async function devMakeAway(
  repo: Repository,
  accountId: string,
  hours = 4,
): Promise<{ away: true; hoursElapsed: number }> {
  const requested = Number.isFinite(Number(hours)) ? Number(hours) : 4;
  const ticks = Math.min(MAX_CATCHUP_TICKS, Math.max(1, Math.round(requested * 60)));
  advanceClock(ticks);
  await repo.markAwayForTesting(accountId, 3600);
  return { away: true, hoursElapsed: ticks / 60 };
}

/**
 * Tags each line with what sort of line it is, so the client can colour it.
 *
 * Done on read rather than on write: no migration, and it applies to every
 * journal already on disk. The cost is running a handful of regexes over at
 * most a few hundred rows per request, which is nothing next to the resolve
 * that produced them.
 */
function withKinds(entries: readonly JournalEntry[]): JournalEntry[] {
  return entries.map((entry) => ({ ...entry, kind: journalKind(entry.text) }));
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
