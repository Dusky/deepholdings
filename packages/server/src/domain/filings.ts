import {
  ALL_CLAUSES,
  clauseById,
  formSpec,
  makeRng,
  rngChance,
  rngInt,
  tickSeed,
  type CaseFile,
  type Clause,
  type Filing,
} from '@deepholdings/shared';

/**
 * Resolving a filed form.
 *
 * Two forms, dispatched by `concludeFiling`. They share the rails — the queue,
 * the resolution tick, the seed — and nothing else: 12-C is a gamble that can
 * come back worse or not at all, and 19 is a certainty bought with a whole
 * case file.
 *
 * ## Seeding
 *
 * Not on `(character, tick)` like everything else in the resolver, but on the
 * **filing** — its id and the tick it is due. That is a deliberate departure
 * and the design asks for it explicitly: a filing must resolve to the same
 * result no matter when it is replayed.
 *
 * The distinction matters because these two are not the same thing. A combat
 * roll keyed on `(character, tick)` is stable because the character and the
 * tick are both fixed. A filing's outcome keyed the same way would also be
 * stable — but it would be *entangled*: file two forms due in the same minute
 * and they would share a seed, and the second would be the first's shadow.
 * Keying on the filing id keeps each one its own event.
 *
 * ## Its own stream
 *
 * Also separate from the simulation stream, for the reason the prose stream is
 * separate: drawing from the combat rng here would mean that filing a form
 * silently shifts every encounter after it. An officer doing paperwork must
 * not change what is waiting on Floor 9.
 */

/** Clauses this file could legally carry in place of the one being contested. */
function candidates(file: CaseFile, replacing: Clause): Clause[] {
  return ALL_CLAUSES.filter(
    (clause) =>
      // Same kind: an arbitration contests a clause, it does not convert a
      // rider into an endorsement. That would make every rider a formality.
      clause.kind === replacing.kind &&
      clause.minGrade <= file.grade &&
      clause.id !== replacing.id &&
      !file.clauseIds.includes(clause.id),
  );
}

export interface FilingOutcome {
  /** The drawer after the ruling. */
  files: CaseFile[];
  /** What the Terminal says happened. */
  text: string;
  changed: boolean;
}

/** Dispatch. Every form resolves through here, in the tick loop. */
export function concludeFiling(filing: Filing, files: readonly CaseFile[]): FilingOutcome {
  return filing.form === '19'
    ? concludeRequisition(filing, files)
    : concludeArbitration(filing, files);
}

/**
 * Form 12-C, concluded.
 *
 * Three ways out, and only one of them changes anything:
 *
 *  - **Dismissed.** The dice said so. The fee was spent at filing and is not
 *    returned, which is the whole risk the form exists to carry.
 *  - **Nothing to rule on.** The file was displaced from the drawer, or the
 *    clause index no longer points at what it did. Says so plainly rather than
 *    resolving against whatever happens to be at that index now — quietly
 *    rerolling a *different* clause than the one contested would be the worst
 *    possible behaviour here.
 *  - **Amended.** The clause is replaced from the eligible pool.
 */
export function concludeArbitration(filing: Filing, files: readonly CaseFile[]): FilingOutcome {
  const spec = formSpec(filing.form);
  const index = files.findIndex((f) => f.id === filing.caseFileId);
  const file = index === -1 ? null : files[index];
  const was = clauseById(filing.wasClauseId);

  const unchanged = (text: string) => ({ files: [...files], text, changed: false });

  if (!spec || !file || !was) {
    return {
      files: [...files],
      changed: false,
      text: `Arbitration on case ${filing.caseFileId} concluded. The file was not produced. No ruling was recorded.`,
    };
  }

  // The clause has to still be where the form says it is. It can move if a
  // second filing on the same file resolved first.
  if (file.clauseIds[filing.clauseIndex] !== filing.wasClauseId) {
    return unchanged(
      `Arbitration on case ${file.id} concluded. "${was.text}" was no longer before the panel. Fee retained.`,
    );
  }

  const rng = makeRng(tickSeed(filing.id, filing.resolvesTick, 'arbitration'));

  if (rngChance(rng, spec.dismissChance)) {
    return unchanged(`Case ${file.id} dismissed. Fee retained. "${was.text}" stands.`);
  }

  const pool = candidates(file, was);
  if (pool.length === 0) {
    return unchanged(
      `Arbitration on case ${file.id} concluded. No alternative clause exists at Grade ${file.grade}. "${was.text}" stands.`,
    );
  }

  const now = pool[rngInt(rng, 0, pool.length - 1)];
  const clauseIds = [...file.clauseIds];
  clauseIds[filing.clauseIndex] = now.id;
  const amended: CaseFile = { ...file, clauseIds };
  const next = [...files];
  next[index] = amended;

  return {
    files: next,
    changed: true,
    text: `Arbitration concluded on case ${file.id}. Clause amended: "${was.text}" → "${now.text}".`,
  };
}

/**
 * Form 19, concluded.
 *
 * No dice at all — the outcome was decided when the officer filed it, and the
 * donor file was taken then too. That asymmetry with 12-C is the design: a
 * form that costs an entire case file must not also be able to waste it.
 *
 * The only ways this does nothing are the ways every filing can do nothing:
 * the surviving file left the drawer, or the slot it named no longer holds
 * what it held. Both say so. The donor is not coming back either way, which
 * the line is careful to state rather than leaving the officer to work out
 * from a drawer that is one file lighter.
 */
export function concludeRequisition(filing: Filing, files: readonly CaseFile[]): FilingOutcome {
  const index = files.findIndex((f) => f.id === filing.caseFileId);
  const file = index === -1 ? null : files[index];
  const brings = filing.bringsClauseId ? clauseById(filing.bringsClauseId) : undefined;
  const was = clauseById(filing.wasClauseId);
  const donor = filing.donorName ?? 'the requisitioned file';

  if (!file || !brings || !was) {
    return {
      files: [...files],
      changed: false,
      text: `Requisition on case ${filing.caseFileId} concluded. The surviving file was not produced. ${donor} is not recoverable.`,
    };
  }

  if (file.clauseIds[filing.clauseIndex] !== filing.wasClauseId) {
    return {
      files: [...files],
      changed: false,
      text: `Requisition on case ${file.id} concluded. "${was.text}" was no longer in that slot, and the transfer was refused. ${donor} is not recoverable.`,
    };
  }

  // A clause cannot appear twice on one file. Checked at filing, and again
  // here because two hours of resolution can happen in between.
  if (file.clauseIds.some((id, at) => id === brings.id && at !== filing.clauseIndex)) {
    return {
      files: [...files],
      changed: false,
      text: `Requisition on case ${file.id} concluded. "${brings.text}" is already endorsed on it, and cannot be endorsed twice. ${donor} is not recoverable.`,
    };
  }

  const clauseIds = [...file.clauseIds];
  clauseIds[filing.clauseIndex] = brings.id;
  const merged: CaseFile = { ...file, clauseIds };
  const next = [...files];
  next[index] = merged;

  return {
    files: next,
    changed: true,
    text: `Requisition concluded on case ${file.id}. "${brings.text}" transferred from ${donor}; "${was.text}" struck out.`,
  };
}
