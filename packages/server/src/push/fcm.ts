import { createSign } from 'node:crypto';
import type { PushMessage, PushResult, PushSender } from './port.js';

/**
 * FCM over the HTTP v1 API.
 *
 * v1 rather than the legacy server-key endpoint: legacy is deprecated and the
 * server key is a bearer credential with no scope and no expiry, which is a bad
 * thing to keep in an environment variable. v1 wants a service account and a
 * short-lived OAuth token, which is more work here and much less to lose.
 *
 * Implemented against `fetch` and `node:crypto` rather than firebase-admin.
 * The SDK is roughly fifty megabytes of dependency to sign a JWT and POST some
 * JSON, and it brings its own opinions about process lifecycle into a Fastify
 * server that already has some.
 */

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

/** Parses the service account JSON and refuses anything that is not one. */
export function parseServiceAccount(raw: string): ServiceAccount {
  const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
  const missing = (['project_id', 'client_email', 'private_key'] as const).filter(
    (field) => typeof parsed[field] !== 'string' || parsed[field] === '',
  );
  if (missing.length > 0) {
    throw new Error(`service account is missing: ${missing.join(', ')}`);
  }
  return {
    project_id: parsed.project_id as string,
    client_email: parsed.client_email as string,
    // Environment variables cannot hold real newlines, so the usual way to
    // carry a PEM through one is to escape them. Accept both forms.
    private_key: (parsed.private_key as string).replace(/\\n/g, '\n'),
  };
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** A signed assertion good for one hour, exchanged for an access token. */
function assertion(account: ServiceAccount, now: number): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${base64url(signer.sign(account.private_key))}`;
}

export class FcmSender implements PushSender {
  private accessToken: string | null = null;
  private expiresAt = 0;

  constructor(
    private readonly account: ServiceAccount,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** Cached until a minute before expiry, so a burst of sends mints one token. */
  private async token(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.accessToken && now < this.expiresAt - 60) return this.accessToken;

    const response = await this.fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: assertion(this.account, now),
      }).toString(),
    });
    if (!response.ok) {
      throw new Error(`FCM token exchange failed: ${response.status}`);
    }
    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.accessToken = body.access_token;
    this.expiresAt = now + body.expires_in;
    return body.access_token;
  }

  async send(tokens: readonly string[], message: PushMessage): Promise<PushResult> {
    if (tokens.length === 0) return { delivered: 0, stale: [] };

    const access = await this.token();
    const url = `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`;
    const stale: string[] = [];
    let delivered = 0;

    // v1 has no multicast: one request per token. At this game's stated scale
    // — hundreds of players, and a push only on death — that is a handful of
    // requests per heartbeat, and batching is a problem to solve when the
    // measurement says it is one.
    for (const token of tokens) {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: message.title, body: message.body },
            // Data values must be strings in FCM. The client reads `screen`
            // from here and routes on it, exactly as it does for a local
            // notification's `extra`.
            data: { screen: message.screen, key: message.key },
            android: { priority: 'high' },
          },
        }),
      });

      if (response.ok) {
        delivered += 1;
        continue;
      }

      // 404 UNREGISTERED and 400 INVALID_ARGUMENT on the token both mean the
      // device is gone. Anything else is ours or Google's problem, and
      // deleting a live token over a transient 503 would silently stop a
      // player's notifications forever.
      if (response.status === 404 || response.status === 403) stale.push(token);
    }

    return { delivered, stale };
  }
}
