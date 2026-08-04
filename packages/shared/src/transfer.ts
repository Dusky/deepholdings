/**
 * Transfer: the officer's own prestige.
 *
 * ## Why a second layer at all
 *
 * Death is the *recruit's* reset and it always has been. The officer never had
 * one, which is why the ninety-day run ends the way it does: nineteen pension
 * rungs, seven requisitions, nine registry rungs, and after the last of them
 * the game is repetition with a larger number on it. A prestige layer is the
 * genre's answer and the only one that makes a fixed catalogue re-earnable
 * rather than finished.
 *
 * The fiction was already sitting there. You are a case officer; case officers
 * get posted somewhere else. Filing for a transfer hands your caseload back,
 * takes your pension entitlement with it, and the Authority notes your service
 * on the way out — which is what a Commendation is.
 *
 * ## What crosses and what does not
 *
 * Resets: the pension (total, spent, every rung), the permit tier, the recruit.
 * Keeps: the department, the office equipment, and the Commendations.
 *
 * The department staying is the load-bearing half. Staff are *yours* — you
 * appointed them, you pay them — and a posting does not take your people. It
 * also means the transfer is survivable: a fresh Grade 1 recruit with a Chief
 * Filing Clerk still on the books is a different proposition from starting over
 * alone, and "different proposition" is what stops a prestige reset reading as
 * punishment. Requisitions stay for a duller reason: they are interface
 * conveniences bought with gold, and confiscating somebody's journal length is
 * a cost with no design behind it.
 *
 * ## The award is linear, on purpose
 *
 * One Commendation per 150,000 pension ever banked since the last transfer.
 * Linear means transferring early is neither punished nor rewarded — the rate
 * is the same whether you file at 150,000 or at 1,500,000 — so there is no
 * optimal moment to work out and no way to get it wrong. Prestige systems in
 * this genre are complained about for exactly that: not knowing when to pull
 * the lever, and finding out afterwards that you pulled it wrong.
 *
 * Depth is deliberately *not* a second term. It is already inside the pension
 * formula, which accrues at a rate set by how deep the officer operates; paying
 * for it again here would count the same decision twice.
 */
import type { LadderEntry } from './tuning.js';

export type CommendationTrack = 'intake' | 'audience' | 'patronage' | 'stretch' | 'secondment';

export type CommendationId =
  | 'intake1' | 'intake2' | 'intake3'
  | 'stretch1' | 'stretch2' | 'stretch3'
  | 'audience1' | 'audience2' | 'audience3'
  | 'patronage1' | 'patronage2' | 'patronage3'
  | 'secondment1';

/** Account-level and permanent. Nothing here is ever spent by a reset. */
export interface Transfer {
  /** Unspent Commendations. */
  total: number;
  spent: number;
  unlocks: CommendationId[];
  /** Transfers filed, ever. Zero for an officer still on their first posting. */
  careers: number;
}

export const EMPTY_TRANSFER: Transfer = { total: 0, spent: 0, unlocks: [], careers: 0 };

/**
 * Pension banked per Commendation.
 *
 * Set against the measured curve rather than picked: ninety days of engaged
 * play banks about 1.59M, so a full quarter is worth ten, and the catalogue
 * below costs thirty-six. That is the "months, not weeks" figure the research
 * note asked for, and it is reachable rather than theoretical.
 */
export const PENSION_PER_COMMENDATION = 150_000;

/** What filing Form T-1 would pay right now. */
export function commendationAward(pensionBanked: number): number {
  return Math.floor(Math.max(0, pensionBanked) / PENSION_PER_COMMENDATION);
}

/** Whether the Authority would accept the form. */
export function canTransfer(pensionBanked: number): boolean {
  return commendationAward(pensionBanked) >= 1;
}

/**
 * The catalogue.
 *
 * Every track exists to make the *next* posting different rather than to make
 * this one stronger, which is the test a prestige reward has to pass: a bonus
 * you feel before you reset is a bonus you would rather not reset to keep.
 */
