import {
  MAX_DEPTH,
  PERMIT_DEPTH_LIMIT,
  STARTING_GOLD,
  STARTING_HP,
  STARTING_PERMIT_TIER,
  STARTING_SUPPLIES,
  maxHpForLevel,
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
  { name: 'Torch, Municipal Issue', note: 'x3' },
  { name: 'Rations, Adequate', note: 'x5' },
  { name: 'Rope, 50ft', note: 'x1' },
];

/** Permanent unlocks are the only thing that crosses a death. */
export function newRecruit(
  id: string,
  accountId: string,
  recruitNum: number,
  unlocks: readonly UnlockId[],
  atTick: number,
): Character {
  const betterRecruit = unlocks.includes('recruit');
  const inheritsGear = unlocks.includes('inherit');
  const level = betterRecruit ? 2 : 1;

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
    permitTier: STARTING_PERMIT_TIER,
    gold: STARTING_GOLD + (inheritsGear ? 120 : 0),
    supplies: STARTING_SUPPLIES,
    alive: true,
    lastResolvedTick: atTick,
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
