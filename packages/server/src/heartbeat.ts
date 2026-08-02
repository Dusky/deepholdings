import { HEARTBEAT_SECONDS } from '@deepholdings/shared';
import { advanceWorld } from './domain/world.js';
import { now as worldNow } from './clock.js';
import type { Repository } from './ports.js';

/**
 * The world heartbeat: the only scheduled work in the system. Player progress
 * is resolved lazily on read, so this job only advances shared state — market
 * prices, guild objectives, region events.
 *
 * Safe to run from several instances: the world row is locked inside the
 * transaction and the beat is only advanced once its due time has passed.
 */
export async function beatOnce(repo: Repository, now = worldNow()): Promise<boolean> {
  return repo.transaction(async (tx) => {
    const world = await tx.getWorld();
    const due = new Date(world.nextBeatAt).getTime();
    const ahead = due - now.getTime();

    /**
     * A beat is due, or the row says something impossible.
     *
     * Nothing legitimate schedules a beat further out than one interval —
     * `advanceWorld` writes `now + HEARTBEAT_SECONDS` and nothing else touches
     * the field. So a larger gap is a corrupt row, and the old check treated it
     * as "not due yet" and did nothing about it, forever.
     *
     * That is reachable, and it happened here. `/v1/dev/advance` moves an
     * in-process clock offset; a beat landing during a fast-forward writes its
     * next due time from the advanced clock, and the offset resets when the
     * process restarts. The world row was left pointing seventeen days into the
     * future with `beat` stuck at 7 — market demand frozen, guild bar frozen,
     * and the Ledger's countdown reading 25675:52 — with no path back except
     * waiting out the seventeen days.
     *
     * Production cannot reach it by that route (the dev routes do not exist
     * without DEV_TOOLS), but a clock skew between instances gets to the same
     * place, and "the shared world silently stops" is not a failure worth
     * leaving to luck. Treating an impossible gap as due is self-healing and
     * costs one comparison.
     */
    if (ahead > HEARTBEAT_SECONDS * 1000) {
      await tx.saveWorld(advanceWorld(world, now));
      return true;
    }
    if (ahead > 0) return false;

    await tx.saveWorld(advanceWorld(world, now));
    return true;
  });
}

export function startHeartbeat(
  repo: Repository,
  onError: (error: unknown) => void,
  sweep?: () => Promise<unknown>,
): () => void {
  // Checked more often than the interval so a missed beat catches up quickly.
  const timer = setInterval(() => {
    beatOnce(repo).catch(onError);
  }, (HEARTBEAT_SECONDS / 5) * 1000);
  timer.unref?.();

  // The death sweep runs on its own timer at the full interval, not on the
  // world beat's five-times-a-beat schedule. The world beat is idempotent and
  // cheap to over-call; a sweep replays simulation for every away account, and
  // running it five times as often would be five times the cost for the same
  // result.
  const sweepTimer = sweep
    ? setInterval(() => {
        sweep().catch(onError);
      }, HEARTBEAT_SECONDS * 1000)
    : null;
  sweepTimer?.unref?.();

  return () => {
    clearInterval(timer);
    if (sweepTimer) clearInterval(sweepTimer);
  };
}