export const COMMENDATION_CATALOGUE: readonly LadderEntry<CommendationId, CommendationTrack>[] = [
  // Softens the reset where it bites hardest — a Grade 1 recruit on Floor 1
  // after months at Floor 12. Tier 3 is Grade 12 because that is `MAX_DEPTH`:
  // recruits arrive cleared for the deepest floor the Authority authorises, and
  // the ceiling stops it inflating past a number the balance work has measured.
  // Grade *and* permit, in one track, because they were never really two.
  //
  // `authorisedDepth` is a minimum of the grade term and the permit term, so an
  // officer who bought Grade 12 on arrival and no permit arrived cleared for
  // Floor 12 and authorised for Floor 2. Buying half of this was worthless,
  // which made it a pair to be bought together rather than a choice — and it
  // cost the catalogue a whole slot to say one thing twice.
  { id: 'intake1', track: 'intake', tier: 1, cost: 2, label: 'Standing Requisition of Personnel I',
    detail: 'Recruits arrive at Grade 4, cleared to Permit D-2.' },
  { id: 'intake2', track: 'intake', tier: 2, cost: 4, label: 'Standing Requisition of Personnel II',
    detail: 'Recruits arrive at Grade 8, cleared to Permit D-4.' },
  { id: 'intake3', track: 'intake', tier: 3, cost: 9, label: 'Standing Requisition of Personnel III',
    detail: 'Recruits arrive at Grade 12, cleared to Permit D-6.' },

  // The slot that freed, spent on a decision instead of a discount.
  //
  // Working below your grade is the oldest good idea in this codebase that has
  // never once fired: `GRADE_STRETCH` is pinned at zero and its own comment
  // explains why — "a flat stretch applies to a Grade I recruit on their first
  // morning as readily as to a veteran", and at one floor it took balanced play
  // from 1.7 deaths a week to seventeen.
  //
  // A prestige gate is exactly the thing that fixes that objection. Nobody
  // reaches this without having filed Form T-1, by which point they have intake,
  // a department and a drawer of case files. It is the one reward here that a
  // player can decline on purpose: more depth means more gold and more pension,
  // both superlinear, paid for in recruits.
  { id: 'stretch1', track: 'stretch', tier: 1, cost: 1, label: 'Dispensation to Work Below Grade I',
    detail: 'Recruits may work one floor deeper than their grade allows.' },
  { id: 'stretch2', track: 'stretch', tier: 2, cost: 2, label: 'Dispensation to Work Below Grade II',
    detail: 'Two floors deeper. They will not all come back.' },
  { id: 'stretch3', track: 'stretch', tier: 3, cost: 4, label: 'Dispensation to Work Below Grade III',
    detail: 'Three floors deeper. The Authority accepts no correspondence on the matter.' },

  // Arbitration made repeatable, which turns case files from what you were
  // given into what you chose.
  //
  // The 30% dismissal stays untouched at every tier. `forms.ts` is explicit that
  // the risk is the point — "a reroll that always succeeds is a slider, and the
  // player sets it to maximum and stops thinking about it" — so this buys
  // *frequency*, never certainty. Standing is the scarce currency that makes
  // 12-C a once-in-a-while event; spending less of it per filing is what lets an
  // officer actually shape a build rather than accept one.
  { id: 'audience1', track: 'audience', tier: 1, cost: 1, label: 'Right of Audience I',
    detail: 'Form 12-C costs 2 standing instead of 3.' },
  { id: 'audience2', track: 'audience', tier: 2, cost: 3, label: 'Right of Audience II',
    detail: 'Form 12-C costs 1 standing.' },
  { id: 'audience3', track: 'audience', tier: 3, cost: 6, label: 'Right of Audience III',
    detail: 'Form 12-C may be filed without standing. It may still be dismissed.' },

  // The department survives a transfer, so the wage does too. This is the one
  // reward that gets better the more of slice 3 you bought.
  { id: 'patronage1', track: 'patronage', tier: 1, cost: 1, label: 'Departmental Patronage I',
    detail: 'The Authority meets 20% of your payroll.' },
  { id: 'patronage2', track: 'patronage', tier: 2, cost: 2, label: 'Departmental Patronage II',
    detail: 'The Authority meets 45% of your payroll.' },
  { id: 'patronage3', track: 'patronage', tier: 3, cost: 4, label: 'Departmental Patronage III',
    detail: 'The Authority meets 70% of your payroll.' },

  // One rung, and the only thing in this catalogue that unlocks a *place*
  // rather than a number. Priced above the tier-1 rungs so it is not simply the
  // first thing an officer buys — it is worth reaching a second posting for.
  { id: 'secondment1', track: 'secondment', tier: 1, cost: 3, label: 'Secondment to the Annexe',
    detail: 'Form SO-1 may name the Annexe. It pays better and kills faster.' },
];

export function commendationTier(
  owned: readonly CommendationId[],
  track: CommendationTrack,
): number {
  return COMMENDATION_CATALOGUE.filter(
    (entry) => entry.track === track && owned.includes(entry.id),
  ).length;
}

/** The grade a recruit can never arrive below. */
export function intakeFloor(owned: readonly CommendationId[]): number {
  return [1, 4, 8, 12][commendationTier(owned, 'intake')];
}

/** The share of payroll the officer still pays. */
export function payrollShare(owned: readonly CommendationId[]): number {
  return [1, 0.8, 0.55, 0.3][commendationTier(owned, 'patronage')];
}

/** The permit tier a new posting starts on. */
export function startingPermitTier(owned: readonly CommendationId[]): number {
  return [1, 2, 4, 6][commendationTier(owned, 'intake')];
}

/**
 * Floors past their grade this officer's recruits may be sent.
 *
 * Added to `GRADE_STRETCH` rather than replacing it: the constant stays the
 * global floor (zero, and measured to be the only safe value to hand everyone)
 * and this is the exemption an officer earned.
 */
export function grantedStretch(owned: readonly CommendationId[]): number {
  return commendationTier(owned, 'stretch');
}

/**
 * What Form 12-C costs this officer in standing.
 *
 * Never touches `dismissChance` — see the Right of Audience note above and the
 * one in `forms.ts`. Frequency is buyable; certainty is not.
 */
export function arbitrationStanding(base: number, owned: readonly CommendationId[]): number {
  return Math.max(0, base - commendationTier(owned, 'audience'));
}
