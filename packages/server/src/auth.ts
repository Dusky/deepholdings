import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Device tokens: a signed account id, nothing more.
 *
 * Deliberately minimal — anonymous device accounts get a player playing in one
 * round trip. Before anything is ever purchased this must be upgraded to a real
 * sign-in (Google Play Games / Sign in with Google), because an entitlement
 * bound to a wiped device is a support ticket, not a sale.
 */

interface TokenPayload {
  accountId: string;
  issuedAt: number;
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function issueToken(accountId: string, secret: string): string {
  const payload: TokenPayload = { accountId, issuedAt: Date.now() };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function verifyToken(token: string, secret: string): string | null {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    return typeof payload.accountId === 'string' ? payload.accountId : null;
  } catch {
    return null;
  }
}

export function bearerToken(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}
