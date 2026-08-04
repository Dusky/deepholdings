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
 * Six effects. It was three, and three was correct for a pool of twenty:
 * a stat block with a dozen dimensions is unmeasurable, and the harness could
 * not have told you which one mattered.
 *
 *   vigour     flat maximum HP
 *   survival   proportional reduction in damage taken
 *   lootValue  proportional bonus to what the recruit brings back
 *   expertise  proportional bonus to experience per encounter
 *   thrift     proportional reduction in how fast supplies burn
 *   recovery   proportional bonus to healing at the surface
 *
 * The pool is eighty now, and eighty clauses over three dimensions would not be
 * eighty decisions — it would be twenty-seven ways of writing "+N health" and a
 * naming problem. The three additions each hook something the resolver already
 * did, so none of them invents a subsystem, and between them they add the
 * *kind* of decision the first three could not: vigour, survival and loot value
 * all answer "how does this run go", where expertise, thrift and recovery
 * answer "how does this career go".
 *
 * Riders carry the drawbacks, which is what gives an item a personality: the
 * good sword that costs you a little survivability every time you carry it —
 * and now also the reference book that will not let you rest, and the kit that
 * keeps you alive while eating your rations twice as fast.
 */

export type ClauseKind = 'endorsement' | 'rider';

export interface Clause {
  id: string;
  kind: ClauseKind;
  /** Reads as a prefix for endorsements, a suffix for riders. */
  text: string;
  /** Lowest item grade this can roll on. */
  minGrade: number;
  /** Flat maximum HP. */
  vigour?: number;
  /** Proportional reduction in damage taken. */
  survival?: number;
  /** Proportional bonus to what the recruit brings back. */
  lootValue?: number;
  /** Proportional bonus to experience per encounter. */
  expertise?: number;
  /** Proportional reduction in how fast supplies burn underground. */
  thrift?: number;
  /** Proportional bonus to healing while resting at the surface. */
  recovery?: number;
}

/**
 * Endorsements: the upside. Small integers and modest percentages, per the
 * design's guardrail — a Grade V item is meaningfully better than a Grade I,
 * not four orders of magnitude better.
 */
