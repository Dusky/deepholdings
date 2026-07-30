/**
 * Static demo content. Everything here stands in for server-authoritative
 * state — the resolved character, world journal, market and pension records
 * all arrive from the API in production.
 */
import type {
  Guild,
  InventoryItem,
  LogEntry,
  MarketLot,
  TavernMessage,
  Unlock,
} from '../types';

export const BOOT_LINES: readonly string[] = [
  'SUBTERRANEAN RESOURCE AUTHORITY — TERMINAL BIOS v2.3',
  'MEMORY CHECK ......... 640K OK',
  'DRIVE 0 ............... READY',
  'DRIVE 1 ............... READY',
  'LOADING CASE MANAGEMENT SYSTEM...',
  '',
  'This terminal is the property of the Subterranean Resource Authority.',
  'Unauthorized descent is a Class B filing violation.',
  '',
  'LOGIN: CASE OFFICER 04417',
  'PASSWORD: ****************',
  'ACCESS GRANTED. WELCOME BACK.',
];

/** A full shift of incident log copy — also the tone reference for
 *  server-generated lines. */
export const LOG_LINES: readonly LogEntry[] = [
  { time: '07:42', text: 'Descent authorized. Permit D-5 verified. Do not lose the permit.' },
  {
    time: '07:51',
    text: 'Encountered: Kobold, Disgruntled (Grade II). Grievance filed pre-combat. Combat resolved. Grievance withdrawn posthumously.',
  },
  { time: '08:03', text: 'Acquired: Sword, Adequate (+2). Provenance disputed. Arbitration pending.' },
  {
    time: '08:19',
    text: 'Retreat threshold reached (28% HP). Ascending. Logged against your quarterly bravery metric.',
  },
  { time: '09:04', text: 'Resupplied at Depot 3. Spend policy: Resupply. Receipt attached, in triplicate.' },
  { time: '09:47', text: 'Re-descended per standing order. Permit D-5 re-verified, no additional fee.' },
  {
    time: '10:12',
    text: 'Encountered: Rat King, Undocumented. Filed Form 12-B (Undocumented Fauna Encounter) after combat, as required.',
  },
  { time: '10:33', text: 'Acquired: Coin Purse, Modest. Deposited to Gold. Union Standing +1 for prompt filing.' },
  { time: '11:15', text: 'Region Danger Level revised upward by World Journal. Delving continues per standing order.' },
  {
    time: '11:52',
    text: 'Encountered: Ochre Jelly. Loot priority: Relics. No relics recovered. Filed complaint against the jelly.',
  },
  { time: '12:30', text: 'Lunch recess observed per Union contract. Descent paused.' },
  { time: '13:00', text: 'Descent resumed.' },
  { time: '13:22', text: 'Acquired: Amulet, Provenance Unknown. Flagged for Arbitration, Case #4417-C.' },
  { time: '14:08', text: 'Market listing filled: sold Sword, Adequate (+2) for 340 gold.' },
  {
    time: '14:41',
    text: "Encountered: Skeleton, Overworked (Grade III). Grievance filed on skeleton's behalf, post-combat, as courtesy.",
  },
  { time: '15:19', text: 'Depth 7 reached. Permit D-5 does not cover Depth 7. Descent halted pending Permit D-6.' },
  { time: '15:20', text: 'Permit D-6 application filed. Estimated processing: 2-4 business days.' },
  { time: '15:33', text: 'Retreat ordered pending permit. Ascending.' },
  { time: '16:02', text: 'Character resting at Depot 3. Standing orders unchanged.' },
  { time: '16:47', text: 'Tavern channel: 3 new messages.' },
  { time: '17:15', text: 'World Event: Region "The Undersill" reports elevated Danger. Contribution tracking open.' },
  { time: '18:00', text: 'End of shift. 1 permit pending. 0 grievances outstanding. Union Standing: 14.' },
];

export const TAVERN_MESSAGES: readonly TavernMessage[] = [
  { id: 1, author: 'CASE OFFICER 2201', body: "anyone else's recruit filing grievances against furniture" },
  { id: 2, author: 'CASE OFFICER 0873', body: 'mine filed one against a doorway. arbitration pending.' },
  { id: 3, author: 'CASE OFFICER 4417', body: 'my Permit D-6 has been "processing" for 6 days' },
  { id: 4, author: 'CASE OFFICER 2201', body: 'put a complaint in about the complaint department' },
  { id: 5, author: 'CASE OFFICER 9012', body: "market's paying 340 for Adequate swords today, sell now" },
  { id: 6, author: 'CASE OFFICER 0873', body: 'RIP Grimwald. good officer. bad permits.' },
];

export const DEATH_FEED: readonly string[] = [
  'GRIMWALD THE ADEQUATE died on Floor 7. Cause of death: enthusiasm. Next of kin notified by form letter.',
  'BARNABY THE UNLICENSED died on Floor 3. Cause of death: descending without Permit D-4. Case closed.',
  'OSSIFRAGE THE PATIENT died on Floor 12. Cause of death: patience, insufficiently applied. Pension disbursed.',
];

export const INVENTORY: readonly InventoryItem[] = [
  { name: 'Torch, Municipal Issue', note: 'x3' },
  { name: 'Rations, Adequate', note: 'x5' },
  { name: 'Amulet, Provenance Unknown', note: 'disputed' },
  { name: 'Rope, 50ft', note: 'x1' },
];

export const MARKET: readonly MarketLot[] = [
  { name: 'Sword, Adequate (+2)', price: 340 },
  { name: 'Shield, Dented', price: 60 },
  { name: 'Relic, Unidentified', price: 1200 },
  { name: 'Torch, Municipal Issue', price: 4 },
];

export const GUILD: Guild = {
  name: 'OFFICE OF THE UNDERSILL',
  objective: 'Contribute 500 Supplies to the regional stockpile. 312 / 500.',
};

export const WORLD_EVENT =
  'Region "The Undersill" danger elevated. Contribution window open through Sunday.';

export const ACTIVITIES: readonly string[] = [
  'Descending to Floor 7...',
  'Verifying Permit D-5...',
  'Engaging: Kobold, Disgruntled...',
  'Filing post-combat grievance...',
  'Resupplying at Depot 3...',
  'Awaiting Permit D-6 processing...',
];

export const UNLOCKS: readonly Unlock[] = [
  { id: 'permits', label: 'Faster Permit Processing (Tier I)', cost: 1200, owned: true },
  { id: 'recruit', label: 'Better Starting Recruit (Tier I)', cost: 1800, owned: false },
  { id: 'inherit', label: 'Inherited Gear Slot', cost: 2200, owned: false },
  { id: 'green', label: 'Monitor Swap: Green Phosphor', cost: 900, owned: false },
  { id: 'stipend', label: 'Passive Gold Stipend (+2/tick)', cost: 1600, owned: false },
];

export const CASE_OFFICER = 'CASE OFFICER 4417';

export const TAVERN_PRESENT = 14;
