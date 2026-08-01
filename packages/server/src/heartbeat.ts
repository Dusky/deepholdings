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
    if (new Date(world.nextBeatAt).getTime() > now.getTime()) return false;
    await tx.saveWorld(advanceWorld(world, now));
    return true;
  });
}

export function startHeartbeat(repo: Repository, onError: (error: unknown) => void): () => void {
  // Checked more often than the interval so a missed beat catches up quickly.
  const timer = setInterval(() => {
    beatOnce(repo).catch(onError);
  }, (HEARTBEAT_SECONDS / 5) * 1000);

  timer.unref?.();
  return () => clearInterval(timer);
}
