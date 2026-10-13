#!/usr/bin/env bash
#
# Starts a long lived Twake Tasks stack for manual or agent driven exploratory QA: the frontend
# and backend built from the working tree, in space mode, with the mock SSO of the end to end
# suite, Mailpit for the emails and a stand-in for TwakeSpace. It runs under its own compose
# project and ports, next to the dev and end to end stacks, and stays up until stop.sh.
#
#   scripts/qa-environment/build.sh    # once, and whenever the code under test changes
#   scripts/qa-environment/start.sh
#   QA_USERS="carol dave" scripts/qa-environment/start.sh   # other extra accounts
#
# Accounts, signed in by a button of the mock SSO, no password:
#   alice (administrator of the organization acme.e2e.test), bob, and QA_USERS, by default
#   carol and dave of acme.e2e.test, erin of another organization (globex.e2e.test) and frank of
#   none (a B2C account). An entry of QA_USERS is `uid` (acme.e2e.test), `uid@org` or `uid@`.
#
# Seeded TwakeSpace spaces, each with its managed project:
#   "Product launch": alice admin, bob editor, carol viewer
#   "Support":        bob admin, dave editor, alice viewer
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/qa-environment/compose.sh
. "$SCRIPT_DIR/compose.sh"

ORG="acme.e2e.test"
APP_URL="http://localhost:$QA_APP_PORT"
SPACE_URL="http://localhost:$QA_SPACE_PORT"

# The uuid the mock SSO gives an extra person (uuidOf in e2e/oidc/server.ts)
uuid_of() {
  case "$1" in
    alice) echo 0a11ce00-0000-4000-8000-000000000001 ;;
    bob) echo 0b0b0000-0000-4000-8000-000000000002 ;;
    *)
      local h
      h="$(printf '%s' "$1" | sha256sum | cut -c1-32)"
      echo "${h:0:8}-${h:8:4}-4${h:13:3}-8${h:17:3}-${h:20:12}"
      ;;
  esac
}

in_backend() {
  local script="$1"
  shift
  compose exec -T backend node --input-type=module -e "$script" "$@"
}

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

# A space created the way ldap-rest announces it. Members are `uid:role`, the people of ORG only.
create_space() {
  local id="$1" name="$2"
  shift 2
  local members="" uid role
  for member in "$@"; do
    uid="${member%%:*}"
    role="${member#*:}"
    case " $QA_USERS alice bob " in
      *" $uid "*) ;;
      *) continue ;;
    esac
    members="$members${members:+,}{\"uuid\":\"$(uuid_of "$uid")\",\"email\":\"$uid@$ORG\",\"role\":\"$role\"}"
  done
  in_backend "$PUBLISH" space twake.space.created "$(cat /proc/sys/kernel/random/uuid)" \
    "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",\"organizationId\":\"$ORG\",\"id\":\"$id\",\"name\":\"$name\",\"members\":[$members]}" >/dev/null
}

project_of_space() {
  local project=""
  for _ in $(seq 1 60); do
    project="$(in_backend "$PROVISIONED_PROJECT" "$1")"
    [ -n "$project" ] && break
    sleep 1
  done
  if [ -z "$project" ]; then
    echo "The backend did not provision the space $1, see: docker compose -p $QA_PROJECT logs backend" >&2
    exit 1
  fi
  echo "$project"
}

echo "==> Generating the configuration in $GENERATED_DIR"
mkdir -p "$GENERATED_DIR/certs"
if ! openssl x509 -checkend 86400 -noout -in "$GENERATED_DIR/certs/oidc.crt" 2>/dev/null; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj /CN=oidc \
    -addext 'subjectAltName=DNS:oidc,DNS:localhost' \
    -addext 'basicConstraints=critical,CA:TRUE' \
    -keyout "$GENERATED_DIR/certs/oidc.key" -out "$GENERATED_DIR/certs/oidc.crt" 2>/dev/null
  chmod 644 "$GENERATED_DIR/certs/oidc.key"
fi
[ -f "$GENERATED_DIR/space.json" ] || echo '[]' >"$GENERATED_DIR/space.json"

echo "==> Starting the stack as compose project '$QA_PROJECT'"
if ! compose up -d --wait --no-build; then
  echo "The stack did not start. Built the images? scripts/qa-environment/build.sh" >&2
  echo "Logs: docker compose -p $QA_PROJECT logs" >&2
  exit 1
fi

echo "==> Seeding the TwakeSpace spaces"
create_space 5ace0000-0000-4000-8000-000000000001 "Product launch" alice:admin bob:editor carol:viewer
create_space 5ace0000-0000-4000-8000-000000000002 "Support" bob:admin dave:editor alice:viewer
launch="$(project_of_space 5ace0000-0000-4000-8000-000000000001)"
support="$(project_of_space 5ace0000-0000-4000-8000-000000000002)"
cat >"$GENERATED_DIR/space.json" <<JSON
[
  {"name": "Product launch", "projectId": "$launch"},
  {"name": "Support", "projectId": "$support"}
]
JSON

accounts=""
for entry in alice bob $QA_USERS; do
  uid="${entry%%@*}"
  case "$entry" in
    *@) org="no organization, B2C" ;;
    *@*) org="${entry#*@}" ;;
    *) org="$ORG" ;;
  esac
  accounts="$accounts    $uid ($org)
"
done

cat <<INFO

==> The QA environment is up

  App:        $APP_URL  (mock SSO: a "Sign in as <uid>" button per account)
  TwakeSpace: $SPACE_URL  (stand-in framing the embedded pages)
  Emails:     http://mailpit:8025 from the stack network (Mailpit)

Accounts:
$accounts
Spaces: "Product launch" (project $launch), "Support" (project $support)

From a container (e.g. Playwright), join the network '${QA_PROJECT}_default' and use:
  --host-resolver-rules="MAP localhost:$QA_APP_PORT frontend:8080,MAP localhost:$QA_SPACE_PORT twakespace:8080"
  --ignore-certificate-errors   (the mock SSO, https://oidc:8443, is self-signed)

Stop it with: scripts/qa-environment/stop.sh
INFO
