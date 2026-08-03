/**
 * What every invented word means, in plain English, in one place.
 *
 * ## Why this file exists
 *
 * Product goal #1 makes the clerical voice the product. Nothing balanced it, so
 * for months every new system arrived with an in-fiction name and no anchor, and
 * the main screen ended up carrying sixteen terms of art with glosses for four.
 * The line that finally made the case, shipped and live:
 *
 *   "Form R-1 available — GRIMWALD I has served 32 hours. Separation assessed
 *    at 3056."
 *
 * Three invented terms and a bare number. It is pension. The word "pension" is
 * not in the sentence.
 *
 * Goal #2 now says plain meaning is never optional. This is where that is kept
 * honest, because a rule nothing enforces is a preference.
 *
 * ## The shape, and why `plain` is separate from `detail`
 *
 * `plain` is one line that has to work *beside the control*, read by somebody
 * who has never seen the game and is not going to open a help screen. It may
 * not lean on the fiction, may not assume another entry has been read, and may
 * not be funny at the cost of being clear.
 *
 * `detail` is the paragraph in the help panel, and it is where the voice comes
 * back. Somebody reading it has already chosen to learn more, so it can afford
 * a joke. That split is the whole design: the tone stops being a tax on
 * comprehension and goes back to being a reward for engagement.
 *
 * ## One source, two consumers
 *
 * The inline hints and the help panel both read from here, so they cannot
 * drift — which is the failure that produced comments describing a six-file
 * drawer beside a `CASE_FILE_SLOTS = 3`. `glossary.test.ts` scans what the
 * client actually ships for terms of art and fails when one has no entry, so
 * the next system named in-fiction cannot reach a player unexplained.
 *
 * ## Numbers in here are quoted from the tuning, not retyped
 *
 * Where a gloss states a figure it imports it. A gloss that says "+15%" beside
 * a constant that has since become 1.2 is worse than no gloss, because it is
 * believed.
 */
import { HOARD_SALE_BONUS, LOOT_EFFECT } from './tuning.js';
import { PENSION_PER_COMMENDATION } from './transfer.js';

/** Where a player first meets a term. Groups the help panel. */
export type GlossaryScreen =
  | 'basics'
  | 'orders'
  | 'ledger'
  | 'office'
  | 'pension'
  | 'armoury'
  | 'bulletin';

export interface GlossaryEntry {
  /** Exactly as it appears on screen, so the scan can match it. */
  term: string;
  /**
   * One line, shown beside the control. Must stand alone for a stranger.
   * No fiction, no forward references, no joke that costs clarity.
   */
  plain: string;
  /** The help-panel paragraph. Optional, and where the voice is allowed back. */
  detail?: string;
  screen: GlossaryScreen;
}

const pct = (multiplier: number) => `${Math.round((multiplier - 1) * 100)}%`;

