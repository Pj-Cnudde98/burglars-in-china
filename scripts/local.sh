#!/usr/bin/env bash
# Runs the whole backend on this computer in Docker, through the Supabase CLI:
# Postgres, login, live updates, file storage, the edge functions and Studio.
# The hosted project is never touched.
#
#   scripts/local.sh up       start everything and write the app's local settings
#   scripts/local.sh down     stop the containers (the data is kept)
#   scripts/local.sh reset    wipe the database, then run all migrations and seeds again
#   scripts/local.sh dev      run the app against the local backend, with hot reload
#   scripts/local.sh preview  build the app and serve it, with service worker (push, offline)
#   scripts/local.sh status   show addresses and keys
#   scripts/local.sh logs     follow the edge functions' output
set -euo pipefail
cd "$(dirname "$0")/.."

APP_ENV=.env.docker.local          # read by `vite --mode docker`; ignored by git
FUNCTIONS_ENV=supabase/functions/.env   # secrets for the edge functions; ignored by git
WEBHOOK_SECRET=local-webhook-secret     # must match supabase/seed.local.sql
# Not Vite's usual ports, so this can never be mistaken for (or collide with) `npm run dev`,
# which talks to the hosted project.
DEV_PORT=5180
PREVIEW_PORT=4180
PROJECT=$(grep -E '^project_id' supabase/config.toml | cut -d'"' -f2)

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1. $2" >&2; exit 1; }
}

check_tools() {
  need supabase "Install the Supabase CLI: https://supabase.com/docs/guides/cli"
  need docker "Install Docker Desktop: https://www.docker.com/products/docker-desktop"
  docker info >/dev/null 2>&1 || { echo "Docker is installed but not running. Start Docker Desktop and try again." >&2; exit 1; }
}

# Push notifications need a key pair. One is made the first time and then reused,
# so phones that subscribed keep working across restarts.
write_functions_env() {
  [ -f "$FUNCTIONS_ENV" ] && return
  echo "Creating $FUNCTIONS_ENV with a new local VAPID key pair"
  local keys public private
  keys=$(npx --yes web-push@3.6.7 generate-vapid-keys --json)
  public=$(node -e 'console.log(JSON.parse(process.argv[1]).publicKey)' "$keys")
  private=$(node -e 'console.log(JSON.parse(process.argv[1]).privateKey)' "$keys")
  cat > "$FUNCTIONS_ENV" <<EOF
# Local development only. Made by scripts/local.sh; safe to delete (a new one is made).
VAPID_PUBLIC_KEY=$public
VAPID_PRIVATE_KEY=$private
VAPID_SUBJECT=mailto:local@example.com
WEBHOOK_SECRET=$WEBHOOK_SECRET
EOF
}

# The CLI gives up on slower computers before the containers have finished
# starting, and then stops them all. So it is told not to check, and this waits
# for Docker's own health checks instead.
wait_until_healthy() {
  local waiting
  printf 'Waiting for the services to be ready'
  for _ in $(seq 1 90); do
    waiting=$(docker ps -a --filter "name=supabase_.*_$PROJECT" --format '{{.Names}} {{.Status}}' | grep -v -E '\(healthy\)|^[^ ]+ Up [^(]*$' || true)
    [ -z "$waiting" ] && { echo ' done'; return; }
    printf '.'; sleep 2
  done
  printf '\nThese did not become ready:\n%s\nLook at them with: docker logs <name>\n' "$waiting" >&2
  exit 1
}

# The app's settings for the local stack, taken from the running stack itself.
write_app_env() {
  local public
  public=$(grep '^VAPID_PUBLIC_KEY=' "$FUNCTIONS_ENV" | cut -d= -f2-)
  {
    echo "# Local Supabase stack. Written by scripts/local.sh on every start; do not edit."
    supabase status -o env \
      --override-name api.url=VITE_SUPABASE_URL \
      --override-name auth.anon_key=VITE_SUPABASE_ANON_KEY 2>/dev/null \
      | grep -E '^VITE_SUPABASE_(URL|ANON_KEY)=' | tr -d '"'
    echo "VITE_VAPID_PUBLIC_KEY=$public"
  } > "$APP_ENV"
  grep -q '^VITE_SUPABASE_URL=' "$APP_ENV" && grep -q '^VITE_SUPABASE_ANON_KEY=' "$APP_ENV" \
    || { echo "Could not read the local address and key from 'supabase status'." >&2; exit 1; }
}

# Without the local settings file Vite would fall back to .env, which points at the hosted project.
require_app_env() {
  [ -f "$APP_ENV" ] || { echo "No $APP_ENV yet. Start the local backend first: npm run local:up" >&2; exit 1; }
}

case "${1:-}" in
  up)
    check_tools
    write_functions_env
    supabase start --ignore-health-check >/dev/null
    wait_until_healthy
    write_app_env
    cat <<EOF

Local backend is running.

  App         npm run dev:local        then open http://localhost:$DEV_PORT
  Trip code   the one in supabase/seed.sql (code and admin PIN are on the "insert into trips" line)
  Studio      http://127.0.0.1:54323   browse tables, files and logs
  Functions   npm run local:logs       see what notify and tick are doing

Notifications and offline mode need the built app:  npm run preview:local  (http://localhost:$PREVIEW_PORT)
EOF
    ;;
  dev)
    require_app_env
    exec npx vite --mode docker --port "$DEV_PORT" --strictPort
    ;;
  preview)
    require_app_env
    npx tsc -b
    npx vite build --mode docker --outDir dist-local
    exec npx vite preview --outDir dist-local --port "$PREVIEW_PORT" --strictPort
    ;;
  down)
    supabase stop
    ;;
  reset)
    check_tools
    supabase db reset
    ;;
  status)
    supabase status
    ;;
  logs)
    docker logs -f "supabase_edge_runtime_$PROJECT"
    ;;
  *)
    sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
