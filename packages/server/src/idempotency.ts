/**
 * A retried purchase must not charge twice.
 *
 * ## Why only four routes
 *
 * Thirteen endpoints mutate something. Nine of them are already safe, not by
 * accident but because the game's own rules refuse a repeat: buying a
 * requisition or a pension rung you already own is `already_owned`; a second
 * transfer finds the pension zeroed and is `not_authorised`; a second Form 4-E
 * finds `permitExpeditedTick` equal and is refused; claiming a pension twice
 * finds the successor alive. A duplicate there is a confusing error message,
 * which is a UX defect rather than a loss.
 *
 * Four lose something real:
 *
 * - `POST /v1/registry/hire` — **the sharp one.** It is a *ladder*, so a
 *   duplicate is not a repeat purchase, it is a purchase of the next tier the
 *   officer never asked for. Forty thousand gold, on a dropped connection.
 * - `POST /v1/ledger/sell` — sells more of the stack.
 * - `POST /v1/ledger/sell-bulk` — sweeps the cabinet again.
 * - `POST /v1/armoury/file` — spends gold *and* Union Standing again, and
 *   standing is the scarcest thing an officer has.
 *
 * The mechanism is generic and the list is one `Set`, so extending it later is
 * a one-line change. Guarding all thirteen now would add a write to nine
 * requests that do not need one.
 *
 * ## Three contract decisions
 *
 * **Only 2xx is recorded.** A 500 has to stay retryable, and replaying
 * "insufficient gold" a minute later would refuse a purchase the officer can now
 * afford. Anything else releases the key.
 *
 * **A reservation older than a minute is reclaimed.** If the process dies
 * between the mutation committing and the outcome being written, the row sits
 * at `status IS NULL` and every retry gets 409 — forever, for that key. Treating
 * an old reservation as abandoned fixes that, and re-opens the double-charge
 * window for exactly that crash. Naming the residual risk rather than hiding it:
 * it is bounded to a process death inside a millisecond-wide window, and the
 * alternative is a permanently jammed key.
 *
 * **The airtight version is not this.** Writing the idempotency row inside the
 * same transaction as the mutation removes the risk above completely, and costs
 * threading a key through thirteen service functions and changing what
 * `MemoryRepository`'s promise-chain transaction means. That is a decision for
 * the owner, recorded here rather than taken quietly.
 */
import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { bearerToken, verifyToken } from './auth.js';
import type { Repository } from './ports.js';

export const IDEMPOTENT_ROUTES = new Set([
  'POST /v1/registry/hire',
  'POST /v1/ledger/sell',
  'POST /v1/ledger/sell-bulk',
  'POST /v1/armoury/file',
]);

/** How long a request may hold a key before it is presumed dead. */
export const STALE_RESERVATION_SECONDS = 60;

/** How long a completed key is answerable. A retry after this is a new request. */
export const KEY_RETENTION_SECONDS = 24 * 3600;

export const IDEMPOTENCY_HEADER = 'idempotency-key';

/** Set on a replayed response so a client can tell, and so tests can assert it. */
export const REPLAYED_HEADER = 'idempotency-replayed';

interface Claimed {
  accountId: string;
  key: string;
}

/** Requests carry their claim between the two hooks. */
declare module 'fastify' {
  interface FastifyRequest {
    idempotency?: Claimed;
  }
}

function hashOf(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');
}

export function registerIdempotency(
  app: FastifyInstance,
  repo: Repository,
  tokenSecret: string,
): void {
  app.decorateRequest('idempotency', undefined);

  /**
   * `preHandler`, not `onRequest` — the body is not parsed yet at `onRequest`,
   * and the hash needs it. The rate limiter can live at `onRequest` precisely
   * because it only looks at the route and the token.
   */
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const route = `${request.method} ${request.routeOptions?.url ?? request.url}`;
    if (!IDEMPOTENT_ROUTES.has(route)) return;

    const key = request.headers[IDEMPOTENCY_HEADER];
    if (typeof key !== 'string' || key.length === 0 || key.length > 200) return;

    const token = bearerToken(request.headers.authorization);
    const accountId = token ? verifyToken(token, tokenSecret) : null;
    // No account, no key: the route's own auth will refuse it in a moment, and
    // an unauthenticated request has nothing to charge.
    if (!accountId) return;

    const claim = await repo.beginIdempotent(
      accountId, key, route, hashOf(request.body), STALE_RESERVATION_SECONDS,
    );

    if (claim.state === 'replay') {
      await reply.header(REPLAYED_HEADER, 'true').status(claim.status).send(claim.response);
      return reply;
    }
    if (claim.state === 'in_flight' || claim.state === 'conflict') {
      return reply.status(409).send({
        error: {
          code: 'duplicate_request',
          message:
            claim.state === 'in_flight'
              ? 'That request is already being processed.'
              : 'That key was used for a different request.',
        },
      });
    }

    request.idempotency = { accountId, key };
  });

  /**
   * `onSend` rather than `onResponse`, so the outcome is durable *before* the
   * client can possibly retry. It is one small write, and the millisecond is
   * worth the correctness.
   */
  app.addHook('onSend', async (request, reply, payload) => {
    const claimed = request.idempotency;
    if (!claimed) return payload;

    if (reply.statusCode >= 200 && reply.statusCode < 300) {
      const body = typeof payload === 'string' ? JSON.parse(payload) : payload;
      await repo.completeIdempotent(claimed.accountId, claimed.key, reply.statusCode, body);
    } else {
      await repo.releaseIdempotent(claimed.accountId, claimed.key);
    }
    return payload;
  });
}
