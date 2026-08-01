/**
 * Journal copy. Kept apart from the resolution rules so writers can work here
 * without touching the simulation.
 *
 * ## The register rule
 *
 * **Bureaucratic language is reserved for moments the Authority is actually
 * acting** — a permit clearing, a grade review, a pension assessed, a form
 * filed about something. Everything the recruit does underground is described
 * plainly: what happened, what it cost, what it smelled like.
 *
 * This is a correction. The first version of this file put the clerical voice
 * on *every* line, and the result was fifty notes built from one mould —
 * `<clipped clause>. <clipped clause that undercuts it>.` Individually fine.
 * Read in sequence, which is the only way anybody reads them, it was a
 * metronome: "Corridor surveyed. Corridor unchanged." / "Nothing to report.
 * Reported anyway." / "Logged as routine. Nothing about it was routine."
 * Sixteen of eighteen combat notes were that shape.
 *
 * The deeper problem was that irony needs something to be ironic *about*. When
 * the description is already arch, there is no plain fact for the paperwork to
 * be absurd against — it is arch language about arch language, and it reads as
 * a writer enjoying themselves. A recruit bleeding in a corridor, described
 * flatly, and then a form number: that is the joke. The form is funny because
 * the corridor is real.
 *
 * So: most lines here are now plain. Roughly one in five reaches for the
 * Authority's vocabulary, and those are the ones that land.
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
 * Qualifiers.
 *
 * These were all employment status — Tenured, Seconded, Collectively
 * Bargained, Retired Under Review — which made every encounter in the game a
 * joke about HR. This is the line a player reads more than any other, several
 * times an hour, forever, so it is the worst possible place to put the
 * heaviest vocabulary.
 *
 * Most are physical now. The office ones survive because a Kobold Foreman,
 * Undocumented is genuinely funny once; it stops being funny when the fourteen
 * encounters either side of it are the same gag with a different noun.
 */
