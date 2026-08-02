/**
 * Rate limiting on writes.
 *
 * In-process and in-memory, deliberately. A shared limiter (Redis, a Postgres
 * table) is the correct answer for a fleet, and this game runs one server —
 * adding a dependency and a network round trip to every write in order to be
 * correct about a topology that does not exist is the wrong trade. When there
 * are two instances this becomes wrong in a specific, known way: the effective
 * limit multiplies by the instance count. That is written here so the person
 * who adds the second instance finds it rather than discovers it.
 *
 * ## What is actually being defended
 *
 * Not the database. The load check says a read costs about 12ms and a write
 * rather less, so a single abusive client cannot hurt Postgres from a phone.
 *
 * The tavern is the real target, and the threat is social rather than
 * technical: one person can flood a shared channel faster than anyone can read
 * it, and the roadmap lists chat safety as the one part of M6 that is not
 * cuttable if chat ships at all. Everything else is capped because a client
 * with a retry loop and no backoff is a thing that exists, and because the
 * cost of being wrong about which endpoint gets hammered is a limiter nobody
 * wrote.
 *
 * ## Why a token bucket
 *
 * A fixed window lets someone send their whole allowance at the boundary and
 * the next window's immediately after — double the intended rate, at the worst
 * possible moment. A bucket refills continuously, so bursts are bounded by
 * capacity and the sustained rate is exactly the refill rate.
 */

export interface RateLimit {
  /** Requests allowed in a burst. */
  burst: number;
  /** Sustained requests per minute. */
  perMinute: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

/**
 * Per-route limits.
 *
 * The tavern is the tight one and the only one chosen for a reason other than
 * "surely not more than this": six messages a minute is faster than anyone
 * types thoughtfully and slower than a flood.
 *
 * The rest are generous on purpose. A limiter that fires during ordinary play
 * teaches players that the game is broken, and a false positive here costs
 * more than a slow attacker does.
 */
export const LIMITS: Record<string, RateLimit> = {
  'POST /v1/tavern': { burst: 3, perMinute: 6 },
  'POST /v1/auth/device': { burst: 5, perMinute: 10 },
  'PUT /v1/orders': { burst: 10, perMinute: 30 },
  'POST /v1/ledger/sell': { burst: 20, perMinute: 60 },
  'POST /v1/ledger/sell-bulk': { burst: 10, perMinute: 30 },
  'POST /v1/office/requisitions': { burst: 10, perMinute: 20 },
  'POST /v1/pension/unlocks': { burst: 10, perMinute: 20 },
  // Every filing spends gold and standing, so the natural limit is the purse.
  // This is here to stop a loop, not to pace an officer.
  'POST /v1/armoury/file': { burst: 10, perMinute: 20 },
  'POST /v1/pension/claim': { burst: 10, perMinute: 20 },
  'POST /v1/recruit/retire': { burst: 5, perMinute: 10 },
  'POST /v1/push/register': { burst: 5, perMinute: 10 },
  'POST /v1/push/unregister': { burst: 5, perMinute: 10 },
};

/** How long an idle bucket is kept before it is forgotten. */
const IDLE_MS = 10 * 60 * 1000;

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private lastSweep = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /**
   * Takes a token. Returns null if allowed, or the seconds to wait if not.
   *
   * `key` is caller-chosen so the limit can follow the account where there is
   * one and the address where there is not — an unauthenticated sign-in has no
   * account yet, and limiting all sign-ups as one bucket would make the first
   * player of the day rate-limit the second.
   */
  take(key: string, limit: RateLimit): number | null {
    const at = this.now();
    this.sweep(at);

    const bucket = this.buckets.get(key) ?? { tokens: limit.burst, lastRefill: at };
    const refill = ((at - bucket.lastRefill) / 60_000) * limit.perMinute;
    bucket.tokens = Math.min(limit.burst, bucket.tokens + refill);
    bucket.lastRefill = at;

    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      const seconds = ((1 - bucket.tokens) / limit.perMinute) * 60;
      return Math.max(1, Math.ceil(seconds));
    }

    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return null;
  }

  /**
   * Drops buckets nobody has touched in a while.
   *
   * Without this the map is a slow memory leak keyed on every account and
   * address that has ever written — which on a long-lived process is
   * unbounded. Swept lazily rather than on a timer so it cannot keep the
   * process alive or fire during a test.
   */
  private sweep(at: number): void {
    if (at - this.lastSweep < IDLE_MS) return;
    this.lastSweep = at;
    for (const [key, bucket] of this.buckets) {
      if (at - bucket.lastRefill > IDLE_MS) this.buckets.delete(key);
    }
  }

  /** Test support. */
  get size(): number {
    return this.buckets.size;
  }
}
