#!/usr/bin/env bash
#
# Restore a dump into a throwaway database and prove it is usable.
#
# "We have backups" and "we have restored one" are different claims, and only
# the second is worth anything. ROADMAP M1 asks for backups; this is the half
# that makes the tick honest, and the date it was last run belongs next to that
# tick.
#
# Proving *usable* rather than merely *present* is the point. A dump that
# restores but whose schema predates the running code is a dump that will fail
# during the incident, not before it — so this checks the migration state too.
#
#   bash scripts/restore-drill.sh backups/2026-08-03.dump
set -euo pipefail

DUMP="${1:?usage: restore-drill.sh <dump-file>}"
[[ -f "${DUMP}" ]] || { echo "drill: no such dump: ${DUMP}" >&2; exit 1; }

# A throwaway name per run, the same pattern the migration tests use, so a drill
# can never touch anything that matters and two drills cannot collide.
TARGET="dh_drill_$(date +%s)"
ADMIN_URL="${ADMIN_DATABASE_URL:-postgres://postgres:postgres@127.0.0.1:5432/postgres}"
RESTORE_URL="${ADMIN_URL%/*}/${TARGET}"

cleanup() {
  psql "${ADMIN_URL}" -q -c "DROP DATABASE IF EXISTS ${TARGET} WITH (FORCE)" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "drill: restoring ${DUMP} into ${TARGET}"
psql "${ADMIN_URL}" -q -c "CREATE DATABASE ${TARGET}"
pg_restore --dbname="${RESTORE_URL}" --no-owner --no-privileges "${DUMP}"

# 1. Is the schema the one the running code expects? A restore that leaves the
#    database behind the code fails on boot — which is the designed behaviour
#    (init refuses and names the pending files), and much better discovered here.
echo "drill: checking the schema against the code"
DATABASE_URL="${RESTORE_URL}" npm run migrate -w @deepholdings/server

# 2. Is there anything in it? A structurally perfect restore of an empty dump
#    passes every check that only looks at the schema.
echo "drill: checking the data came with it"
for table in accounts characters journal world; do
  count="$(psql "${RESTORE_URL}" -tAc "SELECT count(*) FROM ${table}")"
  printf '  %-12s %s\n' "${table}" "${count}"
  [[ "${count}" -gt 0 ]] || { echo "drill: ${table} is empty" >&2; exit 1; }
done

echo "drill: restore verified. Record the date in ROADMAP.md."
