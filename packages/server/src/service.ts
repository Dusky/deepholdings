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
  COMMENDATION_CATALOGUE,
  PENSION_PER_COMMENDATION,
  clampPolicy,
  commendationAward,
  commendationTier,
  clampRetreatPct,
  expediteCost,
  ASSIGNMENT_CATALOGUE,
  assignmentComplete,
  assignmentProgress,
  assignmentSpec,
  contributionOf,
  guildShare,
  objectiveForCycle,
  authorisedSite,
  siteAuthorised,
  SITE_CATALOGUE,
  clauseById,
  isHired,
  nextStaffRung,
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
  type CommendationId,
  type StaffRole,
  type Transfer,
  type TransferResponse,
  type PurchaseRequisitionResponse,
  type RequisitionId,
  type AssignmentId,
  type AssignmentRestriction,
  type AssignmentState,
  type SiteId,
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
import { guidanceFor } from './domain/guidance.js';
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
    const transfer = await tx.getTransfer(accountId);
    const office = await tx.getOffice(accountId);
    const orders = await tx.getOrders(accountId);
    const world = await tx.getWorld();
    const assignment = await tx.getAssignments(accountId);
    const restriction: AssignmentRestriction = assignment.active
      ? assignmentSpec(assignment.active)?.restriction ?? {}
      : {};

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
        commendations: transfer.unlocks,
        restriction,
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

      const after = await applyAfterResolve(
        tx,
        accountId,
        {
          character: result.character,
          permitAppliedTick: result.permitAppliedTick,
          // Carried, not rebuilt. Dropping it here wiped the Form 4-E marker on
          // every resolving read, so the fee could be paid again on the next
          // one — a once-per-application rule that held only for as long as no
          // time passed between the two attempts.
          permitExpeditedTick: record.permitExpeditedTick ?? null,
          inventory: result.inventory,
          caseFiles: result.caseFiles,
          filings: result.filings,
        },
        pension,
        result,
        restriction,
        orders,
        transfer.unlocks,
      );
      current = after.record;
      pension = after.pension;

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

    const clearance = clearanceFor(current.character, pension);
    const registry = await tx.getRegistry(accountId);
    const ordersFiled = await tx.hasFiledOrders(accountId);
    const pendingPermit = pendingPermitOf(current, pension.unlocks, now);
    const retirement = retirementOffer(current, pension.unlocks, transfer.unlocks);

    return {
      account,
      clearance,
      guidance: guidanceFor({
        character: current.character,
        pension,
        office,
        registry,
        pendingPermit,
        retirement,
        ordersFiled,
        clearance,
      }),
      digest,
      ordersFiled,
      caseFiles: current.caseFiles ?? [],
      filings: pendingFilings(current, now),
      registry,
      transfer,
      // Quoted continuously, like the retirement offer, because the decision is
      // "is this posting worth more continued than banked" and it cannot be
      // made without the number.
      transferAward: commendationAward(pension.total + pension.spent),
      pendingPermit,
      retirement,
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
  commendations: readonly CommendationId[] = [],
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
    award: pensionAward(serviceTicks, record.character.depth, estate, unlocks, commendations),
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
    expediteCost: expediteCost(record.character.permitTier),
    expedited: record.permitExpeditedTick === record.permitAppliedTick,
  };
}

/**
 * Form 4-E: Application for Expedited Handling.
 *
 * Halves what is left of the wait, once per application, for gold. The one
 * thing an officer at their desk can do that a standing order cannot — and the
 * only place in the game where paying attention is worth more than patience.
 *
 * Halves the *remaining* wait rather than a share of the total, so it is never
 * wasted: an officer who files it with ten minutes left saves five. Filing it
 * early saves more, which is both the obvious incentive and true to how
 * chasing a form actually works.
 */
