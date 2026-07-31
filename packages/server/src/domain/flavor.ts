/**
 * Journal copy. Deadpan clerical voice: the terrible thing happened, and the
 * form was filed correctly. Kept apart from the resolution rules so writers can
 * work here without touching the simulation.
 *
 * ## What is generated and what is written
 *
 * Encounter names are **generated** from a grammar. The voice is already a
 * template — `{creature}, {qualifier} (Grade N)` — and bureaucratic
 * incongruity is the joke rather than an accident of it, so a small authored
 * corpus multiplies out without reading as filler. Ten species a band against
 * two dozen qualifiers is roughly nine hundred encounters before a repeat,
 * where a flat list of seven repeated every forty minutes.
 *
 * Loot names are **written**, bounded, and never generated. They are inventory
 * stack keys: `stow()` groups by name, so a generated name means every
 * acquisition is its own stack, a twelve-slot cabinet thrashes permanently,
 * and everything liquidates at depot rates. It would also put a name in the
 * journal that does not match the name in the cabinet, which is the exact
 * contradiction the market rework was done to remove.
 *
 * Everything here takes an rng so the same tick always reads the same way. A
 * journal that rewrites itself on refresh is a bug report.
 */
import { rngChance, rngInt, rngPick } from '@deepholdings/shared';

type Rng = () => number;

/**
 * Depth bands. Four of them, because the ladder runs to twelve and three
 * floors is about how long a band stays interesting.
 */
const BAND_COUNT = 4;

export function bandOf(depth: number): number {
  if (depth <= 3) return 0;
  if (depth <= 6) return 1;
  if (depth <= 9) return 2;
  return 3;
}

/**
 * Species by band. Shallow floors are municipal and faintly embarrassing; deep
 * floors are institutional and much older than the Authority.
 */
const SPECIES: readonly (readonly string[])[] = [
  [
    'Kobold', 'Rat King', 'Bat', 'Slime', 'Goblin',
    'Spider', 'Beetle', 'Mould', 'Pigeon', 'Apprentice',
  ],
  [
    'Skeleton', 'Ochre Jelly', 'Ghoul', 'Kobold Foreman', 'Hound',
    'Wasp', 'Automaton', 'Bandit', 'Fungus', 'Auditor',
  ],
  [
    'Wraith', 'Golem', 'Basilisk', 'Knight', 'Swarm',
    'Serpent', 'Librarian', 'Construct', 'Inspector', 'Revenant',
  ],
  [
    'Wyrm', 'Committee', 'Archivist', 'Warden', 'Colossus',
    'Signatory', 'Deep Clerk', 'Shade', 'Thing in the Filing System', 'Founder',
  ],
];

/**
 * Qualifiers. Employment status, paperwork status, and standing — the three
 * things the Authority believes describe anything.
 */
const QUALIFIERS: readonly string[] = [
  'Disgruntled', 'Undocumented', 'Unlicensed', 'Off-Duty', 'Municipal',
  'Overworked', 'Between Postings', 'Requisitioned', 'Notarised', 'Tenured',
  'Out of Warranty', 'Self-Employed', 'Incorporated', 'Pensioned', 'Decommissioned',
  'Partially Certified', 'Retired Under Review', 'Collectively Bargained',
  'Grandfathered', 'Unlabelled', 'Seconded', 'On Secondment', 'Provisional',
  'Acting', 'Emeritus', 'Uninsured', 'Load-Bearing', 'Contested',
];

/** Bands where a grade suffix reads as menace rather than noise. */
const GRADE_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'] as const;

/**
 * One encounter's name.
 *
 * Deeper floors carry a grade more often and a higher one — a Grade VII
 * anything is the Authority admitting it is out of its depth.
 */
export function faunaFor(depth: number, rng: Rng): string {
  const band = bandOf(depth);
  const species = rngPick(rng, SPECIES[band]);
  const qualifier = rngPick(rng, QUALIFIERS);
  const graded = rngChance(rng, 0.25 + band * 0.15);
  if (!graded) return `${species}, ${qualifier}`;
  const floor = band * 2;
  const grade = GRADE_NUMERALS[Math.min(GRADE_NUMERALS.length - 1, rngInt(rng, floor, floor + 2))];
  return `${species}, ${qualifier} (Grade ${grade})`;
}

/** How many distinct encounter names the grammar can produce. Used by tests. */
export const FAUNA_VARIETY =
  BAND_COUNT * SPECIES[0].length * QUALIFIERS.length * (1 + GRADE_NUMERALS.length);

