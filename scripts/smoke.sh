#!/usr/bin/env bash
#
# Is a running server actually serving?
#
# One script for both CI and a laptop, because a check that only exists in a
# workflow file is a check nobody can run when they need it — which is during an
# incident, on a machine that is not a runner.
#
# It asserts the things that are cheap to get wrong in a deploy and expensive to
# discover later: that the process answers, that it can reach its database, that
# the shared world clock is sane, and that the developer time-travel routes are
# genuinely absent rather than merely refusing.
#
#   BASE_URL=http://localhost:8787 bash scripts/smoke.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8787}"
fail() { echo "smoke: $*" >&2; exit 1; }

echo "smoke: ${BASE_URL}"

# --- liveness -----------------------------------------------------------------
health="$(curl -fsS "${BASE_URL}/health")" || fail "/health did not answer"
[[ "${health}" == '{"ok":true}' ]] || fail "/health said: ${health}"
echo "  health   ok"

# --- readiness ----------------------------------------------------------------
ready="$(curl -fsS "${BASE_URL}/ready")" || fail "/ready did not answer 2xx"
grep -q '"database":"up"' <<<"${ready}" || fail "/ready says the database is down: ${ready}"
# A stale beat is reported rather than fataled — see packages/server/src/health.ts
# for why it is not a 503 — but on a freshly booted server it should be false,
# and if it is not, something is wrong with the clock rather than with the probe.
grep -q '"stale":false' <<<"${ready}" || fail "the world clock is stale: ${ready}"
echo "  ready    ok"

# --- the dev routes must not exist --------------------------------------------
#
# Not "must refuse" — must be *absent*. `app.ts` registers them conditionally, so
# a 404 proves the production branch was taken. A 403 would mean the route
# existed and something else stopped it, which is a much weaker guarantee for an
# endpoint that rewrites a player's career.
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE_URL}/v1/dev/advance")"
[[ "${code}" == "404" ]] || fail "/v1/dev/advance answered ${code}; it should not exist"
echo "  dev off  ok"

# --- the front door -----------------------------------------------------------
# Hitting the API in a browser is a normal thing to do while setting a device up;
# a bare 404 there gives nobody a clue the server is fine.
curl -fsS "${BASE_URL}/" | grep -q 'Subterranean Resource Authority' || fail "/ is not the notice"
echo "  notice   ok"

echo "smoke: all checks passed"
