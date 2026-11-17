# Shared by build.sh, start.sh, stop.sh and the control scripts of the chaos stack of Twake Tasks. Not run on its own.
CHAOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# the checkout under test: the one this folder is in (CHAOS_REPO_DIR: another, e.g. the worktree of twake-chaos)
REPO_DIR="${CHAOS_REPO_DIR:-$(cd "$CHAOS_DIR/../.." && pwd)}"
export CHAOS_REPO_DIR="$REPO_DIR"
export CHAOS_PROJECT="${CHAOS_PROJECT:-ttasks-chaos}"
export CHAOS_APP_PORT="${CHAOS_APP_PORT:-19740}"      # the frontend (nginx: the web app, /api proxied to the backend)
export CHAOS_API_PORT="${CHAOS_API_PORT:-19741}"      # the backend itself (/health/ready, /metrics: nginx proxies /api only)
export CHAOS_SPACE_PORT="${CHAOS_SPACE_PORT:-19742}"  # the Twake Space stand-in
export CHAOS_SSO_PORT="${CHAOS_SSO_PORT:-19743}"      # the mock SSO (https, self-signed)
export CHAOS_MAIL_PORT="${CHAOS_MAIL_PORT:-19744}"    # Mailpit's web UI and API
# the certificate of the mock SSO and the seeded spaces, between start and stop
export CHAOS_RUN="${CHAOS_RUN:-${XDG_CACHE_HOME:-$HOME/.cache}/twake-chaos/$CHAOS_PROJECT}"
BUILT_BACKEND_IMAGE="$CHAOS_PROJECT-backend:latest"
BUILT_FRONTEND_IMAGE="$CHAOS_PROJECT-frontend:latest"
export BACKEND_IMAGE="${BACKEND_IMAGE:-$BUILT_BACKEND_IMAGE}"
export FRONTEND_IMAGE="${FRONTEND_IMAGE:-$BUILT_FRONTEND_IMAGE}"
# PostgreSQL 18 (the version of the repository's docker-compose.yml) with Patroni and etcd (conf/postgres/Dockerfile)
export POSTGRES_IMAGE="${POSTGRES_IMAGE:-$CHAOS_PROJECT-postgres:latest}"
# The accounts of the mock SSO (e2e/oidc/server.ts, EXTRA_PEOPLE as the QA environment's QA_USERS): signed in by a
# button, no password. alice administers acme.e2e.test, erin is of globex.e2e.test, frank of none (B2C).
export CHAOS_ORG=acme.e2e.test
export CHAOS_USERS="carol dave erin@globex.e2e.test frank@"
export CHAOS_USER=alice CHAOS_USER2=bob
# the browser's client of the mock (public, PKCE), its redirect URI as the frontend sends it
export CHAOS_OIDC_CLIENT=twaketasks
export CHAOS_REDIRECT_URI="http://localhost:$CHAOS_APP_PORT/auth/callback"
# PostgreSQL: the roles of postgres-init.sql (the backend serves as twake_tasks, migrates as twake_tasks_owner)
export CHAOS_PG_NODES="pg1 pg2 pg3"
export CHAOS_PG_SUPERUSER_PASSWORD=chaos-postgres CHAOS_PG_REPLICATION_PASSWORD=chaos-replication
RABBITMQ_NODES="rabbitmq1 rabbitmq2 rabbitmq3"

compose() {
  docker compose -p "$CHAOS_PROJECT" -f "$CHAOS_DIR/compose.yaml" "$@"
}

# An access token of <uid> (alice, bob, carol...), signed in through the mock SSO as the web app does it, headless: the
# authorization code flow with PKCE of the browser's client (the "Sign in as <uid>" button is GET /authorize?username=),
# the code read from the portal's redirect page, exchanged at /token. The backend checks it by introspection.
sso_token() {  # sso_token <uid>
  local sso="https://127.0.0.1:$CHAOS_SSO_PORT" verifier challenge page code
  verifier="$(openssl rand -hex 32)"
  challenge="$(printf '%s' "$verifier" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')"
  page="$(curl -sk --max-time 10 --get "$sso/authorize" --data-urlencode "username=$1" \
    --data-urlencode "client_id=$CHAOS_OIDC_CLIENT" --data-urlencode "redirect_uri=$CHAOS_REDIRECT_URI" \
    --data-urlencode 'scope=openid email profile' --data-urlencode "code_challenge=$challenge" \
    --data-urlencode code_challenge_method=S256 --data-urlencode state=chaos)" || return 1
  code="$(printf '%s' "$page" | sed -n 's/.*[?&]code=\([A-Za-z0-9_-]*\).*/\1/p')"
  [ -n "$code" ] || return 1
  curl -sk --max-time 10 "$sso/token" -d grant_type=authorization_code --data-urlencode "code=$code" \
    --data-urlencode "redirect_uri=$CHAOS_REDIRECT_URI" --data-urlencode "code_verifier=$verifier" \
    --data-urlencode "client_id=$CHAOS_OIDC_CLIENT" |
    python3 -c 'import json,sys; t=json.load(sys.stdin).get("access_token"); print(t) if t else sys.exit(1)'
}

