import {
  HEARTBEAT_SECONDS,
  MARKET_DEMAND_FLOOR,
  MARKET_DEMAND_SPREAD,
  makeRng,
  rngInt,
  rngPick,
  tickSeed,
  type LootPriority,
  type WorldState,
} from '@deepholdings/shared';

const CATEGORIES: readonly { category: LootPriority; label: string }[] = [
  { category: 'gold', label: 'Specie & Coin' },
  { category: 'gear', label: 'Serviceable Equipment' },
  { category: 'relics', label: 'Relics, Unappraised' },
  { category: 'knowledge', label: 'Documents & Intelligence' },
];

/**
 * Demand swings by beat, seeded on the beat index so a replayed heartbeat
 * publishes the same market. The band is deliberately narrow: waiting for a
 * good day should be worth something, never worth more than descending.
 */
function driftDemand(rng: () => number): number {
  return Math.round((MARKET_DEMAND_FLOOR + rng() * MARKET_DEMAND_SPREAD) * 100) / 100;
}

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
    market: CATEGORIES.map((entry) => ({ ...entry, demand: 1 })),
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

  const market = CATEGORIES.map((entry) => ({ ...entry, demand: driftDemand(rng) }));

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