export async function expeditePermit(
  repo: Repository,
  accountId: string,
): Promise<{ character: Character; pendingPermit: PendingPermit | null }> {
  return repo.transaction(async (tx) => {
    // Resolve first. Without this an officer could expedite an application that
    // the unreplayed span has already cleared, and pay for nothing.
    const record =
      (await loadStateInside(tx, accountId)) ?? (await tx.getActiveCharacterForUpdate(accountId));
    if (!record) throw new ServiceError('character_dead', 'no living recruit');
    if (record.permitAppliedTick === null) {
      throw new ServiceError('invalid_request', 'no application is being processed');
    }
    if (record.permitExpeditedTick === record.permitAppliedTick) {
      throw new ServiceError('already_owned', 'that application has already been expedited');
    }

    const cost = expediteCost(record.character.permitTier);
    if (record.character.gold < cost) throw new ServiceError('insufficient_gold', 'not enough gold');

    const pension = await tx.getPension(accountId);
    const total = permitProcessingTicks(pension.unlocks);
    const elapsed = record.character.lastResolvedTick - record.permitAppliedTick;
    const remaining = Math.max(1, total - elapsed);
    // Moving the application *earlier* is how the wait shortens: the resolver
    // compares against this watermark and knows nothing about gold.
    const applied = record.permitAppliedTick - Math.floor(remaining / 2);

    const character = { ...record.character, gold: record.character.gold - cost };
    const updated: CharacterRecord = {
      ...record,
      character,
      permitAppliedTick: applied,
      permitExpeditedTick: applied,
    };
    await tx.saveCharacter(updated);
    await tx.appendJournal([
      entry_(
        character,
        `Form 4-E filed against the Permit D-${character.permitTier + 1} application. ` +
          `${cost} gold to the expediting clerk, who did not look up. ` +
          `Processing time halved.`,
      ),
    ]);

    return { character, pendingPermit: pendingPermitOf(updated, pension.unlocks, worldNow()) };
  });
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
 * Filling a post, and promoting the person in it.
 *
 * One endpoint for both, because from the officer's side they are the same
 * decision made repeatedly: pay gold now, carry a larger wage afterwards, get
 * more done. Splitting them would mean the client had to know which of two
 * calls applied to a post it is already rendering as one ladder.
 *
 * The cost is gold and it is not refundable, like every other thing the office
 * buys. There is deliberately no way to dismiss staff or demote them: the
 * interesting decision is whether you can carry the wage, and an undo turns
 * that into a free trial. A department that has outgrown its income downs tools
 * until it is paid, which is a state the officer can read and recover from.
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
    const rung = nextStaffRung(registry, role);
    if (!rung) throw new ServiceError('already_owned', 'the post is at its highest tier');
    if (record.character.gold < rung.cost) {
      throw new ServiceError('insufficient_gold', 'not enough gold');
    }

    const character = { ...record.character, gold: record.character.gold - rung.cost };
    const appointing = rung.tier === 1;
    const updated: Registry = {
      staff: appointing
        ? [...registry.staff, { role, policy: spec.policyDefault, tier: 1 }]
        : registry.staff.map((member) =>
            member.role === role ? { ...member, tier: rung.tier } : member,
          ),
      spent: registry.spent + rung.cost,
      unpaid: registry.unpaid,
    };
    await tx.saveCharacter({ ...record, character });
    await tx.saveRegistry(accountId, updated);
    await tx.appendJournal([
      entry_(
        character,
        appointing
          ? `${rung.label} appointed to the registry. ${rung.cost} gold, and ${rung.upkeep} gold a minute thereafter.`
          : `Promoted to ${rung.label}. ${rung.cost} gold, and the wage rises to ${rung.upkeep} a minute.`,
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
    // Refused rather than quietly downgraded. `authorisedSite` falls back to the
    // home site on *read*, because a stored order that has stopped being valid
    // must not fail the read that noticed — but an officer actively filing for a
    // site they cannot work should be told, not silently sent somewhere else and
    // left wondering why the journal never mentions the Annexe.
    const transfer = await tx.getTransfer(accountId);
    if (!siteAuthorised(clean.site ?? 'holdings', transfer.unlocks)) {
      throw new ServiceError('not_authorised', 'that site is not open to you');
    }
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
  const site = orders?.site ?? 'holdings';
  const siteOk = SITE_CATALOGUE.some((entry) => entry.id === site);

  if (
    !siteOk ||
    !Number.isFinite(targetDepth) || targetDepth < 1 || targetDepth > MAX_DEPTH ||
    !Number.isFinite(retreatPct) || retreatPct < 1 || retreatPct > 100 ||
    !lootOk || !spendOk
  ) {
    throw new ServiceError('invalid_request', 'invalid standing orders');
  }

  return {
    site,
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
    commendations: (await tx.getTransfer(accountId)).unlocks,
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
  const transfer = await tx.getTransfer(accountId);
  const assignment = await tx.getAssignments(accountId);
  const restriction = assignment.active
    ? assignmentSpec(assignment.active)?.restriction ?? {}
    : {};
  const result = resolve({
    character: record.character,
    inventory: record.inventory,
    orders,
    unlocks: pension.unlocks,
    toTick: tickOf(worldNow()),
    permitAppliedTick: record.permitAppliedTick,
    caseFiles: record.caseFiles,
    filings: record.filings,
    commendations: transfer.unlocks,
    restriction,
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
    // See the note on the same field in `loadState`: rebuilding the record
    // without it silently reset the once-per-application rule.
    permitExpeditedTick: record.permitExpeditedTick ?? null,
    inventory: result.inventory,
    caseFiles: result.caseFiles,
    filings: result.filings,
  };

  // Skeleton Staff stands the department down: no work, and no wages either.
  // Suspending the work but still charging for it would be a punishment
  // wearing a restriction's clothes.
  if (!restriction.noDepartment) {
    updated = (await applyStaff(tx, accountId, updated, pension, result.ticksResolved)).record;
  }

  /**
   * The regional effort, after the department and before the save.
   *
   * After staff because the payout is gold and the payroll is charged from the
   * same purse — an officer whose share arrived first would be paying wages out
   * of it in the same breath, which is true but makes the log unreadable. And
   * before the save, so the share and the wages land in one write.
   */
  const assignmentOutcome = await applyAssignment(
    tx,
    accountId,
    updated.character,
    result.counters,
    Boolean(result.death),
  );
  if (assignmentOutcome.notes.length > 0) {
    await tx.appendJournal(
      assignmentOutcome.notes.map((text) => entry_(updated.character, text)),
    );
  }

  const guild = await applyGuild(
    tx,
    accountId,
    updated.character,
    result.counters,
    authorisedSite(orders.site ?? 'holdings', transfer.unlocks),
  );
  updated = { ...updated, character: guild.character };
  if (guild.notes.length > 0) {
    await tx.appendJournal(guild.notes.map((text) => entry_(updated.character, text)));
  }

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
    const transfer = await tx.getTransfer(accountId);
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
      commendations: ladderOffers(COMMENDATION_CATALOGUE, transfer.unlocks, transfer.total),
      transfer,
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
    const award = pensionAward(
      service, record.character.depth, estate, pension.unlocks,
      (await tx.getTransfer(accountId)).unlocks,
    );

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
    commendations: (await tx.getTransfer(accountId)).unlocks,
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

export async function getBulletin(
  repo: Repository,
  accountId: string,
): Promise<BulletinResponse> {
  const world = await repo.getWorld();
  const deaths = await repo.listDeaths(12);
  const standing = await repo.getGuildStanding(accountId);
  const assignments = await repo.getAssignments(accountId);
  return {
    world,
    deaths,
    assignments: assignmentBoard(assignments),
    // Zeroed when the standing is stale: the contribution belongs to an
    // objective that has already closed, and showing it against the current
    // bar would credit this office with somebody else's work.
    guild: {
      contribution: standing.cycle === world.guildCycle ? standing.contribution : 0,
      paid: standing.paid,
    },
  };
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

/**
 * Everything that happens to an *account* after a span resolves.
 *
 * ## Why this exists
 *
 * `loadState` and `loadStateInside` both resolve ticks, and until now each
 * carried its own idea of what happens next. The guild contribution shipped
 * into `loadStateInside` only — so a player whose ticks resolved through a
 * plain `GET /v1/state`, which is most of them, moved the regional bar not at
 * all. Nothing failed; the bar simply advanced for people who happened to sell
 * something.
 *
 * That is the fourth time this exact shape has cost something in this codebase:
 * a system added beside the resolver rather than inside one shared place, and a
 * second copy of the loop that never heard about it. `tools/officer.ts` fixed
 * it for the harnesses. This fixes it for the server.
 *
 * The order is load-bearing and matches what a reader would expect: the
 * department works the span, then the assignment is assessed on what happened,
 * then the regional effort is settled and contributed to. Staff last would have
 * them arriving at a cabinet the officer already emptied; the guild first would
 * pay a share into a purse the payroll then takes back out of.
 */
async function applyAfterResolve(
  tx: Repository,
  accountId: string,
  record: CharacterRecord,
  pension: Pension,
  result: { counters: ResolveCounters; ticksResolved: number; death: unknown },
  restriction: AssignmentRestriction,
  orders: StandingOrders,
  commendations: readonly CommendationId[],
): Promise<{ record: CharacterRecord; pension: Pension }> {
  let updated = record;
  let banked = pension;

  // Skeleton Staff stands the department down: no work, and no wages either.
  // Suspending the work and still charging for it would be a punishment
  // wearing a restriction's clothes.
  if (!restriction.noDepartment) {
    const worked = await applyStaff(tx, accountId, updated, banked, result.ticksResolved);
    updated = worked.record;
    banked = worked.pension;
  }

  const assignment = await applyAssignment(
    tx, accountId, updated.character, result.counters, Boolean(result.death),
  );

  const guild = await applyGuild(
    tx,
    accountId,
    updated.character,
    result.counters,
    authorisedSite(restriction.site ?? orders.site ?? 'holdings', commendations),
  );
  updated = { ...updated, character: guild.character };

  const notes = [...assignment.notes, ...guild.notes];
  if (notes.length > 0) {
    await tx.appendJournal(notes.map((text) => entry_(updated.character, text)));
  }

  return { record: updated, pension: banked };
}

/**
 * Special Assignments, on the resolution path.
 *
 * Progress, completion and failure in one place, after the span is resolved and
 * before it is saved. Deliberately *not* inside `resolve()`: the resolver is a
 * pure function of one recruit's span, and an assignment is account state that
 * outlives recruits — the same reason `runStaff` sits outside it.
 */
async function applyAssignment(
  tx: Repository,
  accountId: string,
  character: Character,
  counters: ResolveCounters,
  died: boolean,
): Promise<{ notes: string[]; failed: boolean }> {
  const state = await tx.getAssignments(accountId);
  if (!state.active) return { notes: [], failed: false };
  const spec = assignmentSpec(state.active);
  if (!spec) return { notes: [], failed: false };

  // A death under Sole Charge closes the file. Nothing else is lost — no
  // penalty state, because a challenge you can lose something on is one people
  // stop taking.
  if (died && spec.restriction.singleRecruit) {
    await tx.saveAssignments(accountId, { ...state, active: null, progress: 0, startedTick: 0 });
    return {
      notes: [
        `${spec.name} closed: the recruit was lost and no replacement was authorised. ` +
          'The file is returned without prejudice.',
      ],
      failed: true,
    };
  }

  const progress = assignmentProgress(spec, state.progress, counters, character, state.startedTick);
  if (!assignmentComplete(spec, progress)) {
    if (progress !== state.progress) await tx.saveAssignments(accountId, { ...state, progress });
    return { notes: [], failed: false };
  }

  await tx.saveAssignments(accountId, {
    active: null,
    progress: 0,
    startedTick: 0,
    completed: [...state.completed, spec.id],
  });
  const transfer = await tx.getTransfer(accountId);
  await tx.saveTransfer(accountId, { ...transfer, total: transfer.total + spec.reward });
  return {
    notes: [
      `${spec.name} completed. ${spec.reward} ` +
        `${spec.reward === 1 ? 'Commendation' : 'Commendations'} entered on your record. ` +
        'Ordinary conditions resume.',
    ],
    failed: false,
  };
}

/**
 * The regional effort, on the resolution path.
 *
 * Two jobs in one place because they share a read. First, settle anything owed:
 * if the officer's contribution counts toward a cycle the world has moved past,
 * that objective completed and their share is due. Then add what this span did
 * to the current one.
 *
 * Claimed lazily, on the officer's next read, which is the same shape as every
 * other deferred thing here — no job walks the account table paying people.
 * The consequence worth stating: an officer who never opens the app is never
 * paid, and that is correct. The purse is for turning up.
 */
async function applyGuild(
  tx: Repository,
  accountId: string,
  character: Character,
  counters: ResolveCounters,
  site: SiteId,
): Promise<{ character: Character; notes: string[] }> {
  const notes: string[] = [];
  const world = await tx.getWorld();
  const standing = await tx.getGuildStanding(accountId);
  let updated = character;

  // 1. Settle. The objective the contribution was made toward has completed if
  //    the world has moved on from it.
  if (standing.cycle < world.guildCycle && standing.contribution > 0) {
    const finished = objectiveForCycle(standing.cycle);
    const share = guildShare(standing.contribution, finished.target, finished.purse);
    updated = { ...updated, gold: updated.gold + share };
    await tx.saveGuildStanding(accountId, {
      cycle: world.guildCycle,
      contribution: 0,
      paid: standing.paid + share,
    });
    notes.push(
      `Regional objective met: ${finished.text} Your office contributed ` +
        `${standing.contribution}. Share of the purse: ${share} gold.`,
    );
  } else if (standing.cycle < world.guildCycle) {
    // Contributed nothing, so nothing is owed — but the row still has to move
    // forward or it will be compared against a stale cycle forever.
    await tx.saveGuildStanding(accountId, { ...standing, cycle: world.guildCycle, contribution: 0 });
  }

  // 2. Contribute.
  const objective = objectiveForCycle(world.guildCycle);
  const contribution = contributionOf(objective.metric, counters, site);
  if (contribution > 0) {
    const result = await tx.addGuildProgress(contribution);
    const current = await tx.getGuildStanding(accountId);
    await tx.saveGuildStanding(accountId, {
      ...current,
      cycle: result.cycle,
      contribution: current.cycle === result.cycle ? current.contribution + contribution : contribution,
    });
    if (result.completed) {
      notes.push(`Regional objective met. ${objective.text} Assessment of shares follows.`);
    }
  }

  return { character: updated, notes };
}

/**
 * Form T-1: file for a transfer.
 *
 * The officer's own prestige, and the answer to what a ninety-day run kept
 * saying — that after the last pension rung the game is repetition with a
 * larger number on it. Filing hands the caseload back: the pension, every rung
 * bought with it, the permit ladder and the current recruit all go. The
 * department, the office equipment and the Commendations do not.
 *
 * The award is linear in pension ever banked since the last transfer, which
 * makes the timing decision *safe*: filing at the threshold and filing at ten
 * times the threshold pay the same rate, so there is no optimal moment to work
 * out and no way to discover afterwards that you got it wrong. Not knowing when
 * to pull the lever is the standing complaint about prestige in this genre.
 */
export async function fileTransfer(
  repo: Repository,
  accountId: string,
): Promise<TransferResponse> {
  return repo.transaction(async (tx) => {
    // Resolve first, so the pension the award is computed against includes
    // everything the officer earned up to the moment they filed. Without this a
    // transfer would silently discard the unresolved span.
    const record =
      (await loadStateInside(tx, accountId)) ?? (await tx.getActiveCharacterForUpdate(accountId));
    if (!record) throw new ServiceError('character_dead', 'no living recruit');

    const pension = await tx.getPension(accountId);
    const banked = pension.total + pension.spent;
    const award = commendationAward(banked);
    if (award < 1) {
      throw new ServiceError(
        'not_authorised',
        `a transfer requires ${PENSION_PER_COMMENDATION} pension banked; you have ${banked}`,
      );
    }

    const before = await tx.getTransfer(accountId);
    const transfer: Transfer = {
      total: before.total + award,
      spent: before.spent,
      unlocks: [...before.unlocks],
      careers: before.careers + 1,
    };
    await tx.saveTransfer(accountId, transfer);
    // The pension goes to zero including what was already spent: `banked` is
    // the meter the next award reads, so leaving `spent` behind would pay for
    // the same service twice, every transfer, forever.
    await tx.savePension(accountId, { total: 0, spent: 0, unlocks: [] });

    const atTick = record.character.lastResolvedTick;
    // The same three steps a retirement takes: close the recruit, file the
    // record, issue the next. Reusing `claimInside` would be shorter and wrong
    // — it banks a pension award, and the pension is the thing just surrendered.
    await tx.saveCharacter({
      ...record,
      character: { ...record.character, alive: false },
    });
    await tx.recordDeath(accountId, {
      id: randomUUID(),
      characterName: record.character.name,
      depth: record.character.depth,
      cause: 'transferred at own request',
      goldHandled: record.character.gold,
      pensionAwarded: 0,
      at: new Date().toISOString(),
    });
    const posting = succeed({
      id: randomUUID(),
      accountId,
      previous: record.character,
      depthReached: record.character.depth,
      unlocks: [],
      atTick,
      commendations: transfer.unlocks,
      posting: true,
    });
    await tx.insertCharacter(posting);
    await tx.appendJournal([
      entry_(
        posting.character,
        `Form T-1 approved. ${award} ${award === 1 ? 'Commendation' : 'Commendations'} entered on your record. ` +
          'Pension entitlement surrendered. Your department travels with you.',
      ),
      entry_(
        posting.character,
        `New posting opened. ${posting.character.name} assigned. Permit D-${posting.character.permitTier} issued.`,
        1,
      ),
    ]);

    return {
      transfer,
      awarded: award,
      character: posting.character,
      commendations: ladderOffers(COMMENDATION_CATALOGUE, transfer.unlocks, transfer.total),
    };
  });
}

/**
 * Accepting a Special Assignment.
 *
 * Free to take and free to abandon, because the whole value of the mechanic is
 * that a player tries one. Anything charged at the door turns "let's see what
 * that's like" into a decision to research first, and the assignment *is* the
 * research.
 */
export async function acceptAssignment(
  repo: Repository,
  accountId: string,
  id: AssignmentId,
): Promise<AssignmentState> {
  const spec = assignmentSpec(id);
  if (!spec) throw new ServiceError('invalid_request', 'no such assignment');

  return repo.transaction(async (tx) => {
    // Resolve first, so the span already lived does not count toward an
    // assignment accepted after the fact.
    const record =
      (await loadStateInside(tx, accountId)) ?? (await tx.getActiveCharacterForUpdate(accountId));
    if (!record) throw new ServiceError('character_dead', 'no living recruit');

    const state = await tx.getAssignments(accountId);
    if (state.active) throw new ServiceError('invalid_request', 'an assignment is already open');
    if (state.completed.includes(id)) {
      throw new ServiceError('already_owned', 'that assignment is closed');
    }

    const updated: AssignmentState = {
      active: id,
      progress: 0,
      startedTick: record.character.lastResolvedTick,
      completed: state.completed,
    };
    await tx.saveAssignments(accountId, updated);
    await tx.appendJournal([
      entry_(record.character, `${spec.name} accepted. ${spec.brief}`),
    ]);
    return updated;
  });
}

/** Handing one back. Costs the progress and nothing else. */
export async function abandonAssignment(
  repo: Repository,
  accountId: string,
): Promise<AssignmentState> {
  return repo.transaction(async (tx) => {
    const state = await tx.getAssignments(accountId);
    if (!state.active) throw new ServiceError('invalid_request', 'no assignment is open');
    const spec = assignmentSpec(state.active);

    const updated: AssignmentState = { ...state, active: null, progress: 0, startedTick: 0 };
    await tx.saveAssignments(accountId, updated);
    const record = await tx.getActiveCharacterForUpdate(accountId);
    if (record && spec) {
      await tx.appendJournal([
        entry_(
          record.character,
          `${spec.name} handed back at your own request. Ordinary conditions resume. ` +
            'No note has been made on your file. There is always a note.',
        ),
      ]);
    }
    return updated;
  });
}

/** The board: what is on offer, what is open, what is finished. */
export function assignmentBoard(state: AssignmentState) {
  return ASSIGNMENT_CATALOGUE.map((spec) => ({
    id: spec.id,
    name: spec.name,
    brief: spec.brief,
    reward: spec.reward,
    target: spec.target,
    metric: spec.metric,
    completed: state.completed.includes(spec.id),
    active: state.active === spec.id,
    progress: state.active === spec.id ? state.progress : 0,
  }));
}

/** Spending a Commendation. Priced in the one currency a transfer cannot touch. */
export async function purchaseCommendation(
  repo: Repository,
  accountId: string,
  id: CommendationId,
): Promise<TransferResponse> {
  const entry = COMMENDATION_CATALOGUE.find((candidate) => candidate.id === id);
  if (!entry) throw new ServiceError('invalid_request', 'unknown commendation');

  return repo.transaction(async (tx) => {
    const transfer = await tx.getTransfer(accountId);
    if (transfer.unlocks.includes(id)) {
      throw new ServiceError('already_owned', 'commendation already held');
    }
    if (commendationTier(transfer.unlocks, entry.track) !== entry.tier - 1) {
      throw new ServiceError('invalid_request', 'previous tier not held');
    }
    if (transfer.total < entry.cost) {
      throw new ServiceError('insufficient_pension', 'not enough commendations');
    }

    const updated: Transfer = {
      total: transfer.total - entry.cost,
      spent: transfer.spent + entry.cost,
      unlocks: [...transfer.unlocks, id],
      careers: transfer.careers,
    };
    await tx.saveTransfer(accountId, updated);
    const record = await tx.getActiveCharacterForUpdate(accountId);
    if (record) {
      await tx.appendJournal([
        entry_(record.character, `${entry.label} entered on your record. ${entry.detail}`),
      ]);
    }
    return {
      transfer: updated,
      awarded: 0,
      character: record?.character ?? null,
      commendations: ladderOffers(COMMENDATION_CATALOGUE, updated.unlocks, updated.total),
    };
  });
}
