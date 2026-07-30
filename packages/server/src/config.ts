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
   */
  corsOrigins: string[];
  /**
   * Apply pending migrations on boot. Convenient in dev and tests; in
   * production the deploy runs `npm run migrate` so a schema change is a
   * deliberate step, not a side effect of a restart.
   */
  autoMigrate: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const tokenSecret = env.TOKEN_SECRET ?? 'dev-secret-change-me';
  if (env.NODE_ENV === 'production' && tokenSecret === 'dev-secret-change-me') {
    throw new Error('TOKEN_SECRET must be set in production');
  }

  return {
    port: Number(env.PORT ?? 8787),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl: env.DATABASE_URL ?? null,
    tokenSecret,
    runHeartbeat: env.RUN_HEARTBEAT !== 'false',
    autoMigrate: env.AUTO_MIGRATE
      ? env.AUTO_MIGRATE === 'true'
      : env.NODE_ENV !== 'production',
    // Capacitor Android serves the app from https://localhost by default.
    corsOrigins: (env.CORS_ORIGINS ??
      'http://localhost:5173,capacitor://localhost,https://localhost')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}
