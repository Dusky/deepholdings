import { readFileSync } from 'node:fs';

export interface Config {
  port: number;
  host: string;
  /** Postgres connection string; when absent the in-memory adapter is used. */
  databaseUrl: string | null;
  /** Signing key for device tokens. Must be set in any real deployment. */
  tokenSecret: string;
  /** Run the world heartbeat in-process. Off when a separate worker owns it. */
  runHeartbeat: boolean;
  /**
   * Allowed browser origins. The Android build talks to the API cross-origin
   * (capacitor://localhost), so CORS is not a dev-only concern.
   *
   * Outside production this also accepts any private-network origin, so a phone
   * can load the dev client from the desktop's LAN address. Production gets the
   * explicit list and nothing else.
   */
  corsOrigins: CorsOrigin;
  /**
   * Apply pending migrations on boot. Convenient in dev and tests; in
   * production the deploy runs `npm run migrate` so a schema change is a
   * deliberate step, not a side effect of a restart.
   */
  autoMigrate: boolean;
  /**
   * Developer time travel (`POST /v1/dev/advance`).
   *
   * An idle game reveals itself over days, so a playtest that takes a fortnight
   * to say anything never gets run. This lets you look at hour one, day three
   * and day fourteen in a couple of minutes each.
   *
   * Off unless explicitly asked for, and impossible in production regardless of
   * what the environment says. Both conditions, deliberately: this rewrites a
   * player's career.
   */
  devTools: boolean;
  /**
   * FCM service account JSON, or null for a server that cannot push.
   *
   * Read from `FCM_SERVICE_ACCOUNT` (the JSON itself) or
   * `FCM_SERVICE_ACCOUNT_FILE` (a path to it). Never committed and never
   * logged: it is a private key that can send notifications to every device
   * registered to the project.
   *
   * Absent is a supported state, not a broken one. Without it the server runs
   * the whole push path into a sender that reports success and does nothing,
   * so tests and a laptop exercise every line except the wire.
   */
  fcmServiceAccount: string | null;
  /** Run the death sweep alongside the world heartbeat. */
  runSweep: boolean;
}

export type CorsOrigin = string[] | ((origin: string) => boolean);

/**
 * Private-network origins: RFC1918, loopback, link-local and CGNAT, any port.
 *
 * The phone-browser test path loads the client from the desktop's LAN address,
 * which is not a value anyone can put in a default. Matching the address range
 * instead means the fast path works on any home network without configuration,
 * and the pattern is narrow enough that it cannot match a public host.
 *
 * 100.64/10 is in the list because that is where Tailscale and other overlay
 * networks live, and an overlay is the right way to reach a dev server from
 * off-network — far better than forwarding a port on the router at one.
 */
const PRIVATE_ORIGIN =
  /^https?:\/\/(?:localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+|\[::1\])(?::\d+)?$/;

/**
 * Everything that must be true before this process is allowed to serve players.
 *
 * All of these throw rather than warn, and the distinction is the whole point of
 * the function. A misconfigured server that starts is worse than one that does
 * not: it takes traffic, writes state, and tells nobody. A server that refuses
 * to boot is discovered in the deploy, by the person deploying it.
 */
