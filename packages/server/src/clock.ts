import { TICK_SECONDS } from '@deepholdings/shared';

/**
 * The world clock.
 *
 * Everything that converts a moment into a tick reads it from here, so that a
 * dev fast-forward can move time rather than move the recruit.
 *
 * The previous fast-forward wound the character's watermark *backwards* and let
 * the resolver replay to `Date.now()`. That looks equivalent and is not: the
 * resolver seeds every tick from `tickSeed(characterId, tick)`, and rewinding
 * to the same absolute window replays the same seeds. Six one-hour advances
 * simulated the same hour six times — measured, in `tools/_ticks.ts`: sixty
 * journal entries across twenty-eight distinct ticks spanning fifty-nine
 * minutes. A career fast-forwarded a fortnight was one hour on a loop, which is
 * why fast-forwarded recruits almost never died and why the balance numbers
 * taken through that endpoint were wrong.
 *
 * The offset is process-global, not per-account, because the alternative is a
 * per-account time zone: two officers in one world resolving against different
 * nows, with a shared tavern and a shared bulletin between them. Moving the
 * world is the smaller lie.
 */
let offsetTicks = 0;

/** Now, as the world sees it. */
export function now(): Date {
  return new Date(Date.now() + offsetTicks * TICK_SECONDS * 1000);
}

/** Now, in ticks. */
export function nowTick(): number {
  return Math.floor(now().getTime() / (TICK_SECONDS * 1000));
}

/**
 * Push the world forward. Dev tooling only — the route that reaches this is
 * registered only when `config.devTools` is on, which production refuses.
 */
export function advanceClock(ticks: number): void {
  offsetTicks += ticks;
}

/** How far ahead of the wall clock the world is running. */
export function clockOffsetTicks(): number {
  return offsetTicks;
}

/** Test support: put the world back on the wall clock. */
export function resetClock(): void {
  offsetTicks = 0;
}
