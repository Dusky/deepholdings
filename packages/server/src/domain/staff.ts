import {
  UNLOCK_CATALOGUE,
  archivistFeeShare,
  archivistStandingRelief,
  archivistThroughput,
  clauseById,
  clerkRealisation,
  formGoldCost,
  formSpec,
  officerDiscount,
  officerThroughput,
  payrollPerTick,
  policyOf,
  staffTier,
  staffTitle,
  unlockTier,
  type CaseFile,
  type Character,
  type Filing,
  type InventoryItem,
  type Pension,
  type Registry,
  type UnlockId,
} from '@deepholdings/shared';

/**
 * What the staff did while you were away.
 *
 * ## Why this is not in the resolver
 *
 * Every other automatic thing in this game happens inside `resolve()`, tick by
 * tick, seeded. Staff do not, and the reason is what they touch: the Junior
 * Officer spends *pension*, and the Filing Clerk needs the *world's* market —
 * neither of which the resolver has, and threading both through it would make
 * a pure function of (character, orders, unlocks) into a function of the whole
 * account so that three chores could run.
 *
 * So this runs immediately after resolution, in the same transaction, against
 * the state resolution produced. Nothing here is a die roll — a clerk selling
 * everything under a threshold and an officer buying the cheapest affordable
 * rung are both deterministic given the state — so none of it needs the seeded
 * stream, and replaying a span cannot produce a different department.
 *
 * The one thing it does need is a guard against running when no time has
 * passed: `loadStateInside` is called by every mutation, and staff who worked
 * once per sale would be paid once per tap.
 */

export interface StaffOutcome {
  character: Character;
  inventory: InventoryItem[];
  caseFiles: CaseFile[];
  filings: Filing[];
  pension: Pension;
  registry: Registry;
  /** Lines for the journal, in order. */
  notes: string[];
  /** True when anything at all changed and the caller has to persist. */
  changed: boolean;
}

