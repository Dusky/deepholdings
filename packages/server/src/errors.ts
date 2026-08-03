/**
 * Where an unexpected failure goes.
 *
 * ## Why a seam and not a vendor
 *
 * `ROADMAP.md` asks for "structured logging and error tracking (Sentry or
 * equivalent)". Picking the vendor here would mean taking a dependency and
 * holding a credential, and both of those are the owner's decision rather than
 * a thing to settle in a refactor. So this is the shape without the choice: one
 * method, a logging default, and a named place for an adapter.
 *
 * The pattern is copied deliberately from `push/port.ts` — that module solved
 * the same problem (something needing credentials had to be swappable for
 * something that does not, so tests and a laptop exercise every line except the
 * wire) and a second idiom for one problem is worth avoiding.
 *
 * ## What is worth reporting
 *
 * Only failures nobody predicted. `ServiceError` is the game saying *no* —
 * "not enough gold", "the post is filled", "that site is not open to you" — and
 * routing those to an error tracker produces an alert channel that fires on
 * ordinary play and is muted within a day. A tracker everyone ignores is worse
 * than none, because it looks like coverage.
 */

/** The minimum a logger has to do to back a reporter. */
export interface ReporterLog {
  error(payload: unknown, message?: string): void;
}

export interface ErrorReporter {
  report(error: unknown, context?: Record<string, unknown>): void;
}

/**
 * The default: structured, through the server's own logger.
 *
 * Serialises the error rather than passing it through, because a bare `Error`
 * in a JSON log line renders as `{}` in most drains — the stack is on a
 * non-enumerable property and nobody discovers that until the incident.
 */
export class LogReporter implements ErrorReporter {
  constructor(private readonly log: ReporterLog) {}

  report(error: unknown, context: Record<string, unknown> = {}): void {
    const detail =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { message: String(error) };
    this.log.error({ ...context, err: detail }, 'unhandled failure');
  }
}

/** Test double, in the shape of `push`'s NullSender. */
export class RecordingReporter implements ErrorReporter {
  readonly reported: { error: unknown; context: Record<string, unknown> }[] = [];

  report(error: unknown, context: Record<string, unknown> = {}): void {
    this.reported.push({ error, context });
  }
}

/**
 * Where a vendor plugs in.
 *
 * An adapter — `errors/sentry.ts`, reading a DSN from the environment —
 * implements `ErrorReporter` and is selected here, exactly as `makeSender`
 * chooses between `FcmSender` and `NullSender` on whether a service account is
 * configured. No environment variable is read for it yet, on purpose: an
 * unused config field is a promise the code has not kept, and somebody will
 * set it and expect errors to arrive somewhere.
 */
export function makeReporter(log: ReporterLog): ErrorReporter {
  return new LogReporter(log);
}
