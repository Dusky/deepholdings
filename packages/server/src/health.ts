/**
 * Is this instance serving, and is the shared world still turning?
 *
 * Two different questions, and conflating them is the mistake this module
 * exists to avoid. They are answered by two routes with two audiences:
 *
 * - `GET /health` — **liveness**. "This process is answering." No I/O. A
 *   platform restarts the container when this fails.
 * - `GET /ready` — **readiness and diagnostics**. Can it reach storage, and
 *   what is the world clock doing.
 *
 * ## Why a stale world does not make an instance unready
 *
 * The obvious design fails `/ready` when beats stop, and it is wrong. Player
 * progress is resolved *lazily, per player, on read* — a frozen world clock
 * costs you drifting market demand and a stuck guild bar, and costs you nothing
 * at all in the ability to serve a request. Returning 503 would pull every
 * instance out of rotation because one background job stopped, turning a
 * degraded shared clock into a total outage. That trade is never worth it.
 *
 * So staleness is a **field in the body**, not a status code, and the alert is
 * an external probe reading that field. `docs/ops/deploy.md` says which.
 */
import { HEARTBEAT_SECONDS } from '@deepholdings/shared';
import { now as worldNow } from './clock.js';
import type { Repository } from './ports.js';

export interface WorldHealth {
  beat: number;
  nextBeatAt: string;
  /** Seconds the next beat is overdue by. Beats have stopped. */
  overdueSeconds: number;
  /**
   * Seconds the next beat is scheduled *into the future* beyond one interval.
   *
   * This is the failure that actually happened, and it is why staleness is
   * measured in both directions rather than only as lateness. A beat landing
   * during a dev fast-forward wrote its next due time from an advanced clock;
   * the offset reset on restart, and the world row was left pointing seventeen
   * days ahead with `beat` stuck at 7 — market frozen, guild bar frozen, and
   * the Ledger countdown reading 25675:52. Nothing was late. Everything was
   * early, forever.
   */
  aheadSeconds: number;
  stale: boolean;
}

/**
 * Beats may be missed briefly without anything being wrong — `startHeartbeat`
 * checks five times an interval and a slow transaction can skip one. Three
 * intervals is comfortably past noise and still well inside a human noticing.
 */
const OVERDUE_LIMIT = HEARTBEAT_SECONDS * 3;

export async function worldHealth(repo: Repository, now = worldNow()): Promise<WorldHealth> {
  const world = await repo.getWorld();
  const due = new Date(world.nextBeatAt).getTime();
  const drift = due - now.getTime();

  const overdueSeconds = Math.max(0, Math.round(-drift / 1000));
  const aheadSeconds = Math.max(0, Math.round((drift - HEARTBEAT_SECONDS * 1000) / 1000));

  return {
    beat: world.beat,
    nextBeatAt: world.nextBeatAt,
    overdueSeconds,
    aheadSeconds,
    /**
     * The ahead threshold is zero-tolerance on purpose: nothing legitimate ever
     * schedules a beat further out than one interval, because `advanceWorld` is
     * the only writer and it always writes `now + HEARTBEAT_SECONDS`. That is
     * the same "impossible gap" test `beatOnce` self-heals on, so the metric
     * and the repair agree on what impossible means by construction rather than
     * by two constants that have to be kept in step.
     */
    stale: overdueSeconds > OVERDUE_LIMIT || aheadSeconds > 0,
  };
}