const ENDORSEMENTS: readonly Clause[] = [
  // --- Vigour: flat maximum HP -------------------------------------------
  { id: 'e-certified', kind: 'endorsement', text: 'Municipally Certified', minGrade: 1, vigour: 3 },
  { id: 'e-padded', kind: 'endorsement', text: 'Padded to Regulation', minGrade: 1, vigour: 4 },
  { id: 'e-reinforced', kind: 'endorsement', text: 'Structurally Reinforced', minGrade: 2, vigour: 6 },
  { id: 'e-plated', kind: 'endorsement', text: 'Double-Plated', minGrade: 2, vigour: 8 },
  { id: 'e-commissioned', kind: 'endorsement', text: 'Specially Commissioned', minGrade: 3, vigour: 10 },
  { id: 'e-overbuilt', kind: 'endorsement', text: 'Overengineered', minGrade: 4, vigour: 13 },
  { id: 'e-founder', kind: 'endorsement', text: "of the Founder's Own Pattern", minGrade: 4, vigour: 15, survival: 0.015 },
  { id: 'e-heavy', kind: 'endorsement', text: 'of the Heavy Register', minGrade: 5, vigour: 18 },

  // --- Survival: proportional damage reduction ---------------------------
  { id: 'e-lined', kind: 'endorsement', text: 'Lined as Standard', minGrade: 1, survival: 0.01 },
  { id: 'e-inspected', kind: 'endorsement', text: 'Inspected and Passed', minGrade: 1, survival: 0.012 },
  { id: 'e-warranted', kind: 'endorsement', text: 'Under Warranty', minGrade: 2, survival: 0.02 },
  { id: 'e-hazard', kind: 'endorsement', text: 'Hazard-Rated', minGrade: 3, survival: 0.03 },
  { id: 'e-blast', kind: 'endorsement', text: 'Blast-Certified', minGrade: 4, survival: 0.04 },
  { id: 'e-protective', kind: 'endorsement', text: 'of the Protective Schedule', minGrade: 5, survival: 0.05 },

  // --- Loot value --------------------------------------------------------
  { id: 'e-duplicate', kind: 'endorsement', text: 'Catalogued in Duplicate', minGrade: 1, lootValue: 0.025 },
  { id: 'e-surplus', kind: 'endorsement', text: 'Departmental Surplus', minGrade: 1, lootValue: 0.03 },
  { id: 'e-appraised', kind: 'endorsement', text: 'Favourably Appraised', minGrade: 2, lootValue: 0.05 },
  { id: 'e-schedule', kind: 'endorsement', text: 'On the Approved Schedule', minGrade: 3, lootValue: 0.08 },
  { id: 'e-priority', kind: 'endorsement', text: 'Priority Requisition', minGrade: 4, lootValue: 0.11, vigour: 5 },
  { id: 'e-provenance', kind: 'endorsement', text: 'of Notable Provenance', minGrade: 5, lootValue: 0.14 },

  // --- Expertise: experience per encounter -------------------------------
  { id: 'e-annotated', kind: 'endorsement', text: 'Annotated in the Margin', minGrade: 1, expertise: 0.03 },
  { id: 'e-teaching', kind: 'endorsement', text: 'of the Teaching Collection', minGrade: 2, expertise: 0.05 },
  { id: 'e-crossref', kind: 'endorsement', text: 'Cross-Referenced', minGrade: 3, expertise: 0.08 },
  { id: 'e-textbook', kind: 'endorsement', text: 'of the Standard Textbook', minGrade: 4, expertise: 0.11 },
  { id: 'e-curriculum', kind: 'endorsement', text: 'of the Founding Curriculum', minGrade: 5, expertise: 0.14 },

  // --- Thrift: how slowly supplies burn ----------------------------------
  { id: 'e-ration', kind: 'endorsement', text: 'Ration-Stamped', minGrade: 1, thrift: 0.04 },
  { id: 'e-economical', kind: 'endorsement', text: 'of Economical Issue', minGrade: 2, thrift: 0.06 },
  { id: 'e-portioned', kind: 'endorsement', text: 'Efficiently Portioned', minGrade: 3, thrift: 0.09 },
  { id: 'e-campaign', kind: 'endorsement', text: 'of the Long Campaign', minGrade: 4, thrift: 0.13 },
  { id: 'e-siege', kind: 'endorsement', text: 'of the Siege Register', minGrade: 5, thrift: 0.17 },

  // --- Recovery: healing while resting at the surface --------------------
  { id: 'e-cleared', kind: 'endorsement', text: 'Medically Cleared', minGrade: 1, recovery: 0.05 },
  { id: 'e-convalescent', kind: 'endorsement', text: 'of the Convalescent Ward', minGrade: 2, recovery: 0.08 },
  { id: 'e-dressed', kind: 'endorsement', text: 'Field-Dressed', minGrade: 3, recovery: 0.12 },
  { id: 'e-restorative', kind: 'endorsement', text: 'of Restorative Character', minGrade: 4, recovery: 0.17 },
  { id: 'e-sanatorium', kind: 'endorsement', text: 'of the Sanatorium Pattern', minGrade: 5, recovery: 0.22 },

  // --- Two dimensions at once: the ones a build is actually planned round -
  { id: 'e-wellfound', kind: 'endorsement', text: 'Well-Found and Serviceable', minGrade: 2, vigour: 4, recovery: 0.05 },
  { id: 'e-tidy', kind: 'endorsement', text: 'of Tidy Provenance', minGrade: 2, lootValue: 0.035, thrift: 0.04 },
  { id: 'e-filing', kind: 'endorsement', text: 'of Exemplary Filing', minGrade: 3, vigour: 6, expertise: 0.05 },
  { id: 'e-quartermaster', kind: 'endorsement', text: "the Quartermaster's Favourite", minGrade: 3, thrift: 0.07, lootValue: 0.04 },
  { id: 'e-expedition', kind: 'endorsement', text: 'of the Model Expedition', minGrade: 4, recovery: 0.1, survival: 0.015 },
  { id: 'e-completeset', kind: 'endorsement', text: 'of the Complete Set', minGrade: 4, lootValue: 0.06, expertise: 0.06 },
  { id: 'e-veteran', kind: 'endorsement', text: 'of the Veteran Detachment', minGrade: 4, vigour: 7, thrift: 0.06 },
  { id: 'e-estate', kind: 'endorsement', text: "of the Commissioner's Estate", minGrade: 5, vigour: 9, recovery: 0.1 },
  { id: 'e-impeccable', kind: 'endorsement', text: 'of Impeccable Standing', minGrade: 5, survival: 0.025, thrift: 0.08 },
  { id: 'e-scholar', kind: 'endorsement', text: "of the Scholar's Bequest", minGrade: 5, expertise: 0.1, lootValue: 0.05 },
  { id: 'e-honours', kind: 'endorsement', text: 'with Full Honours', minGrade: 5, survival: 0.03, recovery: 0.12 },
];

