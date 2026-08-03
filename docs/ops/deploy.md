# Deploying the server

The game runs on one Fastify process and one Postgres database. That is the
whole system: player progress is resolved **lazily on read**, so there is no job
queue, no worker tier and nothing that has to be running for a player's career
to advance. The only scheduled work in the process is the world heartbeat, which
moves shared state — market demand, the guild objective, the regional event.

This document is what has to be true before somebody else can host it.

## What runs where

| Piece | Where | Notes |
| --- | --- | --- |
| API | The container in [`Dockerfile`](../../Dockerfile) | One process. `CMD` is the server; migrations are a separate step. |
| Database | Supabase Postgres | Decided in `ROADMAP.md`. Use the **direct** connection, not the transaction pooler. |
| Client | A static host, or the APK | `packages/client` is not in the image. See below. |

**The client is not served by the API, deliberately.** It builds to a static
bundle for a CDN and the same bundle is copied into the Android app by
`cap sync`. The Android build talks to the API **cross-origin**, from
`capacitor://localhost` — that is what the entire CORS configuration in
`packages/server/src/config.ts` exists for. Serving the bundle from Fastify
would put a second, contradictory story next to it. Build the client with
`VITE_API_URL` pointing at the real host.

The compute host is still an open decision in `ROADMAP.md`. The image is
host-agnostic and wants nothing but environment variables and a port.

## Environment

The third column is the one worth reading. Three of these are **fatal** in
production, on purpose — see `assertProductionSafe` in `config.ts`. A
misconfigured server that starts is worse than one that does not: it takes
traffic, writes state, and tells nobody.

| Variable | Required | If absent |
| --- | --- | --- |
| `DATABASE_URL` | **yes** | **Refuses to boot.** Without it the server would run on the in-memory adapter and discard every account on restart. |
| `TOKEN_SECRET` | **yes**, ≥32 chars | **Refuses to boot.** It signs every device token; short means forgeable. |
| `CORS_ORIGINS` | **yes** | **Refuses to boot** if it resolves to nothing. An empty list rejects every browser and every Capacitor build at the preflight, which looks like a client bug from every angle except this one. |
| `PORT` | no | 8787. |
| `HOST` | no | `0.0.0.0`. |
| `NODE_ENV` | **yes** — `production` | Without it none of the guards above apply and the dev routes become reachable. |
| `AUTO_MIGRATE` | no | Off in production. Leave it off; see below. |
| `RUN_HEARTBEAT` | no | On. Turn **off** on every instance but one. |
| `RUN_SWEEP` | no | On. Turn off with the heartbeat; note that idempotency keys are pruned on this timer. |
| `LOG_LEVEL` | no | `info`. |
| `FCM_SERVICE_ACCOUNT` / `_FILE` | no | Push is silently a no-op. Supported state, not a broken one. |
| `DEV_TOOLS` | never | Ignored in production regardless of value. The routes do not exist. |

## Build and run

Both paths are smoke-tested and both are supported.

**Container**

```bash
docker build -t deepholdings .
docker run --rm -e DATABASE_URL -e TOKEN_SECRET -e CORS_ORIGINS \
  deepholdings node packages/server/dist/migrate.js     # release step
docker run -d -p 8787:8787 \
  -e NODE_ENV=production -e DATABASE_URL -e TOKEN_SECRET -e CORS_ORIGINS \
  deepholdings
```

**Without a container**

```bash
npm ci
npm run build
node packages/server/dist/migrate.js
npm start -w @deepholdings/server
```

Then, either way:

```bash
BASE_URL=https://your-host bash scripts/smoke.sh
```

`scripts/smoke.sh` is deliberately the same script CI runs. A check that only
exists in a workflow file is a check nobody can run when they need it, which is
during an incident on a machine that is not a runner.

## Migrations are a release step

Run `node packages/server/dist/migrate.js` **before** the new image takes
traffic. Production boots with `autoMigrate: false`, and
`PostgresRepository.init` refuses to start against a schema it does not
recognise, naming the pending files. That refusal is the feature: a schema
change should be a thing someone did, not a side effect of a restart.

