import type { ScreenId } from '@deepholdings/shared';

/**
 * A message the server wants a device to ring about.
 *
 * `screen` is the same field the local notifications carry, read by the same
 * client handler — a push and a scheduled reminder should be indistinguishable
 * once tapped, and that is easiest to guarantee by making them literally the
 * same payload shape.
 */
export interface PushMessage {
  title: string;
  body: string;
  screen: ScreenId;
  /**
   * The event, not the slot. `death:<id>` rather than `death` — dedupe is only
   * meaningful if two different deaths are two different keys.
   */
  key: string;
}

export interface PushResult {
  delivered: number;
  /** Tokens FCM reported as dead. The caller deletes them. */
  stale: string[];
}

/**
 * Push transport port, in the same shape as the storage port and for the same
 * reason: the thing that needs credentials should be swappable for a thing
 * that does not, so tests and a laptop without a Firebase project still run
 * every code path up to the wire.
 */
export interface PushSender {
  send(tokens: readonly string[], message: PushMessage): Promise<PushResult>;
}

/**
 * The adapter used when no credentials are configured.
 *
 * It reports success. That is deliberate: the alternative is throwing, and a
 * server that refuses to record a death because it could not announce it has
 * its priorities backwards. Nothing about the game depends on delivery.
 */
export class NullSender implements PushSender {
  readonly sent: { tokens: readonly string[]; message: PushMessage }[] = [];

  async send(tokens: readonly string[], message: PushMessage): Promise<PushResult> {
    this.sent.push({ tokens, message });
    return { delivered: tokens.length, stale: [] };
  }
}
