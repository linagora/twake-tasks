#!/usr/bin/env bash
# Starts the image against PostgreSQL, RabbitMQ and the e2e OIDC stub, waits
# for it to report ready (migrated, connected, its consumers and jobs started),
# then signs in through the stub and reads a few routes.
#
# Given a previous release, the image only migrates and the release serves: a
# rolling update or a rollback runs it on the new schema.
#
#   apps/backend/docker/smoke-test.sh twake-tasks-backend:dev
#   apps/backend/docker/smoke-test.sh twake-tasks-backend:dev ghcr.io/linagora/twake-tasks-backend:0.2.20
set -euo pipefail

IMAGE="${1:?usage: $0 <image> [<previous release image>]}"
SERVE="${2:-$IMAGE}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
RUN="twake-tasks-backend-smoke-$$"
CERTS="$(mktemp -d)"
cleanup() {
  docker rm -f "$RUN-backend" "$RUN-oidc" "$RUN-rabbitmq" "$RUN-postgres" >/dev/null 2>&1 || true
  docker network rm "$RUN" >/dev/null 2>&1 || true
  rm -rf "$CERTS"
}
trap cleanup EXIT

openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=oidc \
  -addext 'subjectAltName=DNS:oidc,DNS:localhost' -addext 'basicConstraints=critical,CA:TRUE' \
  -keyout "$CERTS/oidc.key" -out "$CERTS/oidc.crt" 2>/dev/null
# The backend runs as uid 1000.
chmod 755 "$CERTS"
chmod 644 "$CERTS/oidc.crt"

docker network create "$RUN" >/dev/null
docker run -d --name "$RUN-postgres" --network "$RUN" --network-alias postgres \
  -e POSTGRES_PASSWORD=postgres \
  -v "$ROOT/postgres-init.sql:/docker-entrypoint-initdb.d/init.sql:ro" \
  postgres:18 >/dev/null
docker run -d --name "$RUN-rabbitmq" --network "$RUN" --network-alias rabbitmq \
  rabbitmq:4.1-management >/dev/null
docker run -d --name "$RUN-oidc" --network "$RUN" --network-alias oidc \
  -v "$ROOT/e2e/oidc:/oidc:ro" -v "$CERTS:/certs:ro" -w /oidc \
  -e NODE_EXTRA_CA_CERTS=/certs/oidc.crt \
  node:24-slim node server.ts >/dev/null

# The backend exits when a dependency refuses its first connection.
waitFor() {
  local what=$1
  shift
  for _ in $(seq 1 60); do
    "$@" >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "FAIL $what did not start"
  return 1
}
# Over TCP: during its init the server listens on the socket only.
waitFor postgres docker exec "$RUN-postgres" pg_isready -h 127.0.0.1 -U postgres -d twake_tasks
waitFor rabbitmq docker exec "$RUN-rabbitmq" rabbitmq-diagnostics -q check_port_connectivity
waitFor oidc docker exec "$RUN-oidc" node -e \
  "fetch('https://localhost:8443/.well-known/openid-configuration').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

backend=(
  --network "$RUN"
  -v "$CERTS:/certs:ro"
  -e NODE_EXTRA_CA_CERTS=/certs/oidc.crt
  -e RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
  -e DATABASE_URL=postgres://twake_tasks:twake_tasks@postgres:5432/twake_tasks
  -e DATABASE_MIGRATION_URL=postgres://twake_tasks_owner:twake_tasks_owner@postgres:5432/twake_tasks
  -e APP_URL=http://localhost:3000
  -e OIDC_ISSUER=https://oidc:8443
  -e OIDC_CLIENT_SECRET=e2e-backend-secret
  -e SPACE_INTEGRATION=false
)
if [[ "$SERVE" != "$IMAGE" ]]; then
  docker run --rm "${backend[@]}" "$IMAGE" node dist/migrate.js
  echo "ok   $IMAGE migrated the database"
  if docker run --rm "$SERVE" test -f dist/migrate.js; then
    backend+=(-e MIGRATE_ON_START=false)
  else
    # A release older than the migrate command migrates at start, so it was
    # deployed as the owner.
    backend+=(-e DATABASE_URL=postgres://twake_tasks_owner:twake_tasks_owner@postgres:5432/twake_tasks)
  fi
fi
docker run -d --name "$RUN-backend" -p 127.0.0.1::8080 "${backend[@]}" "$SERVE" >/dev/null
BASE="http://$(docker port "$RUN-backend" 8080/tcp | head -1)"

fail() {
  echo "FAIL $1; container logs:"
  docker logs "$RUN-backend" 2>&1 | tail -40
  exit 1
}

for _ in $(seq 1 60); do
  status="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/health/ready" || true)"
  [[ "$status" == 200 ]] && break
  [[ "$(docker inspect -f '{{.State.Running}}' "$RUN-backend")" == true ]] || break
  sleep 1
done
[[ "$status" == 200 ]] || fail "/health/ready answered '$status' within 60 s"
echo "ok   $SERVE: /health/ready answers 200"

# The authorization code flow of the frontend, as alice.
TOKEN="$(docker exec "$RUN-oidc" node --input-type=module -e "
import { createHash, randomBytes } from 'node:crypto'
const sso = 'https://localhost:8443'
const redirect_uri = 'http://localhost:3000/auth/callback'
const code_verifier = randomBytes(32).toString('base64url')
const authorize = new URLSearchParams({
  username: 'alice',
  client_id: 'twaketasks',
  redirect_uri,
  code_challenge: createHash('sha256').update(code_verifier).digest('base64url'),
  code_challenge_method: 'S256'
})
const page = await (await fetch(sso + '/authorize?' + authorize)).text()
const code = /[?&]code=([^&\"]+)/.exec(page)[1]
const token = await fetch(sso + '/token', {
  method: 'POST',
  body: new URLSearchParams({ grant_type: 'authorization_code', client_id: 'twaketasks', code, redirect_uri, code_verifier })
})
console.log((await token.json()).access_token)
")"

for path in /api/projects /api/boards /api/my-tasks /api/notifications /api/labels /api/filters; do
  status="$(curl -s -o /dev/null -w '%{http_code}' -H "authorization: Bearer $TOKEN" "$BASE$path" || true)"
  [[ "$status" == 200 ]] || fail "GET $path answered '$status'"
  echo "ok   GET $path answers 200"
done
