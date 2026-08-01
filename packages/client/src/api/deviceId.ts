/**
 * A stable per-install identifier.
 *
 * This used to be one line — `crypto.randomUUID()` — and that line does not
 * exist on the path this project documents for testing on a phone.
 * `randomUUID` is **secure-context only**: it is present on `https://` and on
 * `localhost`, and absent on `http://192.168.1.42:5173`, which is exactly what
 * `docs/ops/device-testing.md` tells you to open. Minting the device id is the
 * first thing the client does, so the failure is not a degraded feature — it
 * is a blank screen and `crypto.randomUUID is not a function` before anything
 * has loaded.
 *
 * `crypto.getRandomValues` has no such restriction and never has, so the
 * fallback is as random as the fast path; only the formatting is ours. The
 * third fallback exists because an id that is merely *probably* unique is
 * better than an app that cannot start, and because this value is a local
 * handle rather than a secret — it names a device to a server that issues its
 * own signed token, and it is replaced by a real sign-in before anything is
 * purchasable (M7).
 */

export interface UuidSource {
  randomUUID?: () => string;
  getRandomValues?: <T extends ArrayBufferView>(array: T) => T;
}

/** RFC 4122 version 4, formatted from sixteen bytes. */
function formatV4(bytes: Uint8Array): string {
  // Version 4 in the high nibble of byte 6, variant 10xx in byte 8.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

export function randomId(source: UuidSource | undefined = globalThis.crypto): string {
  if (typeof source?.randomUUID === 'function') return source.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof source?.getRandomValues === 'function') {
    source.getRandomValues(bytes);
    return formatV4(bytes);
  }

  // No Web Crypto at all. Vanishingly rare, and still better than throwing.
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return formatV4(bytes);
}