export interface StaffInput {
  character: Character;
  inventory: InventoryItem[];
  caseFiles: CaseFile[];
  filings: Filing[];
  pension: Pension;
  registry: Registry;
  /** Minutes actually simulated. Wages are per minute. */
  ticksResolved: number;
  /** For filing ids, so this stays testable without reaching for randomness. */
  newId: () => string;
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

export function runStaff(input: StaffInput): StaffOutcome {
  const { ticksResolved, newId } = input;
  let character = { ...input.character };
  let inventory = input.inventory.map((item) => ({ ...item }));
  let caseFiles = input.caseFiles.map((file) => ({ ...file }));
  let filings = input.filings.map((filing) => ({ ...filing }));
  let pension: Pension = { ...input.pension, unlocks: [...input.pension.unlocks] };
  let registry: Registry = {
    ...input.registry,
    staff: input.registry.staff.map((member) => ({ ...member })),
  };
  const notes: string[] = [];
  let changed = false;

  const unchanged = (): StaffOutcome => ({
    character, inventory, caseFiles, filings, pension, registry, notes, changed,
  });

  if (registry.staff.length === 0 || ticksResolved <= 0 || !character.alive) return unchanged();

  // ---- Payroll ------------------------------------------------------------
  //
  // Paid first, and in full or not at all for the span. Staff who could only be
  // half paid working half the time would be a rounding argument nobody wants
  // to have with a log file.
  const owed = payrollPerTick(registry) * ticksResolved;
  if (character.gold < owed) {
    // Take what there is — the department is owed it either way — and stop.
    // Debt would be a spiral with no way out; downing tools is recoverable, and
    // the officer can see exactly why nothing got done.
    const paid = Math.max(0, character.gold);
    character = { ...character, gold: 0 };
    registry = { ...registry, spent: registry.spent + paid, unpaid: true };
    if (!input.registry.unpaid) {
      notes.push(
        `Payroll short by ${owed - paid} gold. The registry has stopped work pending payment.`,
      );
    }
    return { ...unchanged(), character, registry, changed: true };
  }

  character = { ...character, gold: character.gold - owed };
  registry = { ...registry, spent: registry.spent + owed, unpaid: false };
  changed = true;
  if (input.registry.unpaid) {
    notes.push('Payroll met. The registry has resumed work.');
  }

  // ---- Filing Clerk -------------------------------------------------------
  const under = policyOf(registry, 'clerk');
  if (under !== null && under > 0) {
    const junk = inventory.filter((item) => item.unitValue < under);
    if (junk.length > 0) {
      const book = junk.reduce((total, item) => total + item.unitValue * item.quantity, 0);
      // A senior clerk knows which depot is paying. Rounded down, so the
      // promotion never invents a coin the book value cannot account for.
      const rate = clerkRealisation(staffTier(registry, 'clerk'));
      const gold = Math.floor(book * rate);
      const units = junk.reduce((total, item) => total + item.quantity, 0);
      inventory = inventory.filter((item) => item.unitValue >= under);
      character = { ...character, gold: character.gold + gold };
      notes.push(
        `${staffTitle(registry, 'clerk')} liquidated ${units} ${plural(units, 'item')} across ` +
          `${junk.length} ${plural(junk.length, 'stack')} for ${gold} gold` +
          `${gold > book ? `, ${gold - book} over book` : ' at depot rates'}.`,
      );
    }
  }

  // ---- Junior Officer -----------------------------------------------------
  const reserve = policyOf(registry, 'officer');
  if (reserve !== null) {
    const officerAt = staffTier(registry, 'officer');
    const discount = officerDiscount(officerAt);
    // Appointment clears one rung a visit. Uncapped, the post redeemed
    // everything affordable the moment it was hired, which left its own ladder
    // with nothing to sell and made the first tier the only one worth buying.
    let left = officerThroughput(officerAt);
    while (left > 0) {
      const rung = cheapestAffordable(pension, reserve, discount);
      if (!rung) break;
      const price = Math.round(rung.cost * discount);
      pension = {
        ...pension,
        total: pension.total - price,
        spent: pension.spent + price,
        unlocks: [...pension.unlocks, rung.id as UnlockId],
      };
      notes.push(
        `${staffTitle(registry, 'officer')} redeemed ${rung.label} for ${price}` +
          `${price < rung.cost ? ` of ${rung.cost}` : ''}. Pension ${pension.total} remaining.`,
      );
      left -= 1;
    }
  }

  // ---- Archivist ----------------------------------------------------------
  const fromGrade = policyOf(registry, 'archivist');
  if (fromGrade !== null) {
    const spec = formSpec('12-C');
    const archivistAt = staffTier(registry, 'archivist');
    const feeShare = archivistFeeShare(archivistAt);
    // Never below one, whatever the relief: a form that costs no standing at
    // all would make the Union Standing budget stop being a constraint, and
    // that budget is the only thing rationing the crafting layer.
    const standing = Math.max(1, spec ? spec.standing - archivistStandingRelief(archivistAt) : 0);
    // A bounded number of filings per visit, not one per eligible clause. An
    // archivist who emptied the purse and the standing in a single pass would
    // be indistinguishable from a bug, and the officer would never see the
    // decision being made.
    let forms = archivistThroughput(archivistAt);
    while (spec && forms > 0) {
      const target = firstContestable(caseFiles, filings, fromGrade);
      if (!target) break;
      const fee = Math.round(formGoldCost(spec, target.file.grade) * feeShare);
      if (character.gold < fee || character.standing < standing) break;
      const filedTick = character.lastResolvedTick;
      filings = [
        ...filings,
        {
          id: newId(),
          form: spec.id,
          caseFileId: target.file.id,
          clauseIndex: target.index,
          filedTick,
          resolvesTick: filedTick + spec.ticks,
          wasClauseId: target.clauseId,
        },
      ];
      character = {
        ...character,
        gold: character.gold - fee,
        standing: character.standing - standing,
      };
      notes.push(
        `${staffTitle(registry, 'archivist')} filed Form 12-C against case ${target.file.id}, ` +
          `contesting "${clauseById(target.clauseId)?.text ?? target.clauseId}". ` +
          `Fee ${fee} gold, Union Standing ${standing}.`,
      );
      forms -= 1;
    }
  }

  return { character, inventory, caseFiles, filings, pension, registry, notes, changed };
}

/**
 * The cheapest rung the ladder allows next, if it clears the reserve.
 *
 * `discount` is applied to the affordability test as well as the price, so a
 * promoted officer can reach a rung the reserve would otherwise have put out
 * of range. Anything else would take the discount off the price and leave it
 * on the gate, which is the sort of thing a player notices and nobody can
 * explain.
 */
function cheapestAffordable(pension: Pension, reserve: number, discount = 1) {
  return UNLOCK_CATALOGUE.filter(
    (entry) =>
      !pension.unlocks.includes(entry.id as UnlockId) &&
      unlockTier(pension.unlocks, entry.track) === entry.tier - 1 &&
      pension.total - Math.round(entry.cost * discount) >= reserve,
  ).reduce<(typeof UNLOCK_CATALOGUE)[number] | null>(
    (best, entry) => (best === null || entry.cost < best.cost ? entry : best),
    null,
  );
}

/**
 * The first rider worth contesting: on a file at or above the policy grade,
 * and not already before the panel.
 *
 * Riders only. An archivist rerolling endorsements would be spending the
 * officer's standing to make their files worse as often as better — the whole
 * reason to contest something automatically is that it is a known drawback.
 */
function firstContestable(
  caseFiles: readonly CaseFile[],
  filings: readonly Filing[],
  fromGrade: number,
): { file: CaseFile; index: number; clauseId: string } | null {
  for (const file of caseFiles) {
    if (file.grade < fromGrade) continue;
    for (const [index, clauseId] of file.clauseIds.entries()) {
      if (clauseById(clauseId)?.kind !== 'rider') continue;
      const busy = filings.some(
        (filing) => filing.caseFileId === file.id && filing.clauseIndex === index,
      );
      if (!busy) return { file, index, clauseId };
    }
  }
  return null;
}
