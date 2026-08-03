# The API, and only the API.
#
# `packages/client` produces two artefacts and neither is a server: a static
# bundle for a CDN, and the same bundle copied into the APK by `cap sync`.
# Serving it from here would give Fastify a static-file role it does not have,
# and would sit next to a contradictory story — the Android build talks to this
# API *cross-origin*, from `capacitor://localhost`, which is what the whole CORS
# configuration is built around. See docs/ops/deploy.md for where the bundle goes.

# --- dependencies -------------------------------------------------------------
#
# Manifests first, sources later. That ordering is the only reason the install
# layer is cacheable: `npm ci` then re-runs on a lockfile change rather than on
# every edit to a resolver.
#
# `node:22-bookworm-slim` rather than alpine. `pg` and `fastify` are pure JS so
# alpine would work, but musl-versus-glibc is a class of bug that costs more to
# debug once than the ~40MB it saves, and CI already runs on glibc.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
# `--ignore-scripts`: a build should not execute arbitrary postinstall hooks, and
# nothing here needs one.
RUN npm ci --ignore-scripts

# --- build --------------------------------------------------------------------
FROM deps AS build
WORKDIR /app
COPY packages/shared packages/shared
COPY packages/server packages/server
RUN npm run build --workspace @deepholdings/shared \
 && npm run build --workspace @deepholdings/server

# --- runtime ------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
# Production tree only: fastify, @fastify/cors, pg, and the workspace link to
# shared. No tsx, no typescript, no test runner.
RUN npm ci --omit=dev --ignore-scripts --workspace @deepholdings/server \
      --include-workspace-root

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/server/dist packages/server/dist

# No tini or dumb-init. `index.ts` installs its own SIGTERM/SIGINT handlers and
# Node receives them directly as PID 1; there are no child processes to reap, so
# an init shim would be cargo.
USER node
EXPOSE 8787

# `/health`, not `/ready`. A container health check that fails because the
# *database* is briefly away would restart-loop a process that was going to
# recover on its own — see packages/server/src/health.ts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrations are deliberately NOT run here. Production boots with
# autoMigrate:false and `PostgresRepository.init` refuses to start against a
# schema it does not recognise, naming the pending files. That is the designed
# behaviour and the image must not undermine it by migrating on every restart:
# the release step is `node packages/server/dist/migrate.js`.
CMD ["node", "packages/server/dist/index.js"]