/**
 * Riders: the drawbacks, and what makes an item have a personality.
 *
 * Every one is a real trade — a genuine upside paid for in another dimension —
 * because a clause that is only a cost is one the player throws away, and then
 * the system may as well not have fired. With six dimensions the trades can now
 * be *interesting* rather than merely negative: the good sword that eats your
 * rations, the reference book that will not let you rest.
 */
const RIDERS: readonly Clause[] = [
  { id: 'r-contested', kind: 'rider', text: 'of Contested Ownership', minGrade: 1, lootValue: 0.07, survival: -0.025 },
  { id: 'r-heavy', kind: 'rider', text: 'of Excessive Weight', minGrade: 1, vigour: 5, survival: -0.02 },
  { id: 'r-provisional', kind: 'rider', text: 'of Provisional Certification', minGrade: 1, survival: 0.03, vigour: -4 },
  { id: 'r-mislabelled', kind: 'rider', text: 'Mislabelled at Intake', minGrade: 1, expertise: 0.06, thrift: -0.05 },
  { id: 'r-damp', kind: 'rider', text: 'Stored Somewhere Damp', minGrade: 1, thrift: 0.06, recovery: -0.06 },

  { id: 'r-audit', kind: 'rider', text: 'Pending Audit', minGrade: 2, lootValue: 0.1, vigour: -7 },
  { id: 'r-condemned', kind: 'rider', text: 'Condemned but Serviceable', minGrade: 2, vigour: 10, survival: -0.035 },
  { id: 'r-clerical', kind: 'rider', text: 'of a Clerical Error', minGrade: 2, survival: 0.05, lootValue: -0.06 },
  { id: 'r-authorship', kind: 'rider', text: 'of Disputed Authorship', minGrade: 2, expertise: 0.12, lootValue: -0.07 },
  { id: 'r-overweight', kind: 'rider', text: 'of the Overweight Ledger', minGrade: 2, vigour: 12, thrift: -0.12 },
  { id: 'r-borrowed', kind: 'rider', text: 'on Indefinite Loan', minGrade: 2, recovery: 0.1, lootValue: -0.05 },
  { id: 'r-superseded', kind: 'rider', text: 'Superseded but Retained', minGrade: 2, expertise: 0.09, survival: -0.02 },

  { id: 'r-cursed', kind: 'rider', text: 'Lightly Cursed', minGrade: 3, lootValue: 0.15, vigour: -11 },
  { id: 'r-seized', kind: 'rider', text: 'Seized in Lieu of Payment', minGrade: 3, vigour: 16, survival: -0.05 },
  { id: 'r-error', kind: 'rider', text: 'Requisitioned in Error', minGrade: 3, lootValue: 0.13, expertise: -0.09 },
  { id: 'r-vintage', kind: 'rider', text: 'of Uncertain Vintage', minGrade: 3, recovery: 0.18, survival: -0.03 },
  { id: 'r-unsigned', kind: 'rider', text: 'Filed Without Signature', minGrade: 3, expertise: 0.15, vigour: -9 },
  { id: 'r-informal', kind: 'rider', text: 'of Informal Issue', minGrade: 3, thrift: 0.11, vigour: -8 },
  { id: 'r-hazardous', kind: 'rider', text: 'of Hazardous Character', minGrade: 3, survival: 0.045, recovery: -0.12 },
  { id: 'r-secondhand', kind: 'rider', text: 'of Second-Hand Issue', minGrade: 3, recovery: 0.15, expertise: -0.08 },

  { id: 'r-unresolved', kind: 'rider', text: 'of Unresolved Standing', minGrade: 4, vigour: 19, lootValue: -0.09 },
  { id: 'r-abandoned', kind: 'rider', text: 'of the Abandoned Survey', minGrade: 4, thrift: 0.16, lootValue: -0.1 },
  { id: 'r-irregular', kind: 'rider', text: 'of Irregular Provenance', minGrade: 4, lootValue: 0.18, recovery: -0.15 },
  { id: 'r-struck', kind: 'rider', text: 'Struck From the Register', minGrade: 4, vigour: 20, expertise: -0.12 },
  { id: 'r-inherited', kind: 'rider', text: 'Inherited Without Papers', minGrade: 4, expertise: 0.14, thrift: -0.1 },
  { id: 'r-obsolete', kind: 'rider', text: 'of an Obsolete Pattern', minGrade: 4, thrift: 0.14, survival: -0.03 },
  { id: 'r-overdue', kind: 'rider', text: 'Overdue for Return', minGrade: 4, recovery: 0.2, lootValue: -0.08 },

  { id: 'r-estate', kind: 'rider', text: 'of the Contested Estate', minGrade: 5, survival: 0.055, thrift: -0.15 },
  { id: 'r-inquiry', kind: 'rider', text: 'of the Sealed Inquiry', minGrade: 5, expertise: 0.2, recovery: -0.2 },
  { id: 'r-posthumous', kind: 'rider', text: 'of Posthumous Award', minGrade: 5, recovery: 0.28, vigour: -12 },
  { id: 'r-unaudited', kind: 'rider', text: 'of the Unresolved Audit', minGrade: 5, lootValue: 0.2, survival: -0.04 },
  { id: 'r-scandal', kind: 'rider', text: 'of the Scandalous Estate', minGrade: 5, lootValue: 0.19, expertise: -0.11 },
  { id: 'r-fatal', kind: 'rider', text: 'of the Fatal Inventory', minGrade: 5, vigour: 22, recovery: -0.18 },
  { id: 'r-forbidden', kind: 'rider', text: 'Withdrawn From Circulation', minGrade: 5, expertise: 0.18, survival: -0.035 },
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
  /**
   * Direct Issue (Form 5-E): the officer has kept this file by hand.
   *
   * A countersigned file is never displaced by the quartermaster, **even by a
   * strictly better one**. That is the whole promise and it does not bend: the
   * system may say in the log that something better was passed over, but it may
   * not act. An explicit instruction that gets quietly overridden when the
   * machine disagrees is worse than no instruction at all.
   *
   * Lives on the file rather than on a slot index, which gets rule 3 of the
   * design for free — a countersignature survives death exactly when the file
   * it belongs to does.
   */
  countersigned?: boolean;
}

