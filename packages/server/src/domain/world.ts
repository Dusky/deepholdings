import {
  HEARTBEAT_SECONDS,
  makeRng,
  rngInt,
  rngPick,
  tickSeed,
  type MarketLot,
  type WorldState,
} from '@deepholdings/shared';

const BASE_MARKET: readonly MarketLot[] = [
  { name: 'Sword, Adequate (+2)', price: 340 },
  { name: 'Shield, Dented', price: 60 },
  { name: 'Relic, Unidentified', price: 1200 },
  { name: 'Torch, Municipal Issue', price: 4 },
];

const EVENTS = [
  'Region "The Undersill" danger elevated. Contribution window open through Sunday.',
  'Permit office operating at reduced capacity. Processing times extended.',
  'Market flooded with Adequate swords. Prices depressed. Nobody is happy.',
  'Regional audit under way. All grievances must be filed in duplicate.',
] as const;

export function initialWorld(now: Date): WorldState {
  return {
    beat: 0,
    event: EVENTS[0],
    guildName: 'OFFICE OF THE UNDERSILL',
    guildObjective: 'Contribute 500 Supplies to the regional stockpile.',
    guildProgress: 312,
    guildTarget: 500,
    market: BASE_MARKET.map((lot) => ({ ...lot })),
    nextBeatAt: new Date(now.getTime() + HEARTBEAT_SECONDS * 1000).toISOString(),
  };
}

/**
 * One world heartbeat. Seeded on the beat index, so a replayed or duplicated
 * job produces the same world rather than a different one.
 */
export function advanceWorld(world: WorldState, now: Date): WorldState {
  const beat = world.beat + 1;
  const rng = makeRng(tickSeed('world', beat));

  const market = BASE_MARKET.map((lot) => {
    const drift = 0.85 + rng() * 0.35;
    return { name: lot.name, price: Math.max(1, Math.round(lot.price * drift)) };
  });

  const guildProgress = Math.min(world.guildTarget, world.guildProgress + rngInt(rng, 0, 9));
  const event = beat % 12 === 0 ? rngPick(rng, EVENTS) : world.event;

  return {
    ...world,
    beat,
    event,
    market,
    guildProgress,
    nextBeatAt: new Date(now.getTime() + HEARTBEAT_SECONDS * 1000).toISOString(),
  };
}
