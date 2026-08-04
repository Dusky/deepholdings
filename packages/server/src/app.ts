import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import {
  API_VERSION,
  type ApiError,
  type BulkSellRequest,
  type FileFormRequest,
  type HireStaffRequest,
  type StaffPolicyRequest,
  type AssignmentId,
  type CommendationId,
  type RequisitionId,
  type UnlockId,
} from '@deepholdings/shared';
import { bearerToken, issueToken, verifyToken } from './auth.js';
import type { Config } from './config.js';
import type { Repository } from './ports.js';
import { LIMITS, RateLimiter } from './rateLimit.js';
import { registerIdempotency } from './idempotency.js';
import { worldHealth } from './health.js';
import { LogReporter, type ErrorReporter } from './errors.js';
import { makeSender } from './push/sender.js';
import type { PushSender } from './push/port.js';
import { sweepOnce } from './push/sweep.js';
import {
  advanceTime,
  devMakeAway,
  authenticateDevice,
  bulkSell,
  acceptAssignment,
  expeditePermit,
  abandonAssignment,
  fileTransfer,
  purchaseCommendation,
  claimPension,
  retireRecruit,
  fileForm,
  setCountersigned,
  getBulletin,
  hireStaff,
  setStaffPolicy,
  getJournalPage,
  getLedger,
  getTavern,
  loadState,
  purchaseRequisition,
  purchaseUnlock,
  registerPushToken,
  sellItem,
  sendTavernMessage,
  ServiceError,
  unregisterPushToken,
  updateOrders,
} from './service.js';

export interface AppDeps {
  repo: Repository;
  config: Config;
  /** Where unexpected failures go. Defaults to the log; see `errors.ts`. */
  reporter?: ErrorReporter;
  /**
   * Push transport. Only the dev sweep route uses it, but it is injected
   * rather than built here so the server has exactly one — an `FcmSender`
   * caches its OAuth token, and two instances would mint two.
   */
  sender?: PushSender;
}

const ERROR_STATUS: Record<ApiError['error']['code'], number> = {
  unauthorized: 401,
  not_found: 404,
  invalid_request: 400,
  insufficient_pension: 409,
  insufficient_gold: 409,
  insufficient_standing: 409,
  not_authorised: 403,
  already_owned: 409,
  // A rule about the career, not a missing precondition the client can fix by
  // retrying — same 409 family as the other "you cannot have this" refusals.
  licence_exhausted: 409,
  character_dead: 409,
  rate_limited: 429,
  duplicate_request: 409,
  internal: 500,
};

