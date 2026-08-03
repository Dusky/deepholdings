#!/usr/bin/env bash
#
# An off-platform copy of the database.
#
# Supabase takes its own backups and, on a paid plan, offers point-in-time
# recovery. This is not a replacement for that and does not try to be. It exists
# because every one of those copies lives inside the account that would be gone
# in the failure worth planning for — a billing lapse, a deleted project, a
# compromised login — and a backup you cannot reach is not a backup.
#
#   DATABASE_URL=postgres://... bash scripts/backup.sh backups/2026-08-03.dump
#
# Restore and prove it with scripts/restore-drill.sh.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
OUT="${1:?usage: backup.sh <output-file>}"

# One hour that a comment can save.
#
# Supabase's pooler in transaction mode (port 6543) cannot serve `pg_dump`: it
# multiplexes statements across connections, and a dump needs a stable snapshot
# and prepared statements. This is the same constraint the ROADMAP already
# records for the adapter's connection string. Use the *direct* connection.
if [[ "${DATABASE_URL}" == *":6543"* ]]; then
  echo "backup: DATABASE_URL points at the transaction pooler (:6543)." >&2
  echo "        pg_dump needs the direct connection — see docs/ops/backups.md." >&2
  exit 1
fi

mkdir -p "$(dirname "${OUT}")"

# Custom format: compressed, and restorable selectively with pg_restore. Plain
# SQL would be readable but cannot be restored table-by-table, which is what you
# want at 3am when one table is the problem.
#
# --no-owner/--no-privileges because the restore target is rarely owned by the
# same role, and a dump that refuses to restore over an ownership mismatch is a
# dump that fails at exactly the wrong moment.
pg_dump "${DATABASE_URL}" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="${OUT}"

printf 'backup: wrote %s (%s)\n' "${OUT}" "$(du -h "${OUT}" | cut -f1)"