const QUALIFIERS: readonly string[] = [
  // Physical, and what the recruit would actually notice first.
  'Enormous', 'Half-Starved', 'Blind', 'Patient', 'Cornered',
  'Wet', 'Wrong-Coloured', 'Too Many Legs', 'Silent', 'Screaming',
  'Old', 'Molten', 'Split Open', 'Waiting', 'Curious',
  'Territorial', 'Sleeping', 'Injured Already', 'Enormous and Slow',
  'Faintly Glowing', 'Missing Something', 'Wearing Someone',
  'Newly Hatched', 'Very Nearly Dead',
  // The Authority's vocabulary, at about one name in five.
  'Undocumented', 'Off-Duty', 'Requisitioned', 'Out of Warranty',
  'Unlicensed', 'Pensioned', 'Load-Bearing',
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

/**
 * After a fight the recruit walked away from.
 *
 * Mostly physical, mostly short, and varied in length on purpose — a pool
 * where every entry is the same number of beats reads as one line however
 * many entries it has.
 */
export function combatNote(rng: Rng): string {
  const notes: readonly (() => string)[] = [
    () => 'Won on the second attempt.',
    () => 'Shallow cut across the forearm.',
    () => 'It broke off and went back down the corridor.',
    () => 'Loud, then very quiet.',
    () => 'The recruit is favouring one leg.',
    () => 'It fought like something defending a room rather than itself.',
    () => 'Over quickly. The recruit sat down afterwards for a while.',
    () => 'Blood on the wall at shoulder height, none of it the recruit\'s.',
    () => 'A long one. The lamp went out partway through and came back.',
    () => 'It made a sound. The recruit has declined to describe the sound.',
    () => 'Dealt with. The corridor smells of it now.',
    () => 'Two teeth recovered from the shield.',
    () => 'The recruit apologised to it afterwards. No explanation offered.',
    () => 'It had been waiting a long time for someone to come down here.',
    () => 'Nothing broken. Everything sore.',
    () => 'Backed into a doorway and held it there.',
    () => 'Three minutes. Felt longer to everyone involved.',
    // The Authority's voice, at about one line in five — and only where a
    // clerk would genuinely have written something down.
    () => `Filed ${formRef(rng)} (${rngPick(rng, FORM_TITLES)}) afterwards, standing up, in the dark.`,
    () => `Referred to Arbitration, case ${caseRef(rng)}. It did not attend.`,
    () => 'Logged as routine. Nothing about it was routine.',
    () => `Recorded in the annual return, line ${rngInt(rng, 11, 89)}, where it will stay.`,
  ];
  return rngPick(rng, notes)();
}

/** After something goes into the filing cabinet. */
export function lootNote(rng: Rng): string {
  const notes: readonly (() => string)[] = [
    () => 'Heavier than it looks.',
    () => 'Went into the cabinet still warm.',
    () => 'Wrapped in cloth and put at the bottom of the pack.',
    () => 'The recruit checked it three times before stowing it.',
    () => 'It was under something. The something is still there.',
    () => 'Carried out under one arm.',
    () => 'Someone had already tried to take this. They are still here.',
    () => 'Took a while to work loose.',
    () => 'Smaller than expected, and worth more.',
    () => 'The recruit has stopped looking at it.',
    () => 'Appraised on sight by someone unqualified to appraise it.',
    () => 'Catalogued. The catalogue is not searchable.',
    () => `Flagged for Arbitration, case ${caseRef(rng)}.`,
    () => 'Title unclear. Retained pending clarification that will not arrive.',
  ];
  return rngPick(rng, notes)();
}

/** A tick where nothing happened, which is most of them. */
export function quietNote(rng: Rng): string {
  const notes: readonly (() => string)[] = [
    () => 'Water, somewhere below.',
    () => 'The corridor turns left for a long time.',
    () => 'Nothing. Four hours of nothing.',
    () => 'A door that was open is shut.',
    () => 'Lamp trimmed. Boots dried.',
    () => 'Dust undisturbed in both directions.',
    () => 'Heard something, waited, nothing came.',
    () => 'Counted the rations again. Same answer.',
    () => 'Slept badly.',
    () => 'The recruit walked. That is the whole report.',
    () => 'Cold down here. Colder than the floor above.',
    () => 'Marked the wall at the junction. The mark was already there.',
    () => 'Ate standing up.',
    () => 'Sat for ten minutes with the lamp off, then went on.',
    () => 'Uneventful. Per diem claimed.',
    // Claimed must land under worked, or the joke inverts into expenses fraud.
    () => {
      const worked = rngInt(rng, 9, 14);
      return `Timesheet submitted for ${rngInt(rng, 6, worked - 1)} hours. ${worked} were worked.`;
    },
  ];
  return rngPick(rng, notes)();
}

/** An encounter that yielded nothing, which stings more than it should. */
export function emptyHandedNote(priority: string, rng: Rng): string {
  const notes: readonly (() => string)[] = [
    () => 'Nothing on it. The recruit checked twice.',
    () => 'Nothing worth the weight.',
    () => 'Pockets. Empty ones.',
    () => 'It was carrying a key. The lock was not found.',
    () => `Nothing of ${priority} down here, or not today.`,
    () => 'The recruit swore, briefly, on the record.',
    () => `Search conducted under ${formRef(rng)}. Yield: nil.`,
    () => `Loot priority: ${priority}. The creature was carrying debt.`,
  ];
  return rngPick(rng, notes)();
}

/**
 * Read as "Cause of death: X", inside a form letter.
 *
 * Mixed on purpose. A plain cause lands harder against the form-letter framing
 * than a witty one does, and a list where every entry is a joke stops being a
 * list of deaths.
 */
export const DEATH_CAUSES = [
  'blood loss',
  'a fall',
  'exhaustion',
  'the dark',
  'crush injury',
  'cold',
  'something that was not there on the way down',
  'enthusiasm',
  'confidence at depth',
  'a gap between two procedures',
  'initiative, unauthorised',
  'an appointment nobody scheduled',
] as const;

/** Reserved for starvation, which is never a combat outcome. */
export const STARVATION_CAUSE = 'starvation (Class C filing violation)';

/** Causes reachable through combat. Starvation has its own. */
export const COMBAT_DEATH_CAUSES: readonly string[] = DEATH_CAUSES;

export const RECESS_NOTE =
  'Extended recess observed per Union contract. Intervening days summarised for brevity.';

export const RESUPPLY_NOTE = 'Resupplied at Depot 3.';

export const HOARD_NOTE = 'Depot passed without stopping. Spend policy: Hoard.';

export const INSURE_NOTE = 'Premium remitted. Spend policy: Insure.';