export const GLOSSARY = {
  // ---- The basics a first-session player meets ---------------------------

  floor: {
    term: 'Floor',
    plain: 'How deep underground your recruit is. Floor 1 is just below the surface.',
    detail:
      'Deeper floors are worth more and are more likely to kill. This is the ' +
      'single axis the whole game is arranged along, so it has exactly one ' +
      'name — it used to have three.',
    screen: 'basics',
  },
  permit: {
    term: 'Permit',
    plain: 'Paperwork that sets how deep you are allowed to send your recruit.',
    detail:
      'Permits go D-1, D-2, D-3 and upward, each authorising a few more ' +
      'floors. Applying is free and takes real time; the next one is always ' +
      'being processed, so there is always something arriving.',
    screen: 'basics',
  },
  recruit: {
    term: 'Recruit',
    plain: 'The person who actually goes down. You never control them directly.',
    detail:
      'You are a case officer. You file orders; the recruit follows them ' +
      'while you are gone, and dies eventually. That is not a failure state — ' +
      'see Pension.',
    screen: 'basics',
  },
  level: {
    term: 'Level',
    plain: "Your recruit's experience. Higher means more health and better survival.",
    detail:
      'Reset when a recruit dies, unless a pension unlock says otherwise. Not ' +
      'to be confused with the Grade printed on a case file, which describes ' +
      'an object rather than a person.',
    screen: 'basics',
  },
  hp: {
    term: 'HP',
    plain: 'Health. At zero the recruit dies and a successor is assigned.',
    screen: 'basics',
  },
  supplies: {
    term: 'Supplies',
    plain: 'Food and kit. One is used every 12 minutes underground; at zero the recruit starts starving.',
    detail:
      'Starvation is a real cause of death here, not a warning noise: with no ' +
      'supplies there is a 30% chance each minute of losing 4% of maximum ' +
      'health, and the death notice names it. Your Spend Policy decides ' +
      'whether they get restocked automatically — Resupply buys 12 at a time ' +
      'at 6 gold each, Hoard deliberately does not.',
    screen: 'basics',
  },
  clearance: {
    term: 'Clearance',
    plain: 'Which screens are open to you. More arrive as you advance.',
    detail:
      'Everything at once on day one is the genre\'s most common fatal ' +
      'mistake, so screens are released as they become relevant. Clearance ' +
      'never goes backwards, including through a death.',
    screen: 'basics',
  },

  // ---- Currencies --------------------------------------------------------

  gold: {
    term: 'Gold',
    plain: 'Spending money. Earned by selling what your recruit hauls up.',
    detail:
      'Gold buys office equipment, staff wages, and paperwork fees. It does ' +
      'not survive a death by itself — pension unlocks are what carry value ' +
      'across careers.',
    screen: 'ledger',
  },
  pension: {
    term: 'Pension',
    plain: 'Permanent progress. Paid out when a recruit dies, and never lost.',
    detail:
      'This is the long game. A recruit dying is how pension is banked, which ' +
      'is why the game says up front that they are not permanent and you are. ' +
      'Pension buys unlocks that apply to every future recruit.',
    screen: 'pension',
  },
  commendation: {
    term: 'Commendation',
    plain: 'The rarest currency. Earned by transferring to a new posting, and never spent away.',
    detail:
      `One commendation per ${PENSION_PER_COMMENDATION.toLocaleString('en-GB')} ` +
      'pension banked in a posting, at a flat rate — so there is no clever ' +
      'moment to transfer and no way to find out afterwards that you got it ' +
      'wrong. Nothing bought with commendations is ever surrendered.',
    screen: 'pension',
  },
  standing: {
    term: 'Union Standing',
    plain: 'Goodwill with the clerks. Spent filing forms in the Armoury.',
    detail:
      'Earned when a recruit passes a grade review. It is not inherited: a ' +
      'successor starts at nothing however senior you are, which is what stops ' +
      'form-filing from becoming free late on.',
    screen: 'armoury',
  },

  // ---- Standing orders — the core verb -----------------------------------

  standingOrders: {
    term: 'Standing Orders',
    plain: 'The instructions your recruit follows while you are away. This is the main thing you do.',
    detail:
      'Filed as Form SO-1. Four settings, changeable at any time, costing ' +
      'nothing to amend. Everything else in the game feeds back into these.',
    screen: 'orders',
  },
  targetDepth: {
    term: 'Target Depth',
    plain: 'How deep to push. Deeper pays better and kills faster.',
    detail:
      'An aspiration rather than an instruction — the recruit works down to ' +
      'it, and your permit caps how far they may legally go regardless.',
    screen: 'orders',
  },
  retreatThreshold: {
    term: 'Retreat Threshold',
    plain: 'Turn back and heal at this much health. Lower means more time earning and more funerals.',
    detail:
      'The safety valve. Set it high and the recruit spends their life ' +
      'walking back up to rest; set it low and they die deeper, richer, and ' +
      'sooner.',
    screen: 'orders',
  },
  lootPriority: {
    term: 'Loot Priority',
    plain: 'What your recruit bothers to pick up.',
    screen: 'orders',
  },
  lootGold: {
    term: 'Gold priority',
    plain: `Safe and steady: ${pct(LOOT_EFFECT.gold.value)} more value, found every time.`,
    screen: 'orders',
  },
  lootGear: {
    term: 'Gear priority',
    plain: `A little of everything: ${pct(LOOT_EFFECT.gear.value)} more value and ${pct(LOOT_EFFECT.gear.xp)} more experience.`,
    screen: 'orders',
  },
  lootRelics: {
    term: 'Relics priority',
    plain: `A gamble: worth ${LOOT_EFFECT.relics.value}× as much, but found only ${Math.round(LOOT_EFFECT.relics.findChance * 100)}% as often.`,
    screen: 'orders',
  },
  lootKnowledge: {
    term: 'Knowledge priority',
    plain: `Levels instead of money: ${LOOT_EFFECT.knowledge.value}× the value, ${LOOT_EFFECT.knowledge.xp}× the experience.`,
    screen: 'orders',
  },
  spendPolicy: {
    term: 'Spend Policy',
    plain: 'What your recruit does with money at the surface, without asking you.',
    screen: 'orders',
  },
  spendResupply: {
    term: 'Resupply',
    plain: 'Restock supplies automatically, 12 at a time at 6 gold each. The safe default.',
    detail:
      'If gold is short at the depot the quartermaster sells off the cheapest ' +
      'thing in your cabinet to cover it, so a recruit never starves standing ' +
      'beside a full inventory.',
    screen: 'orders',
  },
  spendHoard: {
    term: 'Hoard',
    plain: `Never restock, and hold out for a better buyer: ${pct(HOARD_SALE_BONUS)} more on every sale.`,
    detail:
      'A real trade rather than thrift. Sales pay more, and the recruit will ' +
      'walk past the depot with no supplies and starve if you are not ' +
      'watching.',
    screen: 'orders',
  },
  spendInsure: {
    term: 'Insure',
    plain: 'Pay 1 gold a minute; the pension paid when this recruit dies is 25% larger.',
    detail:
      'A continuous premium against an event that is certain to happen ' +
      'eventually, which is the only kind of insurance the Authority ' +
      'considers honest.',
    screen: 'orders',
  },
  site: {
    term: 'Site',
    plain: 'Which dig your recruit works. Each pays and kills differently.',
    screen: 'orders',
  },

  // ---- Selling -----------------------------------------------------------

  market: {
    term: 'Market',
    plain: 'What buyers are paying right now, per category. Redrawn regularly.',
    detail:
      'Demand swings between 0.8× and 1.2× of book value. Timing a sale is ' +
      'worth doing and is never required — ignore it entirely and you average ' +
      'exactly book value.',
    screen: 'ledger',
  },
  bookValue: {
    term: 'Book value',
    plain: "An item's baseline price, before market demand is applied.",
    screen: 'ledger',
  },
  cabinet: {
    term: 'Filing cabinet',
    plain: 'Where hauled loot waits to be sold. It holds a limited number of stacks.',
    detail:
      'When it is full, further finds are sold automatically at depot rates ' +
      'rather than dropped. Nothing a recruit earned ever evaporates.',
    screen: 'ledger',
  },

  // ---- Spending gold -----------------------------------------------------

  requisition: {
    term: 'Requisition',
    plain: 'Office equipment bought with gold. Permanent, and survives your recruit dying.',
    screen: 'office',
  },
  registry: {
    term: 'Registry',
    plain: 'Staff you hire. They do jobs for you and take a wage every minute, forever.',
    detail:
      'The only recurring cost in the game. If the purse cannot meet payroll ' +
      'the staff stop working until it can — they are not dismissed and ' +
      'nothing is lost.',
    screen: 'office',
  },
  payroll: {
    term: 'Payroll',
    plain: 'Total wages your staff cost you per minute.',
    screen: 'office',
  },
  unlock: {
    term: 'Unlock',
    plain: 'A permanent upgrade bought with pension. Applies to every future recruit.',
    screen: 'pension',
  },
  tier: {
    term: 'Tier',
    plain: 'How far up a particular ladder you have bought. Each tier costs more than the last.',
    screen: 'office',
  },

  // ---- Case files --------------------------------------------------------

  caseFile: {
    term: 'Case file',
    plain: 'A kept item. Most loot is sold; a rare find gets a case number and is filed instead.',
    detail:
      'Case files carry clauses that change how your recruit performs. The ' +
      'drawer holds a limited number, and a better find replaces the weakest ' +
      'one in it.',
    screen: 'armoury',
  },
  clause: {
    term: 'Clause',
    plain: 'A line on a case file that changes a number. Some help, some hurt.',
    screen: 'armoury',
  },
  endorsement: {
    term: 'Endorsement',
    plain: 'A clause in your favour.',
    screen: 'armoury',
  },
  rider: {
    term: 'Rider',
    plain: 'A clause against you. Case files come with both.',
    screen: 'armoury',
  },
  grade: {
    term: 'Grade',
    plain: 'How good a case file is, I to V. Higher grades carry more clauses.',
    detail:
      'This describes an object. The number beside your recruit is their ' +
      'Level, which is a different thing that used to share this word.',
    screen: 'armoury',
  },
  vigour: {
    term: 'Vigour',
    plain: 'Extra maximum health, added by clauses.',
    screen: 'armoury',
  },
  survival: {
    term: 'Survival',
    plain: 'Damage reduction. Every point makes hits land softer.',
    screen: 'armoury',
  },
  lootValue: {
    term: 'Loot value',
    plain: 'How much more everything your recruit finds is worth.',
    screen: 'armoury',
  },

  // ---- The shared world --------------------------------------------------

  guild: {
    term: 'Guild',
    plain: 'Every officer in your region, working a shared objective. You are in it automatically.',
    detail:
      'The bar moves when players play — including you, without opting in. ' +
      'When it completes, everyone who contributed is paid a share.',
    screen: 'bulletin',
  },
  specialAssignment: {
    term: 'Special Assignment',
    plain: 'An optional harder run under a restriction, paying commendations. Nothing is lost by failing.',
    detail:
      'Free to accept and free to hand back. Each is the game you already ' +
      'know with something taken away — no department, no unlocks, a level ' +
      'cap — which is a new problem rather than a longer one.',
    screen: 'bulletin',
  },
  worldEvent: {
    term: 'World event',
    plain: 'A condition affecting the whole region this week.',
    screen: 'bulletin',
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryId = keyof typeof GLOSSARY;

/**
 * Every form code the client may show, with what it does in plain words.
 *
 * Separate from `GLOSSARY` because forms are matched by a pattern rather than
 * by name — `glossary.test.ts` finds `Form <code>` anywhere in the client and
 * checks it against these keys, so a new form cannot ship unexplained.
 */
export const FORMS: Record<string, { plain: string; verb: string }> = {
  'SO-1': {
    verb: 'Set standing orders',
    plain: 'Your recruit\'s instructions: how deep, when to retreat, what to collect, what to buy.',
  },
  '4-E': {
    verb: 'Expedite a permit',
    plain: 'Pays gold to halve the remaining wait on the permit being processed. Once per application.',
  },
  'R-1': {
    verb: 'Retire this recruit',
    plain: 'Ends this recruit\'s career now and banks their pension. A successor is assigned immediately.',
  },
  'T-1': {
    verb: 'Transfer to a new posting',
    plain: 'Surrenders your whole pension and everything bought with it, in exchange for commendations.',
  },
  '12-C': {
    verb: 'Contest a clause',
    plain: 'Gambles a fee to replace one clause on a case file. It may come back worse, or be dismissed.',
  },
  '19': {
    verb: 'Move a clause',
    plain: 'Carries one clause onto another case file and destroys the file it came from. Cannot fail.',
  },
  '9': {
    verb: 'Report an injury',
    plain: 'Filed automatically when a recruit is badly hurt. Nothing for you to do.',
  },
  'P-2': {
    verb: 'Claim a pension',
    plain: 'Filed when a recruit dies, to bank what they earned.',
  },
  '7-A': { verb: 'Appraise', plain: 'Not yet available.' },
  '3-B': { verb: 'Amend', plain: 'Not yet available.' },
  'N-1': { verb: 'Notarise', plain: 'Not yet available.' },
  '44': { verb: 'Settle provenance', plain: 'Not yet available.' },
};

/** The plain gloss for a term, or null. Used by the inline hint components. */
export function gloss(id: GlossaryId): string {
  return GLOSSARY[id].plain;
}

/**
 * A form's plain meaning, as `Verb — what it does`.
 *
 * The house style everywhere a form code appears: say what it does first, then
 * the code, never the code alone. `Form R-1 available` told a player nothing;
 * `Retire this recruit (Form R-1)` tells them everything they need.
 */
export function describeForm(code: string): string | null {
  const form = FORMS[code];
  return form ? `${form.verb} — ${form.plain}` : null;
}

/** Help-panel grouping, in the order a player meets them. */
export const GLOSSARY_SCREENS: readonly GlossaryScreen[] = [
  'basics',
  'orders',
  'ledger',
  'office',
  'pension',
  'armoury',
  'bulletin',
];

export function glossaryFor(screen: GlossaryScreen): GlossaryEntry[] {
  return Object.values(GLOSSARY).filter((entry) => entry.screen === screen);
}
