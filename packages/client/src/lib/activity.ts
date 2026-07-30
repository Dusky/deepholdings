import {
  MAX_DEPTH,
  PERMIT_DEPTH_LIMIT,
  TICK_SECONDS,
  type Character,
  type StandingOrders,
} from '@deepholdings/shared';

/**
 * What the recruit is doing right now, in words.
 *
 * Presentation only: this mirrors the server's resolution rules to describe
 * state the server already sent. It never advances anything — if the two ever
 * disagree, the server is right and the next refresh corrects the label.
 */
export function currentActivity(character: Character, orders: StandingOrders): string {
  if (!character.alive) return 'Awaiting pension filing...';

  const limit = PERMIT_DEPTH_LIMIT[character.permitTier] ?? MAX_DEPTH;
  const target = Math.min(orders.targetDepth, MAX_DEPTH);
  const retreatHp = Math.ceil((character.maxHp * orders.retreatPct) / 100);

  if (character.hp <= retreatHp && character.depth > 0) {
    return `Ascending from Floor ${character.depth}...`;
  }
  if (character.depth === 0 && character.hp < character.maxHp) {
    return 'Resting at Depot 3...';
  }
  if (character.depth >= limit && target > limit) {
    return `Awaiting Permit D-${character.permitTier + 1} processing...`;
  }
  if (character.depth < Math.min(target, limit)) {
    return `Descending to Floor ${character.depth + 1}...`;
  }
  return `Delving on Floor ${character.depth}...`;
}

/** Progress through the current resolution tick, 0–100. */
export function tickProgress(serverNow: Date): number {
  const withinTick = (serverNow.getTime() / 1000) % TICK_SECONDS;
  return (withinTick / TICK_SECONDS) * 100;
}

/** Seconds until the next resolution tick. */
export function secondsToNextTick(serverNow: Date): number {
  return Math.max(0, Math.ceil(TICK_SECONDS - ((serverNow.getTime() / 1000) % TICK_SECONDS)));
}

/** Seconds until an ISO timestamp, floored at zero. */
export function secondsUntil(iso: string, serverNow: Date): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - serverNow.getTime()) / 1000));
}

/** `HH:MM` in the viewer's timezone, for journal timestamps. */
export function clockOf(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
