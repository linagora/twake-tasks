#!/bin/bash
#
# Starts the chaos stack of Twake Tasks: the backing services first (the etcd members and the Patroni cluster formed: a
# primary, 2 streaming replicas in its synchronous quorum; the RabbitMQ cluster of 3 behind its load balancer), then the
# backend (it migrates the database at start) and the frontend, healthy; seeds the Twake Space spaces as the QA
# environment does (a space created the way ldap-rest announces it, on RabbitMQ: the backend provisions its project);
# then checks that an account signs in through the SSO and reaches the API through the frontend (its boards: the
# seeded project). Writes $CHAOS_RUN/env: what the control scripts read.
#
set -euo pipefail
. "$(dirname "$0")/common.sh"

mkdir -p "$CHAOS_RUN/certs"
# the certificate of the mock SSO (https://oidc:8443), as scripts/qa-environment/start.sh makes it: the backend trusts it
if ! openssl x509 -checkend 86400 -noout -in "$CHAOS_RUN/certs/oidc.crt" >/dev/null 2>&1; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj /CN=oidc \
    -addext 'subjectAltName=DNS:oidc,DNS:localhost,IP:127.0.0.1' -addext 'basicConstraints=critical,CA:TRUE' \
    -keyout "$CHAOS_RUN/certs/oidc.key" -out "$CHAOS_RUN/certs/oidc.crt" 2>/dev/null
fi
chmod 644 "$CHAOS_RUN/certs/oidc.key" "$CHAOS_RUN/certs/oidc.crt"
[ -f "$CHAOS_RUN/space.json" ] || echo '[]' > "$CHAOS_RUN/space.json"

echo "==> The backing services, compose project '$CHAOS_PROJECT'"
compose up -d pg1 pg2 pg3 rabbitmq1 rabbitmq2 rabbitmq3 lb oidc mailpit twakespace
wait_healthy 600 pg1 pg2 pg3 rabbitmq1 rabbitmq2 rabbitmq3 oidc

echo "==> PostgreSQL: a primary, 2 replicas streaming in its synchronous quorum, 3 etcd members, the load balancer on the primary"
for i in $(seq 1 100); do
  pg_healthy && break
  [ "$i" = 100 ] && { echo "the PostgreSQL cluster is not whole" >&2; pg_members >&2 || true; compose logs --tail 40 pg1 pg2 pg3 >&2; exit 1; }
  sleep 3
done
leader="$(pg_leader)"
# the database of postgres-init.sql, on the primary; and a write seen on both replicas (replication, not just links up)
compose exec -T "$leader" psql -U postgres -d twake_tasks -tAc 'select 1' >/dev/null
marker="chaos-$(date +%s)"
compose exec -T "$leader" psql -U postgres -d postgres -qc "create table if not exists chaos_check (v text); insert into chaos_check values ('$marker')"
for n in $CHAOS_PG_NODES; do
  [ "$n" = "$leader" ] && continue
  for i in $(seq 1 20); do
    [ "$(compose exec -T "$n" psql -U postgres -d postgres -tAc "select count(*) from chaos_check where v = '$marker'" 2>/dev/null | tr -d '\r')" = 1 ] && break
    [ "$i" = 20 ] && { echo "the write on $leader did not reach $n" >&2; exit 1; }
    sleep 1
  done
done
echo "    primary $leader; $(compose exec -T "$leader" psql -U postgres -d postgres -tAc 'show synchronous_standby_names' | tr -d '\r')"

echo "==> RabbitMQ: the 3 nodes in the cluster, in the load balancer's rotation"
for i in $(seq 1 60); do
  n="$(compose exec -T rabbitmq1 rabbitmqctl -q cluster_status --formatter json 2>/dev/null | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["running_nodes"]))' 2>/dev/null || true)"
  up="$(rabbitmq_lb_up | wc -l)"
  [ "$n" = 3 ] && [ "$up" = 3 ] && break
  [ "$i" = 60 ] && { echo "RabbitMQ has ${n:-no} running node(s), $up in the load balancer" >&2; compose logs --tail 40 lb >&2; exit 1; }
  sleep 3
done

# what the control scripts read (written before the backend: a failed start can still be investigated with them)
write_env() {
  cat > "$CHAOS_RUN/env" <<EOF
export CHAOS_PROJECT=$CHAOS_PROJECT
export CHAOS_APP_URL=http://127.0.0.1:$CHAOS_APP_PORT CHAOS_APP_PORT=$CHAOS_APP_PORT
export CHAOS_API_URL=http://127.0.0.1:$CHAOS_API_PORT CHAOS_API_PORT=$CHAOS_API_PORT
export CHAOS_SSO_URL=https://127.0.0.1:$CHAOS_SSO_PORT CHAOS_SSO_PORT=$CHAOS_SSO_PORT
export CHAOS_SPACE_URL=http://127.0.0.1:$CHAOS_SPACE_PORT
export CHAOS_MAIL_URL=http://127.0.0.1:$CHAOS_MAIL_PORT
export CHAOS_OIDC_CLIENT=$CHAOS_OIDC_CLIENT CHAOS_REDIRECT_URI=$CHAOS_REDIRECT_URI
export CHAOS_ORG=$CHAOS_ORG CHAOS_USER=$CHAOS_USER CHAOS_USER2=$CHAOS_USER2 CHAOS_USERS="$CHAOS_USERS"
export CHAOS_PROJECT_LAUNCH=${launch:-} CHAOS_PROJECT_SUPPORT=${support:-}
EOF
}
write_env

