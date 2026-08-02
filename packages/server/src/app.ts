import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import {
  API_VERSION,
  type ApiError,
  type BulkSellRequest,
  type FileFormRequest,
  type HireStaffRequest,
  type StaffPolicyRequest,
  type RequisitionId,
  type UnlockId,
} from '@deepholdings/shared';
import { bearerToken, issueToken, verifyToken } from './auth.js';
import type { Config } from './config.js';
import type { Repository } from './ports.js';
import { LIMITS, RateLimiter } from './rateLimit.js';
import { makeSender } from './push/sender.js';
import type { PushSender } from './push/port.js';
import { sweepOnce } from './push/sweep.js';
import {
  advanceTime,
  devMakeAway,
  authenticateDevice,
  bulkSell,
  claimPension,
  retireRecruit,
  fileForm,
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
  character_dead: 409,
  rate_limited: 429,
  internal: 500,
};

export function buildApp({ repo, config, sender: injected }: AppDeps): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
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

  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof SentReply) return;
    if (error instanceof ServiceError) {
      return reply.status(ERROR_STATUS[error.code]).send(errorBody(error.code, error.message));
    }
    app.log.error(error);
    return reply.status(500).send(errorBody('internal', 'internal error'));
  });

  app.get('/health', async () => ({ ok: true }));

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

  app.get('/v1/bulletin', async () => getBulletin(repo));

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