export function buildApp({ repo, config, sender: injected, reporter: given }: AppDeps): FastifyInstance {
  const app = Fastify({
    logger:
      process.env.NODE_ENV === 'test'
        ? false
        : {
            level: process.env.LOG_LEVEL ?? 'info',
            /**
             * Fastify's default request serialiser does not log headers, so
             * nothing leaks today. This is here for the day somebody adds a
             * custom serialiser: a bearer token in a log drain is a credential
             * in a place nobody is watching, and the cost of pre-empting it is
             * one line.
             */
            redact: ['req.headers.authorization'],
          },
  });
  const reporter = given ?? new LogReporter(app.log);
  // Built lazily and only when the dev sweep can actually be reached: in
  // production this route does not exist, and constructing a sender would
  // parse credentials for nobody.
  const sender = injected ?? (config.devTools ? makeSender(config, app.log) : null);
  const allow =
    typeof config.corsOrigins === 'function'
      ? config.corsOrigins
      : (origin: string) => (config.corsOrigins as string[]).includes(origin);

  app.register(cors, {
    // A predicate arrives as fastify-cors' delegate signature; a list passes
    // straight through.
    origin:
      typeof config.corsOrigins === 'function'
        ? (origin, callback) => callback(null, origin === undefined || allow(origin))
        : config.corsOrigins,
    // Stated rather than defaulted. The default is GET,HEAD,POST, which
    // silently blocked `PUT /v1/orders` — the one endpoint that files Form
    // SO-1, and therefore the whole game — in every cross-origin browser. The
    // client is always cross-origin: Vite on :5173 in dev, and the Android
    // build serves from capacitor://localhost against a hosted API.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'OPTIONS'],
    credentials: false,
  });

  /** Resolves the bearer token to an account id, or ends the request. */
  const requireAccount = async (request: FastifyRequest, reply: FastifyReply): Promise<string> => {
    const token = bearerToken(request.headers.authorization);
    const accountId = token ? verifyToken(token, config.tokenSecret) : null;
    if (!accountId) {
      await reply.status(401).send(errorBody('unauthorized', 'missing or invalid token'));
      throw new SentReply();
    }
    return accountId;
  };

  /**
   * Rate limiting, as one hook rather than per route.
   *
   * Keyed on the account where there is one and the client address otherwise.
   * Sign-in has no account yet, and keying every sign-up into one bucket would
   * let the first player of the day rate-limit the second.
   *
   * A request whose token does not verify is left alone entirely, so it gets
   * 401 from the route rather than 429 from here. Two reasons, and the first
   * is the one that matters: "you are going too fast" is a confusing thing to
   * tell someone whose real problem is that they are logged out, and a client
   * told to back off will back off instead of re-authenticating — which is the
   * one action that would fix it. The second is that a 401 flood does no work
   * to defend: `verifyToken` is a signature check with no database access. If
   * that ever needs bounding it belongs at the network edge, not here.
   */
  registerIdempotency(app, repo, config.tokenSecret);

  const limiter = new RateLimiter();
  app.addHook('onRequest', async (request, reply) => {
    const route = `${request.method} ${request.routeOptions?.url ?? request.url}`;
    const limit = LIMITS[route];
    if (!limit) return;

    const token = bearerToken(request.headers.authorization);
    const account = token ? verifyToken(token, config.tokenSecret) : null;
    // Sign-in is the one write with no account to key on, so it keys on the
    // address. Everything else that fails to authenticate is the route's
    // business, not the limiter's.
    if (!account && route !== 'POST /v1/auth/device') return;

    const wait = limiter.take(`${account ?? request.ip}|${route}`, limit);
    if (wait === null) return;

    // In voice, and with the number, because a client that is told to wait can
    // wait — and a 429 with no guidance is the reason retry storms exist.
    await reply
      .status(429)
      .header('retry-after', String(wait))
      .send(errorBody('rate_limited', `Filing too quickly. The clerk will see you in ${wait}s.`));
  });

  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof SentReply) return;
    // The game saying no is not an incident. `ServiceError` covers "not enough
    // gold" and "the post is filled"; reporting those would fire an alert
    // channel on ordinary play, and a channel that fires on ordinary play is
    // muted within a day.
    if (error instanceof ServiceError) {
      return reply.status(ERROR_STATUS[error.code]).send(errorBody(error.code, error.message));
    }
    reporter.report(error, { method: request.method, url: request.url, reqId: request.id });
    return reply.status(500).send(errorBody('internal', 'internal error'));
  });

  /**
   * Liveness. No I/O, deliberately — a restart probe that touches the database
   * will restart-loop a healthy process whose database is briefly away, which
   * is the one thing guaranteed to make an outage worse.
   */
  app.get('/health', async () => ({ ok: true }));

  /**
   * Readiness, and the world clock.
   *
   * 503 only when storage is unreachable: that is the condition under which
   * this instance genuinely cannot serve, and the one a load balancer should
   * route around. A stale world beat is reported as a *field* — see
   * `health.ts` for why failing on it would convert a stopped background job
   * into a fleet-wide outage.
   *
   * Neither probe is rate-limited (neither appears in `LIMITS`), because a
   * platform health check that starts getting 429s looks exactly like an
   * unhealthy instance.
   */
  app.get('/ready', async (_request, reply) => {
    try {
      await repo.ping();
    } catch (error) {
      reporter.report(error, { at: 'ready' });
      return reply.status(503).send({ ok: false, database: 'down' });
    }
    return { ok: true, database: 'up', world: await worldHealth(repo) };
  });

  // Hitting the API in a browser is a normal thing to do while setting up a
  // device; a bare 404 gives no clue that the server is fine.
  app.get('/', async () => ({
    service: 'Subterranean Resource Authority — Case Management System',
    notice: 'This endpoint serves case officers, not the public. See /health.',
    api: `/${API_VERSION}`,
  }));

  app.post('/v1/auth/device', async (request) => {
    const { deviceId } = (request.body ?? {}) as { deviceId?: string };
    const account = await authenticateDevice(repo, deviceId ?? '');
    return { token: issueToken(account.id, config.tokenSecret), account };
  });

  app.get('/v1/state', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    return loadState(repo, accountId, config.devTools);
  });

  // Time travel for playtesting. Registered only when enabled, so when it is
  // off the route does not exist rather than existing and refusing — an
  // endpoint that 403s still tells you it is there.
  if (config.devTools) {
    app.post('/v1/dev/advance', async (request, reply) => {
      const accountId = await requireAccount(request, reply);
      const { hours } = (request.body ?? {}) as { hours?: number };
      return advanceTime(repo, accountId, Math.round(Number(hours) * 60));
    });

    // A night's absence: the world clock moves and nobody reads it, leaving
    // genuinely unresolved ticks and an account outside the away window. Both
    // are what the sweep needs and neither is otherwise producible by hand —
    // /v1/dev/advance resolves as it goes, so it leaves nothing outstanding.
    app.post('/v1/dev/away', async (request, reply) => {
      const accountId = await requireAccount(request, reply);
      const { hours } = (request.body ?? {}) as { hours?: number };
      return devMakeAway(repo, accountId, hours);
    });

    // Runs the sweep once, on demand, and reports what it did. The sweep is
    // otherwise on a five-minute timer and silent about accounts it found
    // nothing wrong with, which makes "is push working" an unanswerable
    // question at exactly the moment you need to answer it.
    app.post('/v1/dev/sweep', async (request, reply) => {
      await requireAccount(request, reply);
      if (!sender) throw new ServiceError('not_found', 'no push sender configured');
      return sweepOnce(repo, sender, (error) => app.log.error(error, 'dev sweep'));
    });
  }

  app.put('/v1/orders', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    const body = (request.body ?? {}) as { orders?: unknown };
    const orders = await updateOrders(repo, accountId, body.orders as never);
    return { orders, filedAt: new Date().toISOString() };
  });

  app.get('/v1/ledger', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    return getLedger(repo, accountId);
  });

  app.post('/v1/ledger/sell', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    const { name, quantity } = (request.body ?? {}) as { name?: string; quantity?: number };
    return sellItem(repo, accountId, name ?? '', quantity);
  });

  app.post('/v1/ledger/sell-bulk', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    const body = (request.body ?? {}) as BulkSellRequest;
    return bulkSell(repo, accountId, {
      category: body.category,
      maxUnitValue: body.maxUnitValue,
    });
  });

  app.post('/v1/office/requisitions', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    const { id } = (request.body ?? {}) as { id?: RequisitionId };
    if (!id) throw new ServiceError('invalid_request', 'id required');
    return purchaseRequisition(repo, accountId, id);
  });

  // Filing a form. Costs gold and Union Standing, both taken here, and the
  // ruling lands in the tick loop hours later like everything else.
  app.post('/v1/armoury/file', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    const body = (request.body ?? {}) as Partial<FileFormRequest>;
    if (!body.form || typeof body.caseFileId !== 'string') {
      throw new ServiceError('invalid_request', 'form and caseFileId required');
    }
    return fileForm(repo, accountId, {
      form: body.form,
      caseFileId: body.caseFileId,
      clauseIndex: Number(body.clauseIndex),
      donorCaseFileId: body.donorCaseFileId,
      donorClauseIndex:
        body.donorClauseIndex === undefined ? undefined : Number(body.donorClauseIndex),
    });
  });

  /*
   * Direct Issue (Form 5-E): keep this file by hand, or release it.
   *
   * Not a filing, so it is not on the idempotency list and takes no processing
   * time. Every other form is the Authority doing something to an item and the
   * wait is the point; this is the officer instructing their own quartermaster
   * about their own drawer, and the design says a release returns the slot to
   * discretion *immediately*. A two-hour wait to change your mind about which
   * file to keep would be paperwork for its own sake.
   *
   * Idempotent by construction: it sets a boolean to a value the caller states
   * rather than toggling, so a retried request cannot flip it back.
   */
  app.post('/v1/armoury/countersign', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    const { caseFileId, countersigned } = (request.body ?? {}) as {
      caseFileId?: string;
      countersigned?: boolean;
    };
    if (typeof caseFileId !== 'string' || typeof countersigned !== 'boolean') {
      throw new ServiceError('invalid_request', 'caseFileId and countersigned required');
    }
    return setCountersigned(repo, accountId, caseFileId, countersigned);
  });

  // The registry: hiring costs gold, amending a standing instruction is free.
  app.post('/v1/registry/hire', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    const { role } = (request.body ?? {}) as Partial<HireStaffRequest>;
    if (!role) throw new ServiceError('invalid_request', 'role required');
    return hireStaff(repo, accountId, role);
  });

  app.put('/v1/registry/policy', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    const { role, policy } = (request.body ?? {}) as Partial<StaffPolicyRequest>;
    if (!role) throw new ServiceError('invalid_request', 'role required');
    return setStaffPolicy(repo, accountId, role, Number(policy));
  });

  app.post('/v1/pension/unlocks', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    const { id } = (request.body ?? {}) as { id?: UnlockId };
    if (!id) throw new ServiceError('invalid_request', 'id required');
    return purchaseUnlock(repo, accountId, id);
  });

  // Push registration. The token is a device identifier from FCM, not a
  // credential of ours — it is stored so the sweep knows where to ring.
  app.post('/v1/push/register', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    const { token, platform } = (request.body ?? {}) as { token?: unknown; platform?: unknown };
    return registerPushToken(repo, accountId, token, platform);
  });

  app.post('/v1/push/unregister', async (request, reply) => {
    await requireAccount(request, reply);
    const { token } = (request.body ?? {}) as { token?: unknown };
    return unregisterPushToken(repo, token);
  });

  app.post('/v1/permits/expedite', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    return expeditePermit(repo, accountId);
  });

  app.post('/v1/assignments/accept', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    const { id } = (request.body ?? {}) as { id?: AssignmentId };
    if (!id) throw new ServiceError('invalid_request', 'id required');
    return acceptAssignment(repo, accountId, id);
  });

  app.post('/v1/assignments/abandon', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    return abandonAssignment(repo, accountId);
  });

  app.post('/v1/career/transfer', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    return fileTransfer(repo, accountId);
  });

  app.post('/v1/transfer/commendations', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    const { id } = (request.body ?? {}) as { id?: CommendationId };
    if (!id) throw new ServiceError('invalid_request', 'id required');
    return purchaseCommendation(repo, accountId, id);
  });

  app.post('/v1/pension/claim', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    return claimPension(repo, accountId);
  });

  // Form R-1. Same shape as a claim, because the outcome is the same: an award
  // banked and a successor assigned.
  app.post('/v1/recruit/retire', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    return retireRecruit(repo, accountId);
  });

  // Paging back through the log. `before` is the id of the oldest line the
  // client is currently showing.
  app.get('/v1/journal', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    const { before } = request.query as { before?: string };
    if (!before) throw new ServiceError('invalid_request', 'before required');
    return getJournalPage(repo, accountId, before);
  });

  app.get('/v1/bulletin', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    return getBulletin(repo, accountId);
  });

  app.get('/v1/tavern', async (request) => {
    const { sinceId } = request.query as { sinceId?: string };
    return getTavern(repo, Number(sinceId ?? 0) || 0);
  });

  app.post('/v1/tavern', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    const { body } = (request.body ?? {}) as { body?: string };
    return { message: await sendTavernMessage(repo, accountId, body ?? '') };
  });

  return app;
}

/** Marker for "the reply was already sent by a guard". */
class SentReply extends Error {}

function errorBody(code: ApiError['error']['code'], message: string): ApiError {
  return { error: { code, message } };
}
