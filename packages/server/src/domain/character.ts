import {
  ESTATE_GOLD_BY_TIER,
  MAX_DEPTH,
  PERMIT_DEPTH_LIMIT,
  RECRUIT_GRADE_BY_TIER,
  STARTING_GOLD,
  STARTING_HP,
  STARTING_PERMIT_TIER,
  STARTING_SUPPLIES,
  inheritedLevel,
  inheritedPermitTier,
  maxHpForLevel,
  unlockTier,
  xpForLevel,
  type CaseFile,
  type Character,
  type Filing,
  intakeFloor,
  startingPermitTier,
  type CommendationId,
  type InventoryItem,
  type UnlockId,
} from '@deepholdings/shared';

const ROMAN: readonly [number, string][] = [
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

export function toRoman(value: number): string {
  let remaining = Math.max(1, Math.floor(value));
  let out = '';
  for (const [amount, numeral] of ROMAN) {
    while (remaining >= amount) {
      out += numeral;
      remaining -= amount;
    }
  }
  return out;
}

export function recruitName(recruitNum: number): string {
  return `GRIMWALD ${toRoman(recruitNum)}, THE UNREMARKABLE`;
}

export const STARTING_INVENTORY: InventoryItem[] = [
  { name: 'Torch, Municipal Issue', note: 'x3', quantity: 3, unitValue: 4, category: 'gear' },
  { name: 'Rations, Adequate', note: 'x5', quantity: 5, unitValue: 3, category: 'gear' },
  { name: 'Rope, 50ft', note: 'x1', quantity: 1, unitValue: 12, category: 'gear' },
];

/**
 * Everything needed to issue the next recruit.
 *
 * `previous` and `depthReached` are **required**, including when there is no
 * previous recruit — you have to say `null` on purpose. That is the entire
 * reason this interface exists. The old constructor took the case file as four
 * optional positional parameters, and the server simply never passed them, so
 * every successor arrived at Grade I with Permit D-1 while the balance harness
 * (which did pass them) measured a game where death was survivable. Nobody
 * noticed for months because both were individually correct.
 */
export interface Succession {
  id: string;
  accountId: string;
  /** The recruit leaving service. Null only for an account's first. */
  previous: Character | null;
  /** The floor they left on. Ignored when there is no previous recruit. */
  depthReached: number;
  /** Permanent unlocks are the only other thing that crosses a death. */
  unlocks: readonly UnlockId[];
  atTick: number;
  /**
   * Commendations, which cross a *transfer* and therefore cross everything.
   *
   * Optional, and that is a deliberate risk taken with eyes open: making it
   * required would have every harness and test pass `[]` explicitly, which is
   * noise around a default that is correct for all of them. The exposure is
   * that a real call site forgets it and quietly issues recruits without the
   * intake floor — so `service.ts` is the only place that may pass a non-empty
   * value, and it does so from the transfer row it has already loaded.
   */
  commendations?: readonly CommendationId[];
  /**
   * True when this recruit is the first of a new posting rather than a
   * successor. A transfer hands the caseload back: the permit ladder restarts
   * at whatever Transferred Dispensation bought, and nothing is inherited.
   */
  posting?: boolean;
}

/**
 * Issue the next recruit. The only way one is ever constructed.
 *
 * Returns the whole starting record rather than just the character, so a caller
 * cannot forget the fresh kit or leave a stale permit application attached.
 */
export function succeed(input: Succession): {
  character: Character;
  inventory: InventoryItem[];
  permitAppliedTick: null;
  caseFiles: CaseFile[];
  filings: Filing[];
} {
  const { previous } = input;
  return {
    character: newRecruit(
      input.id,
      input.accountId,
      input.posting || !previous ? 1 : previous.recruitNum + 1,
      input.unlocks,
      input.atTick,
      // Resolved here, not inside: a posting's tier is *granted* by Transferred
      // Dispensation, and running it through `inheritedPermitTier` would take
      // one straight back off the thing the officer just paid for.
      input.posting
        ? startingPermitTier(input.commendations ?? [])
        : inheritedPermitTier(previous?.permitTier ?? STARTING_PERMIT_TIER),
      input.posting ? 1 : previous?.level ?? 1,
      input.posting ? 0 : previous ? input.depthReached : 0,
      input.commendations ?? [],
    ),
    inventory: STARTING_INVENTORY.map((item) => ({ ...item })),
    permitAppliedTick: null,
    /**
     * A successor inherits the case *file* — grade, permit, standing — and
     * none of the case files. That asymmetry is the point: death was a wipe,
     * then it became almost free, and gear is what gives it a second stake
     * that is not the grade ladder. What the last recruit was carrying went
     * down with them.
     */
    caseFiles: [],
    /**
     * And none of the paperwork about them. A form in processing names a case
     * file by number; with the file gone there is nothing for it to resolve
     * against, and a filing that outlived its subject would be a fee already
     * paid against an outcome that can never arrive.
     */
    filings: [],
  };
}

/** Not exported: `succeed` is the door, so the case file cannot be dropped. */
function newRecruit(
  id: string,
  accountId: string,
  recruitNum: number,
  unlocks: readonly UnlockId[],
  atTick: number,
  permitTier: number,
  previousLevel: number,
  previousDepth: number,
  commendations: readonly CommendationId[],
): Character {
  const intake = RECRUIT_GRADE_BY_TIER[unlockTier(unlocks, 'recruit')];
  const settlement = ESTATE_GOLD_BY_TIER[unlockTier(unlocks, 'estate')];
  // The Commendation floor is a floor under *everything*, including a fresh
  // posting where there is no predecessor to inherit from. That is the whole
  // point of it: it is what makes the reset survivable.
  const level = Math.max(
    inheritedLevel(previousLevel, previousDepth),
    intake,
    intakeFloor(commendations),
  );

  return {
    id,
    accountId,
    name: recruitName(recruitNum),
    recruitNum,
    level,
    xp: 0,
    hp: maxHpForLevel(level),
    maxHp: maxHpForLevel(level),
    depth: 0,
    permitTier,
    gold: STARTING_GOLD + settlement,
    supplies: STARTING_SUPPLIES,
    // Reputation is not inherited. The office is; the standing is earned.
    standing: 0,
    alive: true,
    lastResolvedTick: atTick,
    bornTick: atTick,
  };
}

export function permitLimit(permitTier: number): number {
  return PERMIT_DEPTH_LIMIT[permitTier] ?? MAX_DEPTH;
}

/** Applies any pending level-ups; returns the number gained. */
export function applyLevelUps(character: Character): number {
  let gained = 0;
  while (character.xp >= xpForLevel(character.level)) {
    character.xp -= xpForLevel(character.level);
    character.level += 1;
    character.maxHp = maxHpForLevel(character.level);
    character.hp = character.maxHp;
    gained += 1;
  }
  return gained;
}

export { STARTING_HP };