/**
 * Loot, written rather than generated, and bounded on purpose — see the note
 * at the top of this file. Two depth bands: what the upper floors have lying
 * around, and what is down where nobody has filed anything in a century.
 */
const LOOT: Record<string, readonly (readonly string[])[]> = {
  gold: [
    [
      'Coin Purse, Modest', 'Coin Purse, Immodest', 'Petty Cash, Unattended',
      'Small Change, Contested', 'Tip Jar, Municipal', 'Coppers, Loose',
    ],
    [
      'Strongbox, Unclaimed', 'Bearer Note, Countersigned', 'Payroll Tin, Sealed',
      'Bullion, Half a Bar', 'Treasury Chit, Expired', 'Vault Key and Contents',
    ],
  ],
  gear: [
    [
      'Sword, Adequate (+2)', 'Shield, Dented', 'Boots, Serviceable',
      'Helm, Second-Hand', 'Gloves, Mismatched', 'Lantern, Regulation',
    ],
    [
      'Plate, Requisitioned (+5)', 'Blade, Service-Issue (Sealed)', 'Greaves, Warden-Pattern',
      'Shield, Load-Bearing', 'Cloak, Departmental', 'Sidearm, Discontinued',
    ],
  ],
  relics: [
    [
      'Amulet, Provenance Unknown', 'Relic, Unidentified', 'Idol, Disputed',
      'Reliquary, Empty', 'Charm, Lightly Cursed', 'Icon, Defaced',
    ],
    [
      'Seal of a Vanished Office', 'Crown, Contested Estate', 'Reliquary, Occupied',
      'Sigil, Still Warm', 'Idol, Actively Objecting', 'Artefact, Class A (Do Not Open)',
    ],
  ],
  knowledge: [
    [
      'Ledger, Water-Damaged', 'Map, Contradictory', 'Memo, Ominous',
      'Minutes, Redacted', 'Receipt, Impossible', 'Notice, Undated',
    ],
    [
      'Charter, Original', 'Census of the Lower Floors', 'Correspondence, Sealed and Unsent',
      'Schematic, Wrong Building', 'Confession, Notarised', 'Index to an Index',
    ],
  ],
};

/** Deep loot starts at Floor 7 — the same line the third depth band starts on. */
export function lootFor(priority: string, depth: number, rng: Rng): string {
  const bands = LOOT[priority] ?? LOOT.gear;
  return rngPick(rng, bands[depth >= 7 ? 1 : 0]);
}

/** Every loot name in the game. Bounded, and a test asserts it stays that way. */
export const ALL_LOOT_NAMES: readonly string[] = Object.values(LOOT).flat(2);

/**
 * Form references. The Authority has a form for it, and the number is the part
 * nobody remembers — so it varies, which is both true to life and free variety
 * inside otherwise fixed sentences.
 */
const FORM_TITLES: readonly string[] = [
  'Undocumented Fauna Encounter',
  'Unscheduled Interaction',
  'Property Recovered in the Course of Duty',
  'Notice of Adverse Working Conditions',
  'Incident Below Grade',
  'Contact Report, Non-Routine',
  'Statement of Materials Handled',
  'Declaration of Continued Employment',
];

function formRef(rng: Rng): string {
  return `Form ${rngInt(rng, 2, 96)}-${rngPick(rng, ['A', 'B', 'C', 'D', 'E', 'G', 'K'])}`;
}

function caseRef(rng: Rng): string {
  return `#${rngInt(rng, 1000, 9899)}-${rngPick(rng, ['A', 'B', 'C', 'D', 'F', 'R'])}`;
}

/** After a fight the recruit walked away from. */
export function combatNote(rng: Rng): string {
  const notes: readonly (() => string)[] = [
    () => 'Grievance filed pre-combat. Combat resolved. Grievance withdrawn posthumously.',
    () => `Filed ${formRef(rng)} (${rngPick(rng, FORM_TITLES)}) after combat, as required.`,
    () => "Grievance filed on the creature's behalf, post-combat, as courtesy.",
    () => 'Combat resolved. Paperwork resolved. Both in triplicate.',
    () => 'Encounter logged against your quarterly bravery metric.',
    () => 'Combat concluded. Neither party conceded the point.',
    () => `Referred to Arbitration, case ${caseRef(rng)}. The creature did not attend.`,
    () => 'Resolved without recourse to the complaints procedure, on this occasion.',
    () => 'The recruit reports the matter is closed. The matter disagrees.',
    () => `Witness statement taken. Witness was the recruit. ${formRef(rng)} filed regardless.`,
    () => 'Combat resolved. Expenses claimed. Expenses queried.',
    () => 'Logged as routine. Nothing about it was routine.',
    () => 'A verbal warning was issued. It was not understood.',
    () => `Damage to Authority property assessed under ${formRef(rng)}. The recruit is Authority property.`,
    () => 'Encounter concluded amicably, in the sense that it concluded.',
    () => 'Both parties were reminded of the Union agreement. One party complied.',
    () => 'Combat resolved. The recruit has been thanked in writing.',
    () => `Outcome recorded in the annual return, line ${rngInt(rng, 11, 89)}.`,
  ];
  return rngPick(rng, notes)();
}

