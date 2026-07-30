/**
 * Journal copy. Deadpan clerical voice: the terrible thing happened, and the
 * form was filed correctly. Kept apart from the resolution rules so writers can
 * work here without touching the simulation.
 */

export const FAUNA = [
  'Kobold, Disgruntled (Grade II)',
  'Rat King, Undocumented',
  'Ochre Jelly',
  'Skeleton, Overworked (Grade III)',
  'Bat, Municipal',
  'Slime, Unlicensed',
  'Goblin, Off-Duty',
] as const;

export const COMBAT_NOTES = [
  'Grievance filed pre-combat. Combat resolved. Grievance withdrawn posthumously.',
  'Filed Form 12-B (Undocumented Fauna Encounter) after combat, as required.',
  "Grievance filed on the creature's behalf, post-combat, as courtesy.",
  'Combat resolved. Paperwork resolved. Both in triplicate.',
  'Encounter logged against your quarterly bravery metric.',
] as const;

export const LOOT_BY_PRIORITY = {
  gold: ['Coin Purse, Modest', 'Coin Purse, Immodest', 'Petty Cash, Unattended'],
  gear: ['Sword, Adequate (+2)', 'Shield, Dented', 'Boots, Serviceable'],
  relics: ['Amulet, Provenance Unknown', 'Relic, Unidentified', 'Idol, Disputed'],
  knowledge: ['Ledger, Water-Damaged', 'Map, Contradictory', 'Memo, Ominous'],
} as const;

export const LOOT_NOTES = [
  'Provenance disputed. Arbitration pending.',
  'Deposited to Gold. Union Standing +1 for prompt filing.',
  'Flagged for Arbitration, Case #4417-C.',
  'Receipt attached, in triplicate.',
] as const;

export const DEATH_CAUSES = [
  'enthusiasm',
  'descending without adequate permit',
  'patience, insufficiently applied',
  'a clerical error, downstream',
  'unsupplied descent (Class C filing violation)',
] as const;

/** Causes reachable through combat; the last entry is reserved for starvation. */
export const COMBAT_DEATH_CAUSES: readonly string[] = DEATH_CAUSES.slice(0, 4);

export const RECESS_NOTE =
  'Extended recess observed per Union contract. Intervening days summarised for brevity.';

export const RESUPPLY_NOTE = 'Resupplied at Depot 3. Receipt attached, in triplicate.';

export const HOARD_NOTE =
  'Resupply declined per spend policy: Hoard. Objection noted in the margin.';

export const INSURE_NOTE = 'Premium remitted per spend policy: Insure. Coverage continues.';
