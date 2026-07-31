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
  type Character,
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

/** Permanent unlocks are the only thing that crosses a death. */
export function newRecruit(
  id: string,
  accountId: string,
  recruitNum: number,
  unlocks: readonly UnlockId[],
  atTick: number,
  /** The tier the previous recruit held, if there was one. */
  previousPermitTier = STARTING_PERMIT_TIER,
  /** The grade the previous recruit reached, if there was one. */
  previousLevel = 1,
  /** The floor they reached. A deep loss returns a better successor. */
  previousDepth = 0,
): Character {
  const intake = RECRUIT_GRADE_BY_TIER[unlockTier(unlocks, 'recruit')];
  const settlement = ESTATE_GOLD_BY_TIER[unlockTier(unlocks, 'estate')];
  const level = Math.max(inheritedLevel(previousLevel, previousDepth), intake);

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
    permitTier: inheritedPermitTier(previousPermitTier),
    gold: STARTING_GOLD + settlement,
    supplies: STARTING_SUPPLIES,
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
