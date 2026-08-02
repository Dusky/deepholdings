/**
 * Forms — the second slice of Requisition & Arbitration.
 *
 * `docs/design/crafting.md` makes the argument this file implements: every
 * crafting action is a form, forms take real time to process, and that is not
 * a gimmick. It is why the system fits an async game. Filing is a decision,
 * processing is the wait, and opening the terminal to find your arbitration
 * resolved is exactly the check-in habit the whole design is built around.
 *
 * The click-to-reroll version of this system would resolve instantly and would
 * be strictly worse here: it would collapse into a slot machine you pull until
 * the gold runs out, in a game whose entire pacing argument is that things
 * happen while you are not looking.
 *
 * ## Which forms, and why these two
 *
 * The catalogue has six. Two are built — **12-C, Arbitration** and **19,
 * Requisition** — and they are the two that need nothing that does not already
 * exist. 7-A needs hidden clauses; 44 needs provenance; 3-B needs vacant
 * slots, which today's rolls almost never leave. Each of those is a change to
 * what drops, and a change to what drops means re-measuring the game.
 *
 * They are also deliberately opposite, which is most of the argument for
 * building 19 second rather than a third variation on a reroll:
 *
 *   12-C is a **gamble**. Cheap enough to repeat, may come back worse, may be
 *   dismissed outright. Priced in Union Standing, which is the scarce thing.
 *
 *   19 is a **certainty**. It does exactly what it says and cannot fail — and
 *   it costs an entire case file, which is the most expensive thing an officer
 *   can spend. No standing at all.
 *
 * A catalogue where every entry is a dice roll with a different name is a
 * catalogue with one form in it.
 */

export type FormId = '12-C' | '19';

/**
 * A filed form, waiting on the clock.
 *
 * Carried on the character beside the case files, and lost with them. That is
 * consistent rather than harsh: the form is about a specific case file, and if
 * the file is gone there is nothing for it to resolve against.
 */
export interface Filing {
  id: string;
  form: FormId;
  /** Case number of the target. */
  caseFileId: string;
  /** Which clause of that file. Index into `clauseIds`. */
  clauseIndex: number;
  filedTick: number;
  resolvesTick: number;
  /**
   * The clause that was there when the form went in.
   *
   * Stored rather than re-read at resolution so the log line can name both
   * ends of the change — and so a file that has since been displaced from the
   * drawer still produces a sentence rather than a silent nothing.
   */
  wasClauseId: string;
  /**
   * Form 19 only: the clause carried across from the file that was consumed.
   *
   * The donor is not stored, because by the time this resolves the donor does
   * not exist — Form 19 takes both items at filing, the way 12-C takes its
   * fee. What survives is the clause and the name, and the name is only ever
   * used to write the sentence.
   */
  bringsClauseId?: string;
  /** Form 19 only: what the consumed file was called, for the log line. */
  donorName?: string;
}

export interface FormSpec {
  id: FormId;
  /** "12-C" reads as a form; "Arbitration" reads as what it does. */
  title: string;
  detail: string;
  /** Minutes of processing. One tick is one minute. */
  ticks: number;
  standing: number;
  /**
   * Gold, scaled by the grade of the file it is filed against. A Grade V
   * reroll costing what a Grade I costs would make the top of the ladder the
   * cheapest thing to gamble on.
   */
  goldPerGrade: number;
  /**
   * How often the case is dismissed and the fee retained.
   *
   * The risk is the point. A reroll that always succeeds is a slider, and the
   * player sets it to maximum and stops thinking about it; a reroll that can
   * come back with nothing is a decision every time. It is also funnier, which
   * matters more in this game than it usually does.
   */
  dismissChance: number;
}

export const FORM_CATALOGUE: readonly FormSpec[] = [
  {
    id: '12-C',
    title: 'Arbitration',
    detail: 'Contests one clause. The replacement may be worse, and the case may be dismissed.',
    ticks: 120,
    standing: 3,
    goldPerGrade: 90,
    dismissChance: 0.3,
  },
  {
    id: '19',
    title: 'Requisition',
    detail: 'Merges two files. One clause crosses over; the other file is consumed.',
    ticks: 240,
    // No standing. The cost is a whole case file, and asking for the scarce
    // currency on top would make the expensive form also the rare one — two
    // walls in front of the same door.
    standing: 0,
    goldPerGrade: 60,
    // Cannot fail. 12-C is the wager; this is the thing an officer does when
    // they have decided what they want and are willing to burn a file for it.
    dismissChance: 0,
  },
];

export function formSpec(id: FormId): FormSpec | undefined {
  return FORM_CATALOGUE.find((form) => form.id === id);
}

export function formGoldCost(form: FormSpec, grade: number): number {
  return form.goldPerGrade * Math.max(1, grade);
}

/**
 * Union Standing earned per grade at a promotion.
 *
 * **Two, and the first attempt at one was wrong for a reason worth keeping.**
 * The reasoning was: the log has said *"Union Standing +1"* on every grade
 * review since long before there was a number behind it, a career ends around
 * Grade 13, so a career banks about twelve and an arbitration costing three
 * buys four contested clauses in a working life.
 *
 * That arithmetic ignored succession. A successor inherits most of the
 * predecessor's grade — that is the whole point of `inheritedLevel` — so a
 * career does not climb from 1 to 13, it climbs from about 10 to 13. Measured
 * over 24 careers at the moments a case file was actually in hand, the median
 * standing held was **2**, against a form costing 3: most of the time the
 * control would be dark, and a player would read that as broken rather than
 * as scarce.
 *
 * At two per grade a career banks six or so, which is two arbitrations — the
 * intended shape, "shape one file you care about", arrived at from the
 * measurement rather than from the wrong half of it.
 */
export const STANDING_PER_GRADE = 2;
