#!/usr/bin/env bash
# Starts the image against PostgreSQL, RabbitMQ and the e2e OIDC stub, and waits
# for it to report ready: migrated, connected, its consumers and jobs started.
#
#   apps/backend/docker/smoke-test.sh twake-tasks-backend:dev
set -euo pipefail

IMAGE="${1:?usage: $0 <image>}"
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

docker run -d --name "$RUN-backend" --network "$RUN" \
  -p 127.0.0.1::8080 \
  -v "$CERTS:/certs:ro" \
  -e NODE_EXTRA_CA_CERTS=/certs/oidc.crt \
  -e RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672 \
  -e DATABASE_URL=postgres://twake_tasks:twake_tasks@postgres:5432/twake_tasks \
  -e DATABASE_MIGRATION_URL=postgres://twake_tasks_owner:twake_tasks_owner@postgres:5432/twake_tasks \
  -e APP_URL=http://localhost:3000 \
  -e OIDC_ISSUER=https://oidc:8443 \
  -e OIDC_CLIENT_SECRET=e2e-backend-secret \
  -e SPACE_INTEGRATION=false \
  "$IMAGE" >/dev/null
BASE="http://$(docker port "$RUN-backend" 8080/tcp | head -1)"

for _ in $(seq 1 60); do
  status="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/health/ready" || true)"
  [[ "$status" == 200 ]] && break
  [[ "$(docker inspect -f '{{.State.Running}}' "$RUN-backend")" == true ]] || break
  sleep 1
done

if [[ "$status" != 200 ]]; then
  echo "FAIL /health/ready answered '$status' within 60 s; container logs:"
  docker logs "$RUN-backend" 2>&1 | tail -40
  exit 1
fi
echo "ok   /health/ready answers 200"