echo "==> The backend ($BACKEND_IMAGE) and the frontend ($FRONTEND_IMAGE)"
compose up -d backend frontend
wait_healthy 300 backend frontend

echo "==> The Twake Space spaces, seeded as the QA environment does"
# The uuid the mock SSO gives a person (uuidOf in e2e/oidc/server.ts)
uuid_of() {
  case "$1" in
    alice) echo 0a11ce00-0000-4000-8000-000000000001 ;;
    bob) echo 0b0b0000-0000-4000-8000-000000000002 ;;
    *) local h; h="$(printf '%s' "$1" | sha256sum | cut -c1-32)"; echo "${h:0:8}-${h:8:4}-4${h:13:3}-8${h:17:3}-${h:20:12}" ;;
  esac
}
in_backend() { local script="$1"; shift; compose exec -T backend node --input-type=module -e "$script" "$@"; }
PUBLISH="$(cat <<'JS'
const { RabbitMQClient } = await import('@linagora/rabbitmq-client')
const [exchange, routingKey, messageId, body] = process.argv.slice(1)
const client = new RabbitMQClient({ url: process.env.RABBITMQ_URL })
await client.init()
await client.publish(exchange, routingKey, JSON.parse(body), { messageId })
await client.close()
JS
)"
PROVISIONED_PROJECT="$(cat <<'JS'
const { default: postgres } = await import('postgres')
const sql = postgres(process.env.DATABASE_URL)
const [row] = await sql`
  select event -> 'data' -> 'resource' ->> 'id' as id from outbox
  where event ->> 'type' = 'com.twake.tasks.space.provisioned.v1'
    and event -> 'data' ->> 'space_id' = ${process.argv[1]}`
await sql.end()
process.stdout.write(row?.id ?? '')
JS
)"
# A space created the way ldap-rest announces it, members `uid:role` of the organization (once: a restarted stack keeps it)
create_space() {
  local id="$1" name="$2" members="" uid role
  shift 2
  [ -n "$(in_backend "$PROVISIONED_PROJECT" "$id")" ] && return 0
  for member in "$@"; do
    uid="${member%%:*}" role="${member#*:}"
    members="$members${members:+,}{\"uuid\":\"$(uuid_of "$uid")\",\"email\":\"$uid@$CHAOS_ORG\",\"role\":\"$role\"}"
  done
  in_backend "$PUBLISH" space twake.space.created "$(cat /proc/sys/kernel/random/uuid)" \
    "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",\"organizationId\":\"$CHAOS_ORG\",\"id\":\"$id\",\"name\":\"$name\",\"members\":[$members]}" >/dev/null
}
project_of_space() {
  local project=""
  for _ in $(seq 1 60); do
    project="$(in_backend "$PROVISIONED_PROJECT" "$1")"
    [ -n "$project" ] && break
    sleep 1
  done
  [ -n "$project" ] || { echo "the backend did not provision the space $1" >&2; compose logs --tail 60 backend >&2; exit 1; }
  echo "$project"
}
create_space 5ace0000-0000-4000-8000-000000000001 "Product launch" alice:admin bob:editor carol:viewer
create_space 5ace0000-0000-4000-8000-000000000002 "Support" bob:admin dave:editor alice:viewer
launch="$(project_of_space 5ace0000-0000-4000-8000-000000000001)"
support="$(project_of_space 5ace0000-0000-4000-8000-000000000002)"
printf '[\n  {"name": "Product launch", "projectId": "%s"},\n  {"name": "Support", "projectId": "%s"}\n]\n' "$launch" "$support" > "$CHAOS_RUN/space.json"
write_env

echo "==> An account signs in (the mock SSO, authorization code + PKCE) and reaches the API through the frontend"
for i in $(seq 1 40); do
  token="$(sso_token "$CHAOS_USER" || true)"
  boards="$([ -n "$token" ] && curl -sf --max-time 10 -H "Authorization: Bearer $token" "http://127.0.0.1:$CHAOS_APP_PORT/api/boards" || true)"
  printf '%s' "$boards" | grep -q "\"$launch\"" && break
  [ "$i" = 40 ] && { echo "$CHAOS_USER cannot reach the API through the SSO (token: ${token:+yes}${token:-no}; boards: ${boards:0:300})" >&2; exit 1; }
  sleep 3
done
echo "==> Ready: the app http://localhost:$CHAOS_APP_PORT (API /api), the backend's probes http://127.0.0.1:$CHAOS_API_PORT, SSO https://127.0.0.1:$CHAOS_SSO_PORT, Twake Space http://localhost:$CHAOS_SPACE_PORT, Mailpit http://127.0.0.1:$CHAOS_MAIL_PORT ($CHAOS_RUN/env)"
