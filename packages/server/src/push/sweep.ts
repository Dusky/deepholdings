import { resolve } from '../domain/resolve.js';
import { nowTick } from '../clock.js';
import type { Repository } from '../ports.js';
import type { PushSender } from './port.js';

/**
 * The death sweep.
 *
 * Resolution is lazy by design: a recruit's ticks are replayed when somebody
 * reads them, so the server's cost is proportional to players looking rather
 * than to accounts existing. That is the right trade for everything except
 * this one case — a recruit who dies at three in the morning does not die, as
 * far as the server is concerned, until the officer next opens the app, and by
 * then the notification has nothing left to announce.
 *
 * So the heartbeat replays a bounded slice of away accounts and pushes on any
 * death it finds. Three things keep this from becoming the background job the
 * architecture was built to avoid:
 *
 *   - **It only considers accounts with a push token.** No token, no reason to
 *     resolve early, and no way to tell them anyway.
 *   - **It only considers accounts nobody has read recently.** An officer with
 *     the app open resolves themselves, far more often than this ever would.
 *   - **It is capped per beat.** Oldest-seen first, so a backlog drains in
 *     order rather than starving anyone, and the per-beat cost is a constant
 *     rather than a function of how many people have ever signed up.
 *
 * ## It writes nothing, and that is the whole design
 *
 * The obvious implementation calls `loadState` — the ordinary read path, so
 * the sweep cannot drift from the game. It is wrong twice over, and both are
 * the kind of wrong that ships quietly:
 *
 *   - **It would eat the digest.** "While you were away" is derived from the
 *     ticks resolved *in that call*. A sweep that resolves them first leaves
 *     the player's next read with nothing to summarise — so exactly the
 *     players who were away longest would be the ones who get no summary.
 *   - **It would mark the player present.** `loadState` touches
 *     `last_seen_at`, which would corrupt the presence count, misreport the
 *     tavern's "officers present", and drop the account straight back out of
 *     the sweep window.
 *
 * So the sweep calls `resolve()` directly and throws the result away. Ticks
 * are seeded from `(characterId, tick)`, so replaying them again on the
 * player's next read produces the identical death — this is not a prediction
 * that might be wrong, it is a read of something that has already happened and
 * has not been written down yet. The player's first read is untouched: their
 * digest, their journal lines, their death overlay, all exactly as if no sweep
 * had run.
 *
 * The cost of that choice is honest duplication — the away accounts are
 * resolved twice, once here and once when they next look. At the design's
 * stated scale that is cheap, and it buys a background job that cannot damage
 * a player's first impression of their own absence.
 */

/** Not read for this long, and a candidate for early resolution. */
export const AWAY_SECONDS = 15 * 60;

/**
 * Accounts replayed per beat. At the design's stated scale — hundreds of
 * players — this drains any plausible backlog inside one beat and puts a hard
 * ceiling on the heartbeat's cost at any scale above it.
 */
export const SWEEP_LIMIT = 200;

/**
 * Pushes per account per day, server side.
 *
 * The client's budget in `native/sendBudget.ts` cannot govern this: a push is
 * decided on a machine the client is not running on. Deliberately lower than
 * the client's four, because a push interrupts and a scheduled local
 * notification is something the player already agreed to the shape of.
 */
export const PUSH_DAILY_CAP = 2;

export interface SweepReport {
  considered: number;
  replayed: number;
  pushed: number;
  /**
   * Ticks of simulation actually replayed. Reported so the load check can tell
   * the difference between a sweep that is cheap and a sweep that is idle —
   * they look identical from the outside, and this project has already shipped
   * one measurement that turned out to be timing an empty loop.
   */
  ticksReplayed: number;
}

/**
 * One pass. Returns what it did, so the caller can log it and so the load
 * check the roadmap wants has something to measure.
 */
export async function sweepOnce(
  repo: Repository,
  sender: PushSender,
  onError: (error: unknown) => void,
): Promise<SweepReport> {
  const report: SweepReport = { considered: 0, replayed: 0, pushed: 0, ticksReplayed: 0 };

  const candidates = await repo.listSweepCandidates(AWAY_SECONDS, SWEEP_LIMIT);
  report.considered = candidates.length;

  for (const accountId of candidates) {
    try {
      const peeked = await peekDeath(repo, accountId);
      report.replayed += 1;
      report.ticksReplayed += peeked.ticks;
      const death = peeked.death;
      if (!death) continue;

      // Keyed on the recruit, not on the death record — the death row does not
      // exist yet, and its id is minted at write time. A recruit dies once, so
      // the character id is the stable name for this event.
      const key = `death:${death.characterId}`;
      const claimed = await repo.claimPushSend(accountId, key, PUSH_DAILY_CAP);
      if (!claimed) continue;

      const tokens = await repo.listPushTokens(accountId);
      const result = await sender.send(tokens, {
        title: `${death.name} did not return`,
        body: `Lost on Floor ${death.depth}. Cause of death: ${death.cause}. Form P-2 (Pension Claim) awaits your signature.`,
        screen: 'terminal',
        key,
      });
      if (result.delivered > 0) report.pushed += 1;
      if (result.stale.length > 0) await repo.deletePushTokens(result.stale);
    } catch (error) {
      // One bad account must not stop the sweep for everyone behind it.
      onError(error);
    }
  }

  return report;
}

interface PeekedDeath {
  characterId: string;
  name: string;
  depth: number;
  cause: string;
}

/**
 * Replays this account's outstanding ticks and reports a death, without
 * writing anything at all — no character row, no journal, no `last_seen_at`.
 */
async function peekDeath(
  repo: Repository,
  accountId: string,
): Promise<{ death: PeekedDeath | null; ticks: number }> {
  // The latest recruit rather than `getActiveCharacterForUpdate`: this takes no
  // row lock, and a sweep has no business making a player's own read queue
  // behind it. A recruit already recorded dead is skipped — they died on a
  // read, which means the officer was there to see it.
  const record = await repo.getLatestCharacter(accountId);
  if (!record || !record.character.alive) return { death: null, ticks: 0 };

  const orders = await repo.getOrders(accountId);
  const pension = await repo.getPension(accountId);

  const result = resolve({
    character: record.character,
    inventory: record.inventory,
    orders,
    unlocks: pension.unlocks,
    toTick: nowTick(),
    permitAppliedTick: record.permitAppliedTick,
  });

  if (!result.death) return { death: null, ticks: result.ticksResolved };
  return {
    death: {
      characterId: record.character.id,
      name: record.character.name,
      depth: result.death.depth,
      cause: result.death.cause,
    },
    ticks: result.ticksResolved,
  };
}