/** After something goes into the filing cabinet. */
export function lootNote(rng: Rng): string {
  const notes: readonly (() => string)[] = [
    () => 'Provenance disputed. Arbitration pending.',
    () => 'Deposited to Gold. Union Standing +1 for prompt filing.',
    () => `Flagged for Arbitration, case ${caseRef(rng)}.`,
    () => 'Receipt attached, in triplicate.',
    () => 'Catalogued. The catalogue is not searchable.',
    () => `Appraised on sight by someone unqualified to appraise it. ${formRef(rng)} filed.`,
    () => 'Title unclear. Retained pending clarification that will not arrive.',
    () => 'Entered into the cabinet. The cabinet objected.',
    () => 'Ownership asserted by the Authority, retrospectively.',
    () => `Logged against ${rngPick(rng, FORM_TITLES)}. Nobody reads those.`,
    () => 'Condition noted as fair. Fair to whom is not specified.',
    () => 'Removed from the floor. The floor has been notified.',
  ];
  return rngPick(rng, notes)();
}

/** A tick where nothing happened, which is most of them. */
export function quietNote(rng: Rng): string {
  const notes: readonly (() => string)[] = [
    () => 'Uneventful shift. Per diem claimed.',
    () => 'Nothing to report. Reported anyway.',
    () => 'Corridor surveyed. Corridor unchanged.',
    () => 'Break taken, as entitled. Duration disputed.',
    () => 'Routine patrol. The routine is the point.',
    // Claimed must land under worked, or the joke inverts into expenses fraud.
    () => {
      const worked = rngInt(rng, 9, 14);
      return `Timesheet submitted for ${rngInt(rng, 6, worked - 1)} hours. ${worked} were worked.`;
    },
    () => 'Lamp trimmed. Boots dried. Morale unmeasured.',
    () => 'A noise was investigated. It was the building.',
    () => 'Rations inspected. Rations found wanting.',
    () => 'Progress described as steady by someone not present.',
    () => 'Quiet stretch. The recruit used it to catch up on filing.',
    () => 'No contact. No recovery. No complaints, formally.',
  ];
  return rngPick(rng, notes)();
}

/** An encounter that yielded nothing, which stings more than it should. */
export function emptyHandedNote(priority: string, rng: Rng): string {
  const notes: readonly (() => string)[] = [
    () => `Loot priority: ${priority}. Nothing recovered. Complaint filed against the floor.`,
    () => `Loot priority: ${priority}. The creature was carrying debt.`,
    () => `Nothing of ${priority} recovered. The recruit checked twice.`,
    () => `Search conducted under ${formRef(rng)}. Yield: nil.`,
    () => `Loot priority: ${priority}. Pockets found, pockets empty.`,
    () => `Nothing recovered. The floor has been added to a list.`,
    () => `Recovery attempted. Recovery unsuccessful. Attempt logged.`,
    () => `Loot priority: ${priority}. Supply and demand were both absent.`,
  ];
  return rngPick(rng, notes)();
}

export const DEATH_CAUSES = [
  'enthusiasm',
  'descending without adequate permit',
  'patience, insufficiently applied',
  'a clerical error, downstream',
  'an unrecoverable difference of opinion',
  'initiative, unauthorised',
  'a gap between two procedures',
  'confidence at depth',
  'the floor, generally',
  'an appointment nobody scheduled',
] as const;

/** Reserved for starvation, which is never a combat outcome. */
export const STARVATION_CAUSE = 'unsupplied descent (Class C filing violation)';

/** Causes reachable through combat. Starvation has its own. */
export const COMBAT_DEATH_CAUSES: readonly string[] = DEATH_CAUSES;

export const RECESS_NOTE =
  'Extended recess observed per Union contract. Intervening days summarised for brevity.';

export const RESUPPLY_NOTE = 'Resupplied at Depot 3. Receipt attached, in triplicate.';

export const HOARD_NOTE =
  'Resupply declined per spend policy: Hoard. Objection noted in the margin.';

export const INSURE_NOTE = 'Premium remitted per spend policy: Insure. Coverage continues.';