/**
 * What a clause can move.
 *
 * ## Why there are six and not three
 *
 * Three was right for twenty clauses and wrong for eighty. The pool is being
 * widened because builds need combinations that cannot be enumerated in an
 * afternoon — see `docs/research/progression-depth.md`, where the closest
 * competitor carries 100+ affixes over dozens of stats against our 20 over
 * three. But eighty clauses spread over three dimensions is not eighty
 * decisions, it is twenty-seven ways of writing "+N health" and a naming
 * problem. Dimensions are what make a clause distinctive; the count is what
 * makes the pool deep.
 *
 * ## Why *these* three
 *
 * Each hooks something the resolver already does, so none of them invents a
 * subsystem:
 *
 *   expertise  experience per encounter — `encounterXp`
 *   thrift     how fast supplies burn — `SUPPLY_DRAIN_TICKS`
 *   recovery   how fast a recruit heals at the surface
 *
 * They also spread the *kind* of decision. Vigour, survival and loot value all
 * answer "how does this run go"; these three answer "how does this career go",
 * which is the axis a build is actually chosen along.
 */
export interface StatBlock {
  vigour: number;
  survival: number;
  lootValue: number;
  expertise: number;
  thrift: number;
  recovery: number;
}

export const NO_STATS: StatBlock = {
  vigour: 0, survival: 0, lootValue: 0, expertise: 0, thrift: 0, recovery: 0,
};

