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

export type CommendationTrack = 'intake' | 'endowment' | 'patronage' | 'dispensation';

export type CommendationId =
  | 'intake1' | 'intake2' | 'intake3'
  | 'endowment1' | 'endowment2' | 'endowment3'
  | 'patronage1' | 'patronage2' | 'patronage3'
  | 'dispensation1' | 'dispensation2' | 'dispensation3';

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
  { id: 'intake1', track: 'intake', tier: 1, cost: 1, label: 'Standing Requisition of Personnel I',
    detail: 'Recruits arrive no lower than Grade 4.' },
  { id: 'intake2', track: 'intake', tier: 2, cost: 3, label: 'Standing Requisition of Personnel II',
    detail: 'Recruits arrive no lower than Grade 8.' },
  { id: 'intake3', track: 'intake', tier: 3, cost: 7, label: 'Standing Requisition of Personnel III',
    detail: 'Recruits arrive no lower than Grade 12.' },

  { id: 'endowment1', track: 'endowment', tier: 1, cost: 1, label: 'Service Endowment I',
    detail: 'Every pension accrues 15% faster, permanently.' },
  { id: 'endowment2', track: 'endowment', tier: 2, cost: 3, label: 'Service Endowment II',
    detail: 'Every pension accrues 35% faster.' },
  { id: 'endowment3', track: 'endowment', tier: 3, cost: 7, label: 'Service Endowment III',
    detail: 'Every pension accrues 60% faster.' },

  // The department survives a transfer, so the wage does too. This is the one
  // reward that gets better the more of slice 3 you bought.
  { id: 'patronage1', track: 'patronage', tier: 1, cost: 1, label: 'Departmental Patronage I',
    detail: 'The Authority meets 20% of your payroll.' },
  { id: 'patronage2', track: 'patronage', tier: 2, cost: 2, label: 'Departmental Patronage II',
    detail: 'The Authority meets 45% of your payroll.' },
  { id: 'patronage3', track: 'patronage', tier: 3, cost: 4, label: 'Departmental Patronage III',
    detail: 'The Authority meets 70% of your payroll.' },

  { id: 'dispensation1', track: 'dispensation', tier: 1, cost: 1, label: 'Transferred Dispensation I',
    detail: 'A new posting begins with Permit D-2.' },
  { id: 'dispensation2', track: 'dispensation', tier: 2, cost: 2, label: 'Transferred Dispensation II',
    detail: 'A new posting begins with Permit D-4.' },
  { id: 'dispensation3', track: 'dispensation', tier: 3, cost: 4, label: 'Transferred Dispensation III',
    detail: 'A new posting begins with Permit D-6.' },
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

/** Multiplier on every pension award. */
export function endowmentMultiplier(owned: readonly CommendationId[]): number {
  return [1, 1.15, 1.35, 1.6][commendationTier(owned, 'endowment')];
}

/** The share of payroll the officer still pays. */
export function payrollShare(owned: readonly CommendationId[]): number {
  return [1, 0.8, 0.55, 0.3][commendationTier(owned, 'patronage')];
}

/** The permit tier a new posting starts on. */
export function startingPermitTier(owned: readonly CommendationId[]): number {
  return [1, 2, 4, 6][commendationTier(owned, 'dispensation')];
}
