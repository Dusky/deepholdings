import type { LootPriority } from './domain.js';

/**
 * Case files — the first slice of Requisition & Arbitration.
 *
 * `docs/design/crafting.md` describes the whole system: six forms, arbitration
 * that can fail, an ARMOURY screen, provenance settlements. This is the
 * staging plan that document asks for — "ship items and clauses first and the
 * full form catalogue second" — because the clauses are what make the system
 * worth having and the forms are what make it big.
 *
 * ## Not every drop is a case file
 *
 * Ordinary loot stays what it is: a stack, keyed by name, sold by the lot.
 * That constraint is load-bearing and predates this file — `stow()` groups by
 * name, so if every acquisition were unique the twelve-slot cabinet would
 * thrash permanently and everything would liquidate at depot rates.
 *
 * So a case file is a *rare* find that arrives instead of ordinary loot. The
 * fiction agrees with the mechanics for once: most of what a recruit hauls out
 * is junk to be weighed and sold, and once in a while something turns up with
 * contested ownership and gets a case number.
 *
 * ## What clauses do
 *
 * Three effects, deliberately few. A stat block with a dozen dimensions is
 * unmeasurable — the balance harness could not tell you which one mattered,
 * and neither could a player.
 *
 *   vigour     flat maximum HP
 *   survival   proportional reduction in damage taken
 *   lootValue  proportional bonus to what the recruit brings back
 *
 * Riders carry the drawbacks, which is what gives an item a personality: the
 * good sword that costs you a little survivability every time you carry it.
 */

export type ClauseKind = 'endorsement' | 'rider';

export interface Clause {
  id: string;
  kind: ClauseKind;
  /** Reads as a prefix for endorsements, a suffix for riders. */
  text: string;
  /** Lowest item grade this can roll on. */
  minGrade: number;
  vigour?: number;
  survival?: number;
  lootValue?: number;
}

/**
 * Endorsements: the upside. Small integers and modest percentages, per the
 * design's guardrail — a Grade V item is meaningfully better than a Grade I,
 * not four orders of magnitude better.
 */
const ENDORSEMENTS: readonly Clause[] = [
  { id: 'e-certified', kind: 'endorsement', text: 'Municipally Certified', minGrade: 1, vigour: 3 },
  { id: 'e-inspected', kind: 'endorsement', text: 'Inspected and Passed', minGrade: 1, survival: 0.012 },
  { id: 'e-surplus', kind: 'endorsement', text: 'Departmental Surplus', minGrade: 1, lootValue: 0.03 },
  { id: 'e-reinforced', kind: 'endorsement', text: 'Structurally Reinforced', minGrade: 2, vigour: 6 },
  { id: 'e-warranted', kind: 'endorsement', text: 'Under Warranty', minGrade: 2, survival: 0.02 },
  { id: 'e-appraised', kind: 'endorsement', text: 'Favourably Appraised', minGrade: 2, lootValue: 0.05 },
  { id: 'e-commissioned', kind: 'endorsement', text: 'Specially Commissioned', minGrade: 3, vigour: 10 },
  { id: 'e-hazard', kind: 'endorsement', text: 'Hazard-Rated', minGrade: 3, survival: 0.03 },
  { id: 'e-schedule', kind: 'endorsement', text: 'On the Approved Schedule', minGrade: 3, lootValue: 0.08 },
  { id: 'e-founder', kind: 'endorsement', text: "of the Founder's Own Pattern", minGrade: 4, vigour: 15, survival: 0.015 },
  { id: 'e-priority', kind: 'endorsement', text: 'Priority Requisition', minGrade: 4, lootValue: 0.11, vigour: 5 },
];

/**
 * Riders: the cost. Every one is a real drawback, because an item with no
 * downside is a number and an item with a downside is a decision.
 */
const RIDERS: readonly Clause[] = [
  { id: 'r-contested', kind: 'rider', text: 'of Contested Ownership', minGrade: 1, lootValue: 0.07, survival: -0.025 },
  { id: 'r-heavy', kind: 'rider', text: 'of Excessive Weight', minGrade: 1, vigour: 5, survival: -0.02 },
  { id: 'r-provisional', kind: 'rider', text: 'of Provisional Certification', minGrade: 1, survival: 0.03, vigour: -4 },
  { id: 'r-audit', kind: 'rider', text: 'Pending Audit', minGrade: 2, lootValue: 0.1, vigour: -7 },
  { id: 'r-condemned', kind: 'rider', text: 'Condemned but Serviceable', minGrade: 2, vigour: 10, survival: -0.035 },
  { id: 'r-clerical', kind: 'rider', text: 'of a Clerical Error', minGrade: 2, survival: 0.05, lootValue: -0.06 },
  { id: 'r-cursed', kind: 'rider', text: 'Lightly Cursed', minGrade: 3, lootValue: 0.15, vigour: -11 },
  { id: 'r-seized', kind: 'rider', text: 'Seized in Lieu of Payment', minGrade: 3, vigour: 16, survival: -0.05 },
  { id: 'r-unresolved', kind: 'rider', text: 'of Unresolved Standing', minGrade: 4, vigour: 19, lootValue: -0.09 },
];

export const ALL_CLAUSES: readonly Clause[] = [...ENDORSEMENTS, ...RIDERS];