function assertProductionSafe(env: NodeJS.ProcessEnv, config: Config): void {
  if (env.NODE_ENV !== 'production') return;

  /**
   * The check above this one only catches the literal default string, so
   * `TOKEN_SECRET=x` passed it. This key signs every device token; a short one
   * is a forgeable one, and the whole account model rests on it.
   */
  if (config.tokenSecret.length < 32) {
    throw new Error(
      `TOKEN_SECRET must be at least 32 characters in production (got ${config.tokenSecret.length}). ` +
        'It signs every device token.',
    );
  }

  /**
   * The expensive one.
   *
   * Without `DATABASE_URL` the server does not fail — it quietly builds a
   * `MemoryRepository` and logs "State is lost on restart" at *warn*. In
   * production that means every account, every pension and every commendation
   * is discarded on the next deploy, and the only evidence is one line in a log
   * nobody reads until a player asks where their career went.
   *
   * The in-memory adapter is a genuinely useful thing to have — the whole test
   * suite and a laptop run on it. It is just not a thing that should ever be
   * reachable by *omission* on a production host.
   */
  if (!config.databaseUrl) {
    throw new Error(
      'DATABASE_URL must be set in production. Without it the server would run ' +
        'on the in-memory adapter and discard every account on restart.',
    );
  }

  /**
   * An empty allow-list is a server that serves nobody, politely.
   *
   * `resolveCorsOrigins` takes an explicit list literally in production — no
   * private-network fallback — so `CORS_ORIGINS=""` produces a server that
   * boots, answers health checks, and rejects every browser and every Capacitor
   * build at the preflight. That failure looks like a client bug from every
   * angle except this one.
   */
  if (Array.isArray(config.corsOrigins) && config.corsOrigins.length === 0) {
    throw new Error(
      'CORS_ORIGINS resolved to nothing in production. The Android build talks ' +
        'to the API cross-origin, so an empty list refuses every real client.',
    );
  }
}

/**
 * The configuration, with the two private keys removed.
 *
 * Logged once at boot, because "which settings is this instance actually
 * running with" is the first question of every incident and the answer should
 * not require a redeploy to find out. `tokenSecret` signs every device token
 * and `fcmServiceAccount` can push to every registered handset; neither goes
 * anywhere near a log line, so both are reported as presence rather than value.
 */
export function describeConfig(config: Config): Record<string, unknown> {
  return {
    port: config.port,
    host: config.host,
    database: config.databaseUrl ? 'postgres' : 'memory',
    tokenSecret: config.tokenSecret === 'dev-secret-change-me' ? 'DEFAULT' : 'set',
    fcm: config.fcmServiceAccount ? 'configured' : 'absent',
    runHeartbeat: config.runHeartbeat,
    runSweep: config.runSweep,
    autoMigrate: config.autoMigrate,
    devTools: config.devTools,
    corsOrigins: Array.isArray(config.corsOrigins) ? config.corsOrigins : 'private-network + list',
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const tokenSecret = env.TOKEN_SECRET ?? 'dev-secret-change-me';
  if (env.NODE_ENV === 'production' && tokenSecret === 'dev-secret-change-me') {
    throw new Error('TOKEN_SECRET must be set in production');
  }

  const config: Config = {
    port: Number(env.PORT ?? 8787),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl: env.DATABASE_URL ?? null,
    tokenSecret,
    runHeartbeat: env.RUN_HEARTBEAT !== 'false',
    autoMigrate: env.AUTO_MIGRATE
      ? env.AUTO_MIGRATE === 'true'
      : env.NODE_ENV !== 'production',
    corsOrigins: resolveCorsOrigins(env),
    devTools: env.DEV_TOOLS === 'true' && env.NODE_ENV !== 'production',
    fcmServiceAccount: readServiceAccount(env),
    runSweep: env.RUN_SWEEP !== 'false',
  };

  assertProductionSafe(env, config);
  return config;
}

function readServiceAccount(env: NodeJS.ProcessEnv): string | null {
  if (env.FCM_SERVICE_ACCOUNT) return env.FCM_SERVICE_ACCOUNT;
  if (!env.FCM_SERVICE_ACCOUNT_FILE) return null;
  // Read eagerly so a bad path fails at boot rather than at the first death,
  // which would be hours later and on somebody else's schedule.
  return readFileSync(env.FCM_SERVICE_ACCOUNT_FILE, 'utf8');
}

function resolveCorsOrigins(env: NodeJS.ProcessEnv): CorsOrigin {
  // Capacitor Android serves the app from https://localhost by default.
  const configured = (env.CORS_ORIGINS ??
    'http://localhost:5173,capacitor://localhost,https://localhost')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // An explicit list is always taken literally — including in dev, so the
  // production behaviour can be reproduced locally.
  if (env.CORS_ORIGINS || env.NODE_ENV === 'production') return configured;

  return (origin: string) => configured.includes(origin) || PRIVATE_ORIGIN.test(origin);
}