/** Every dimension, so a new one cannot be added to the type and forgotten here. */
export const STAT_KEYS = [
  'vigour', 'survival', 'lootValue', 'expertise', 'thrift', 'recovery',
] as const;

/**
 * Ceilings on the whole carried set.
 *
 * **These are load-bearing, and the first version did not have them.** With
 * six files of up to four clauses each — the drawer holds three now, see
 * `CASE_FILE_SLOTS` — and nothing but a survival clamp, a
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

/**
 * Ceilings for the three new dimensions, set by the same argument.
 *
 * `thrift` is the one to watch. Starvation is a real cause of death, so a large
 * enough thrift bonus removes a whole way to die — and the note above records
 * what happened last time a case-file stat quietly suppressed mortality: zero
 * deaths in thirty careers, and with them zero pension and an invisible
 * prestige half. Capped well short of eliminating the drain.
 *
 * `recovery` is second: faster healing means less time convalescing, which is
 * mostly more income but is also a shorter window in which a hurt recruit can
 * be killed. `expertise` is the safe one — it buys grade, and grade is already
 * capped against depth by `authorisedDepth`.
 */
export const MAX_EXPERTISE = 0.25;
export const MAX_THRIFT = 0.3;
export const MAX_RECOVERY = 0.4;

/**
 * The raw sum, before any ceiling.
 *
 * One accumulator, because `statsOf` and `carriedEffect` both need it and two
 * copies of the same loop is how a seventh dimension gets added to one and not
 * the other. Iterating `STAT_KEYS` rather than naming fields means a new
 * dimension is summed the moment it exists.
 */
function rawStats(files: readonly CaseFile[]): StatBlock {
  const total = { ...NO_STATS };
  for (const file of files) {
    for (const id of file.clauseIds) {
      const clause = clauseById(id);
      if (!clause) continue;
      for (const key of STAT_KEYS) total[key] += clause[key] ?? 0;
    }
  }
  return total;
}

/** The ceilings, at a given recruit size. Vigour's scales; the rest are flat. */
export function statCaps(baseMaxHp = 161): StatBlock {
  return {
    // Capped as a share of the recruit's own maximum, so a case file is worth
    // the same *proportion* to a Grade 2 and a Grade 20 rather than being
    // decisive early and irrelevant late.
    vigour: Math.round(baseMaxHp * MAX_VIGOUR_FRACTION),
    survival: MAX_SURVIVAL,
    lootValue: MAX_LOOT_VALUE,
    expertise: MAX_EXPERTISE,
    thrift: MAX_THRIFT,
    recovery: MAX_RECOVERY,
  };
}

export function statsOf(files: readonly CaseFile[], baseMaxHp = 161): StatBlock {
  const total = rawStats(files);
  const caps = statCaps(baseMaxHp);
  for (const key of STAT_KEYS) {
    // Symmetric except for loot value, whose floor is deeper than its ceiling:
    // a negative multiplier past -0.5 would pay the recruit to find nothing.
    const floor = key === 'lootValue' ? -0.5 : -caps[key];
    total[key] = Math.max(floor, Math.min(caps[key], total[key]));
  }
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
  return {
    raw: rawStats(files),
    effective: statsOf(files, baseMaxHp),
    caps: statCaps(baseMaxHp),
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