export function clauseById(id: string): Clause | undefined {
  return ALL_CLAUSES.find((clause) => clause.id === id);
}

export interface CaseFile {
  /** Case number, shown to the player. Unique within a recruit's file. */
  id: string;
  /** Base type, from the same authored loot names ordinary drops use. */
  name: string;
  category: LootPriority;
  /** I to V. Sets how many clauses the item carries and which tiers can roll. */
  grade: number;
  /** Book value, before clauses. Case files sell for more than plain loot. */
  unitValue: number;
  clauseIds: readonly string[];
}

export interface StatBlock {
  vigour: number;
  survival: number;
  lootValue: number;
}

export const NO_STATS: StatBlock = { vigour: 0, survival: 0, lootValue: 0 };

/**
 * Ceilings on the whole carried set.
 *
 * **These are load-bearing, and the first version did not have them.** With
 * six files of up to four clauses each and nothing but a survival clamp, a
 * fortnight of default play carried +254 vigour, survival pinned at its cap
 * and +160% loot — and the balance harness reported *zero deaths in thirty of
 * thirty careers* and zero pension in all thirty. That is the "default orders
 * are a dead end" failure the game already fixed once, recreated by a new
 * system: no death means no pension, and no pension means the entire prestige
 * half is invisible.
 *
 * So the caps are the design, and the clause values are the pacing inside
 * them. Sizing: a Grade 12 recruit has ~161 base maximum HP, so +25% is about
 * forty — noticeable, not transformative. Survival at 0.15 shaves a seventh
 * off an ordinary blow. Neither can carry a recruit past the retreat
 * threshold that is supposed to be deciding their fate.
 */
export const MAX_VIGOUR_FRACTION = 0.12;
export const MAX_SURVIVAL = 0.06;
export const MAX_LOOT_VALUE = 0.2;

export function statsOf(files: readonly CaseFile[], baseMaxHp = 161): StatBlock {
  const total = { ...NO_STATS };
  for (const file of files) {
    for (const id of file.clauseIds) {
      const clause = clauseById(id);
      if (!clause) continue;
      total.vigour += clause.vigour ?? 0;
      total.survival += clause.survival ?? 0;
      total.lootValue += clause.lootValue ?? 0;
    }
  }
  // Vigour is capped as a share of the recruit's own maximum, so a case file
  // is worth the same *proportion* to a Grade 2 and a Grade 20 rather than
  // being decisive early and irrelevant late.
  const vigourCap = Math.round(baseMaxHp * MAX_VIGOUR_FRACTION);
  total.vigour = Math.max(-vigourCap, Math.min(vigourCap, total.vigour));
  total.survival = Math.max(-MAX_SURVIVAL, Math.min(MAX_SURVIVAL, total.survival));
  // A negative multiplier would pay the recruit to find nothing.
  total.lootValue = Math.max(-0.5, Math.min(MAX_LOOT_VALUE, total.lootValue));
  return total;
}

/**
 * What the files add up to, before and after the ceilings.
 *
 * The ARMOURY screen needs both halves. A player looking at four clauses that
 * read `+15 vigour` and a stat line that moved by nineteen will conclude the
 * game is broken, and they will be closer to right than a screen that quietly
 * shows only the capped figure — the clauses really did roll that high, and
 * the ceiling really did take the rest. Saying so turns a bug report into a
 * decision about what to carry.
 */
export interface CarriedEffect {
  /** Straight sum of every clause on every file. */
  raw: StatBlock;
  /** What resolution actually uses. */
  effective: StatBlock;
  /** The ceilings, in the same units as the fields they bound. */
  caps: StatBlock;
}

export function carriedEffect(files: readonly CaseFile[], baseMaxHp = 161): CarriedEffect {
  const raw = { ...NO_STATS };
  for (const file of files) {
    for (const id of file.clauseIds) {
      const clause = clauseById(id);
      if (!clause) continue;
      raw.vigour += clause.vigour ?? 0;
      raw.survival += clause.survival ?? 0;
      raw.lootValue += clause.lootValue ?? 0;
    }
  }
  return {
    raw,
    effective: statsOf(files, baseMaxHp),
    caps: {
      vigour: Math.round(baseMaxHp * MAX_VIGOUR_FRACTION),
      survival: MAX_SURVIVAL,
      lootValue: MAX_LOOT_VALUE,
    },
  };
}

/** How many clauses a grade carries. A table, because it is five numbers. */
const SLOTS_BY_GRADE = [1, 1, 2, 3, 4] as const;

export function clauseSlots(grade: number): number {
  return SLOTS_BY_GRADE[Math.max(0, Math.min(4, grade - 1))];
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

export function romanGrade(grade: number): string {
  return ROMAN[Math.max(0, Math.min(4, grade - 1))];
}

/** Rendered for the Ledger and the Terminal. */
export function caseFileTitle(file: CaseFile): string {
  return `${file.name} — Grade ${romanGrade(file.grade)}`;
}

/** "Municipally Certified · of Contested Ownership", for one line of display. */
export function clauseLine(file: CaseFile): string {
  return file.clauseIds
    .map((id) => clauseById(id)?.text)
    .filter(Boolean)
    .join(' · ');
}