# health of a service's container: healthy, starting, unhealthy, running (no healthcheck), exited...
service_state() {
  local id
  id="$(compose ps -aq "$1" 2>/dev/null | head -1)"
  [ -n "$id" ] || { echo missing; return; }
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo missing
}

wait_healthy() {  # wait_healthy <seconds> <service>...
  local timeout="$1"; shift
  local deadline=$((SECONDS + timeout)) s
  for s in "$@"; do
    until [ "$(service_state "$s")" = healthy ]; do
      if [ $SECONDS -ge $deadline ]; then
        echo "$s is not healthy after ${timeout}s ($(service_state "$s"))" >&2
        compose logs --tail 80 "$s" >&2
        return 1
      fi
      sleep 3
    done
  done
}

# The Patroni cluster as each node's REST API sees it (patronictl: members, roles, states, lag), from the first node
# that answers. A paused node does not answer: the others are asked.
pg_members() {
  local n out
  for n in $CHAOS_PG_NODES; do
    out="$(timeout 10 docker compose -p "$CHAOS_PROJECT" -f "$CHAOS_DIR/compose.yaml" exec -T "$n" \
      curl -sf --max-time 5 http://localhost:8008/cluster 2>/dev/null)" && [ -n "$out" ] && { echo "$out"; return 0; }
  done
  return 1
}

# The PostgreSQL cluster whole: 3 members, one leader (running), 2 replicas streaming from it with no lag, both in its
# synchronous quorum (quorum mode: `quorum_standby`), the 3 etcd members healthy, and the load balancer sending the
# sessions to that leader alone. After a failover the leader is another node: that is whole too (no switch back,
# nothing the application needs).
pg_healthy() {
  [ "$(lb_up postgres)" = "$(pg_leader 2>/dev/null)" ] || return 1
  pg_members | python3 -c '
import json, sys
m = json.load(sys.stdin)["members"]
leaders = [x for x in m if x["role"] == "leader" and x["state"] == "running"]
replicas = [x for x in m if x["role"] in ("quorum_standby", "sync_standby") and x["state"] == "streaming" and x.get("lag", 1) == 0]
sys.exit(not (len(m) == 3 and len(leaders) == 1 and len(replicas) == 2))' || return 1
  local n
  for n in $CHAOS_PG_NODES; do
    timeout 10 docker compose -p "$CHAOS_PROJECT" -f "$CHAOS_DIR/compose.yaml" exec -T "$n" \
      etcdctl --endpoints=http://localhost:2379 endpoint health >/dev/null 2>&1 || return 1
  done
}

pg_leader() {  # the node that is the primary now
  pg_members | python3 -c 'import json,sys; print(next(x["name"] for x in json.load(sys.stdin)["members"] if x["role"] == "leader"))'
}

# The nodes the load balancer (the service lb) sends new connections to, for its proxy `postgres` (the primary) or
# `rabbitmq_nodes` (its stats, CSV, read inside the network: the haproxy image has bash but no HTTP client)
lb_up() {  # lb_up <proxy>
  compose exec -T lb bash -c 'exec 3<>/dev/tcp/127.0.0.1/8404 && printf "GET /stats;csv HTTP/1.0\r\n\r\n" >&3 && cat <&3' 2>/dev/null |
    awk -F, -v p="$1" '$1 == p && $2 != "FRONTEND" && $2 != "BACKEND" && $18 == "UP" {print $2}'
}
rabbitmq_lb_up() { lb_up rabbitmq_nodes; }

# The RabbitMQ cluster whole: the 3 nodes running, no partition, every quorum queue with its 3 members online, the 3
# nodes back in the load balancer's rotation
rabbitmq_healthy() {
  [ "$(rabbitmq_lb_up | wc -l)" = 3 ] || return 1
  compose exec -T rabbitmq1 rabbitmqctl -q cluster_status --formatter json 2>/dev/null | python3 -c '
import json, sys
s = json.load(sys.stdin)
sys.exit(not (len(s["running_nodes"]) == 3 and not s.get("partitions")))' || return 1
  compose exec -T rabbitmq1 rabbitmqctl -q list_queues name type members online --formatter json 2>/dev/null | python3 -c '
import json, sys
q = [x for x in json.load(sys.stdin) if x["type"] == "quorum"]
sys.exit(not all(len(x["online"]) == 3 for x in q))'
}
