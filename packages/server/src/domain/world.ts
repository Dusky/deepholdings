import {
  HEARTBEAT_SECONDS,
  MARKET_DEMAND_FLOOR,
  MARKET_DEMAND_SPREAD,
  makeRng,
  rngPick,
  tickSeed,
  objectiveForCycle,
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
  const objective = objectiveForCycle(0);
  return {
    beat: 0,
    event: EVENTS[0],
    guildName: 'OFFICE OF THE UNDERSILL',
    guildCycle: 0,
    guildObjective: objective.text,
    // Starts empty. It used to start at 312 of 500 with nothing having happened,
    // which is a progress bar apologising for itself.
    guildProgress: 0,
    guildTarget: objective.target,
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

  const event = beat % 12 === 0 ? rngPick(rng, EVENTS) : world.event;

  /**
   * The heartbeat no longer touches the guild bar.
   *
   * It used to add `rngInt(rng, 0, 9)` here, which meant the regional effort
   * advanced at the same rate whether the office had one officer or a thousand,
   * and whether any of them descended. Progress now comes from `addGuildProgress`
   * on the resolution path — the officers move it, or it does not move.
   */
  return {
    ...world,
    beat,
    event,
    market,
    nextBeatAt: new Date(now.getTime() + HEARTBEAT_SECONDS * 1000).toISOString(),
  };
}
