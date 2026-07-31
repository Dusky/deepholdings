import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { API_VERSION, type ApiError, type UnlockId } from '@deepholdings/shared';
import { bearerToken, issueToken, verifyToken } from './auth.js';
import type { Config } from './config.js';
import type { Repository } from './ports.js';
import {
  authenticateDevice,
  claimPension,
  getBulletin,
  getLedger,
  getTavern,
  loadState,
  purchaseUnlock,
  sendTavernMessage,
  ServiceError,
  updateOrders,
} from './service.js';

export interface AppDeps {
  repo: Repository;
  config: Config;
}

const ERROR_STATUS: Record<ApiError['error']['code'], number> = {
  unauthorized: 401,
  not_found: 404,
  invalid_request: 400,
  insufficient_pension: 409,
  already_owned: 409,
  character_dead: 409,
  rate_limited: 429,
  internal: 500,
};

export function buildApp({ repo, config }: AppDeps): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  app.register(cors, { origin: config.corsOrigins, credentials: false });

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
    return loadState(repo, accountId);
  });

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

  app.post('/v1/pension/unlocks', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    const { id } = (request.body ?? {}) as { id?: UnlockId };
    if (!id) throw new ServiceError('invalid_request', 'id required');
    return purchaseUnlock(repo, accountId, id);
  });

  app.post('/v1/pension/claim', async (request, reply) => {
    const accountId = await requireAccount(request, reply);
    return claimPension(repo, accountId);
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
