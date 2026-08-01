#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

usage() {
  echo "Usage: $0 [server|client|all]"
  echo ""
  echo "  server   PostgreSQL + migration + API server (port 8787)"
  echo "  client   Vite dev server (port 5173)"
  echo "  all      Both (default)"
  exit 1
}

MODE="${1:-all}"
case "$MODE" in
  server|client|all) ;;
  -h|--help) usage ;;
  *) usage ;;
esac

# ---- Shared package (needed by both) -------------------------------------

build_shared() {
  echo "Building shared package..."
  npm run build --workspace @deepholdings/shared --silent
}

# ---- PostgreSQL (server only) --------------------------------------------

PG_CONTAINER="deepholdings-pg"
ensure_postgres() {
  if ! docker ps --format '{{.Names}}' | grep -qxF "$PG_CONTAINER"; then
    if docker ps -a --format '{{.Names}}' | grep -qxF "$PG_CONTAINER"; then
      echo "Starting existing PostgreSQL container ($PG_CONTAINER)..."
      docker start "$PG_CONTAINER" >/dev/null
    else
      echo "Creating PostgreSQL container ($PG_CONTAINER)..."
      docker run -d --name "$PG_CONTAINER" \
        -e POSTGRES_USER=postgres \
        -e POSTGRES_PASSWORD=postgres \
        -e POSTGRES_DB=deepholdings \
        -p 127.0.0.1:5432:5432 \
        -v deepholdings-pgdata:/var/lib/postgresql/data \
        postgres:16 >/dev/null
    fi
  fi
  until docker exec "$PG_CONTAINER" pg_isready -U postgres -q 2>/dev/null; do
    sleep 0.3
  done
  echo "PostgreSQL is ready."
}

# ---- Env -----------------------------------------------------------------

setup_env() {
  export DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/deepholdings}"
  export FCM_SERVICE_ACCOUNT_FILE="${FCM_SERVICE_ACCOUNT_FILE:-$HOME/.config/deepholdings/fcm.json}"
  export TOKEN_SECRET="${TOKEN_SECRET:-dev-secret-change-me}"
}

# ---- Server --------------------------------------------------------------

run_server() {
  setup_env
  echo "Running migrations..."
  npm run migrate --workspace @deepholdings/server --silent

  echo ""
  echo "  DATABASE_URL             = ${DATABASE_URL}"
  echo "  FCM_SERVICE_ACCOUNT_FILE = ${FCM_SERVICE_ACCOUNT_FILE}"
  echo "  TOKEN_SECRET             = ${TOKEN_SECRET}"
  echo "  Server port              = ${PORT:-8787}"
  echo ""

  exec npm run dev:server
}

# ---- Client --------------------------------------------------------------

run_client() {
  echo ""
  echo "  Vite dev server at http://localhost:5173"
  echo ""
  exec npm run dev
}

# ---- Main ----------------------------------------------------------------

build_shared

case "$MODE" in
  server)
    ensure_postgres
    run_server
    ;;
  client)
    run_client
    ;;
  all)
    ensure_postgres
    setup_env
    echo "Running migrations..."
    npm run migrate --workspace @deepholdings/server --silent
    echo ""
    echo "  DATABASE_URL             = ${DATABASE_URL}"
    echo "  FCM_SERVICE_ACCOUNT_FILE = ${FCM_SERVICE_ACCOUNT_FILE}"
    echo "  TOKEN_SECRET             = ${TOKEN_SECRET}"
    echo "  Server port              = ${PORT:-8787}"
    echo "  Vite dev server at http://localhost:5173"
    echo ""

    # Start server in background, client in foreground.
    # Kill the server when the client exits.
    npm run dev:server &
    SERVER_PID=$!
    trap "kill $SERVER_PID 2>/dev/null" EXIT

    # Give the server a beat to bind before Vite takes the terminal.
    sleep 2
    npm run dev
    ;;
esac