Leave `AUTO_MIGRATE` alone. If your host only gives you a start command and you
must turn it on, know that you have traded the guard for convenience and that a
rollback to an older image will then be running against a newer schema.

## Health, readiness, and alerting

Two probes, two audiences. Wiring them to the same endpoint loses the
distinction that makes them useful.

| Probe | Point it at | Why |
| --- | --- | --- |
| **Restart / liveness** | `GET /health` | No I/O. A restart probe that needs the database will restart-loop a healthy process whose database is briefly away. |
| **Routing / readiness** | `GET /ready` | Checks storage. 503 means "do not send requests here". |

`/ready` also reports the world clock:

```json
{"ok":true,"database":"up",
 "world":{"beat":41,"nextBeatAt":"…","overdueSeconds":0,"aheadSeconds":0,"stale":false}}
```

**Alarm on `/ready` returning non-200, and separately on `world.stale` being
true.** That second alarm is the one this project learned the hard way: the
world once froze for seventeen days — market demand and the guild bar stuck,
the Ledger countdown reading `25675:52` — because a beat had been scheduled into
the future and nothing ever said so. `beatOnce` now self-heals it, and `stale`
is how you find out it happened.

**A stale beat is not a 503, and that is deliberate.** Resolution is lazy and
per-player, so a frozen shared clock does not stop an instance serving requests.
Failing readiness on it would pull the entire fleet out of rotation because a
background job stopped — turning a degraded shared clock into a total outage.

## Run one instance

The heartbeat and the sweep are safe to run twice: `beatOnce` takes a row lock
and only advances a beat that is due, and push sends deduplicate on a primary
key. **The rate limiter is what is not.** It is in-process, so N instances give
N times the intended limit — this is written down in `rateLimit.ts` and repeated
here because this is where the person scaling will be looking.

If you do run more than one, set `RUN_HEARTBEAT=false` and `RUN_SWEEP=false` on
all but one, and move the limiter to the edge before you rely on it.

## Backups

Supabase takes its own, and offers point-in-time recovery on a paid plan. Use
it. What is here is the copy that survives losing the **account** — a billing
lapse, a deleted project, a compromised login — because every platform backup
lives inside the thing that would be gone.

```bash
DATABASE_URL=postgres://… bash scripts/backup.sh backups/$(date +%F).dump
bash scripts/restore-drill.sh backups/$(date +%F).dump
```

The drill restores into a throwaway database and then proves the restore is
*usable* rather than merely present: it runs the migrator against it (so a dump
whose schema predates the code is caught now rather than during the incident)
and asserts the tables are not empty.

**Run the drill and write the date in `ROADMAP.md`.** "We have backups" and "we
have restored one" are different claims and only the second is worth anything.

One thing to expect after a restore: `world.nextBeatAt` will be old, so `/ready`
reports `stale: true` until the first heartbeat catches up. Knowing that in
advance is the difference between a calm restore and a second incident.

`pg_dump` cannot use Supabase's transaction pooler on port 6543 — it needs a
stable snapshot and prepared statements. `scripts/backup.sh` refuses that URL
with a pointer rather than failing obscurely.

## Rollback

1. Redeploy the previous image.
2. **Do not roll the schema back.** Migrations here are additive; the previous
   server ignores columns it does not know about. Reversing a migration is a
   restore, not a deploy, and belongs in the backups procedure above.
3. If the previous server refuses to boot naming pending migrations, you have
   rolled back past a schema change. Go forward instead, or restore.

## First deploy

- [ ] `DATABASE_URL` points at the **direct** Postgres connection.
- [ ] `TOKEN_SECRET` is 32+ characters and generated, not typed.
- [ ] `CORS_ORIGINS` includes `capacitor://localhost` and the client's real
      origin. Getting this wrong makes the app look broken, not the server.
- [ ] `NODE_ENV=production`.
- [ ] Migrations run.
- [ ] `scripts/smoke.sh` passes against the real host.
- [ ] Liveness probe on `/health`, readiness on `/ready`, alarm on both.
- [ ] One instance owns the heartbeat.
- [ ] A backup taken and a restore drill run, with the date recorded.
