# Shared by the control scripts of the chaos stack of Twake Tasks. Sourced, never run.
#
# Conventions: exit 0 the feature works, 1 it does not, 2 the probe itself is broken. The last line printed says why.
# Helpers print their result on stdout and return non zero on failure, the reason on stderr (or in $API_ERR).

CONTROL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../common.sh
. "$CONTROL_DIR/../common.sh"
if [ ! -r "$CHAOS_RUN/env" ]; then echo "BROKEN: no $CHAOS_RUN/env: start.sh has not run"; exit 2; fi
# shellcheck disable=SC1091
. "$CHAOS_RUN/env"

# state kept between runs (cached tokens): never needed, only saves sign-ins
STATE_DIR="$CHAOS_RUN/control"
mkdir -p "$STATE_DIR" 2>/dev/null || { echo "BROKEN: cannot create $STATE_DIR"; exit 2; }

FEATURE="$(basename "$0" .sh)"
START=$SECONDS
# the budget of the script (twake-chaos kills it at its timeout_seconds): polling stops before, to say why
BUDGET="${CHAOS_CONTROL_BUDGET:-55}"
remaining() { echo $((START + BUDGET - SECONDS)); }
# the timeout of one call: the web app's fetch has none, a slow answer is still an answer; bounded by the budget left.
# The slowness itself: twake-chaos times the scripts.
CALL_TIMEOUT=30
ct() { local r=$((START + BUDGET - SECONDS)); [ $r -gt $CALL_TIMEOUT ] && r=$CALL_TIMEOUT; [ $r -lt 3 ] && r=3; echo $r; }

TOKEN_RUN="chaos-$(date +%s)-$RANDOM$RANDOM"
TMP="$(mktemp -d "$STATE_DIR/$FEATURE.XXXXXX")" || { echo "BROKEN: no temporary directory"; exit 2; }
# what to undo at exit, one command a line: a file, so that helpers run in $(...) can add to it
cleanup() {
  local rc=$? c
  trap - EXIT
  if [ -s "$TMP/cleanups" ]; then
    # a failing run (a component down) does not wait on it: a few seconds, what is left stays (unique names)
    if [ $rc = 0 ]; then CALL_TIMEOUT=10 BUDGET=$((SECONDS - START + 20)); else CALL_TIMEOUT=3 BUDGET=$((SECONDS - START + 6)); fi
    while IFS= read -r c; do [ "$(remaining)" -gt 0 ] || break; eval "$c" >/dev/null 2>&1 </dev/null; done <"$TMP/cleanups"
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT
on_exit() { printf '%s\n' "$*" >>"$TMP/cleanups"; }

# the reason on one line, the last one
oneline() { local s="$*"; s="${s//$'\n'/ | }"; printf '%s\n' "${s:0:400}"; }
ok()     { oneline "OK: $*"; exit 0; }
fail()   { oneline "FAIL: $*"; exit 1; }
broken() { oneline "BROKEN: $*"; exit 2; }

# The accounts (common.sh, e2e/oidc/server.ts): uid -> uuid the mock SSO gives, email
uuid_of() {
  case "$1" in
    alice) echo 0a11ce00-0000-4000-8000-000000000001 ;;
    bob) echo 0b0b0000-0000-4000-8000-000000000002 ;;
    *) local h; h="$(printf '%s' "$1" | openssl dgst -sha256 -r | cut -c1-32)"
       echo "${h:0:8}-${h:8:4}-4${h:13:3}-8${h:17:3}-${h:20:12}" ;;
  esac
}
email_of() { case "$1" in erin) echo erin@globex.e2e.test ;; *) echo "$1@$CHAOS_ORG" ;; esac; }

# ------------------------------------------------------------------------------------------------------ the SSO
# token <uid>: a bearer token, as the signed-in web app holds one (the mock's live an hour): reused while it has more
# than 5 minutes left, else a new sign-in (sso_token of common.sh: authorization code + PKCE of the web app's client).
token() {
  local uid="$1" file="$STATE_DIR/token.$1" now exp tok
  now=$(date +%s)
  if [ -s "$file" ]; then read -r exp tok <"$file"; else exp=0 tok=; fi
  if [ $((exp - now)) -lt 300 ] || [ -n "${FRESH_TOKEN:-}" ]; then
    tok="$(sso_token "$uid")" || { echo "the SSO does not sign $uid in" >&2; return 1; }
    printf '%s %s\n' "$((now + 3600))" "$tok" >"$file.$$" && mv -f "$file.$$" "$file"
  fi
  printf '%s' "$tok"
}
forget_token() { rm -f "$STATE_DIR/token.$1"; }

# --------------------------------------------------------------------------------------------------------- the API
# api <uid> <METHOD> <path under /api> [json body]: through the frontend (nginx proxies /api), as the web app calls it.
# Prints the body; fails on a non 2xx status, api_err saying which. API_CODE: the status (000: no answer).
# set_err: the reason of a failure, kept in a file: helpers run in $(...), whose variables are lost.
set_err() { API_ERR="$*"; printf '%s' "$*" >"$TMP/api_err"; return 1; }
api_err() { if [ -s "$TMP/api_err" ]; then cat "$TMP/api_err"; else printf '%s' "${API_ERR:-unknown error}"; fi; }
api() {
  local uid="$1" method="$2" path="$3" body="${4-}" tok resp try relogged=
  for try in 1 2 3 4 5; do
    tok="$(token "$uid")" || { API_CODE=000; set_err "no token for $uid (the SSO does not sign in)"; return 1; }
    local args=(-s -m "$(ct)" -w '\n%{http_code}' -X "$method" -H "Authorization: Bearer $tok")
    [ -n "$body" ] && args+=(-H 'Content-Type: application/json' --data-binary "$body")
    resp="$(curl "${args[@]}" "$CHAOS_APP_URL/api$path")"
    API_CODE="${resp##*$'\n'}"; resp="${resp%$'\n'*}"
    # a token the mock forgot (it restarted): sign in again, once
    if [ "$API_CODE" = 401 ] && [ -z "$relogged" ]; then relogged=1; forget_token "$uid"; continue; fi
    # 429: every probe comes from the same address, and the backend checks at most 5 tokens of one address at once
    # (RATE_LIMIT_TOKEN_CHECKS_PER_ADDRESS; a check is cached 60 s): a burst of probes is not a burst of one user's
    if [ "$API_CODE" = 429 ] && [ "$(remaining)" -gt 5 ]; then sleep 1; continue; fi
    break
  done
  if [ "${API_CODE:0:1}" != 2 ]; then
    set_err "$method $path: HTTP ${API_CODE/#000/no answer} $(printf '%s' "$resp" | head -c 160)"
    return 1
  fi
  printf '%s' "$resp"
}

# The boards of the accounts: their Personal Inbox (never shared: a probe's tasks notify no one), the seeded ones
inbox_of() {  # inbox_of <uid>
  local b
  b="$(api "$1" GET /boards)" || return 1
  jq -er '[.boards[] | select(.inbox)][0].id' <<<"$b" || set_err "$1 has no Inbox board"
}
board_of_project() {  # board_of_project <uid> <projectId>
  local b
  b="$(api "$1" GET /boards)" || return 1
  jq -er --arg p "$2" '[.boards[] | select(.project.id == $p)][0].id' <<<"$b" || set_err "no board of project $2 for $1"
}

# new_task <uid> <boardId> <title> [sectionId]: its id; trashed and purged at exit (the trash of an admin's board)
new_task() {
  local section="null" t id
  [ -n "${4-}" ] && section="\"$4\""
  t="$(api "$1" POST "/boards/$2/tasks" "{\"sectionId\":$section,\"title\":\"$3\"}")" || return 1
  id="$(jq -er .id <<<"$t")" || set_err "created task without id: ${t:0:120}" || return 1
  on_exit "api '$1' DELETE '/boards/$2/tasks/$id'; api '$1' DELETE '/boards/$2/trash/$id'"
  printf '%s' "$id"
}

# -------------------------------------------------------------------------------------------------------- RabbitMQ
# The platform's side of RabbitMQ (Twake Space, ldap-rest, common settings publish; consumers of the activity events),
# played inside the backend's container: the only one with an AMQP client (amqplib, under @linagora/rabbitmq-client),
# connected to the cluster through the load balancer as the backend is.
AMQPLIB=/app/node_modules/@linagora/rabbitmq-client/node_modules/amqplib/channel_api.js
in_backend() {  # in_backend <timeout s> <js> [args...]
  local t="$1" js="$2"; shift 2
  timeout "$t" docker exec -i -e AMQPLIB="$AMQPLIB" "$CHAOS_PROJECT-backend-1" node --input-type=module -e "$js" "$@"
}
# amqp_publish <exchange> <routingKey> <json body>: published with publisher confirms, a message id of its own
amqp_publish() {
  in_backend 25 '
const amqp = await import(process.env.AMQPLIB)
const [exchange, key, body] = process.argv.slice(1)
const fail = m => { console.error(m); process.exit(1) }
setTimeout(() => fail("no confirm in 20 s"), 20000).unref()
try {
  const c = await amqp.connect(process.env.RABBITMQ_URL, { timeout: 10000 })
  c.on("error", () => {})
  const ch = await c.createConfirmChannel()
  await new Promise((res, rej) => ch.publish(exchange, key, Buffer.from(body),
    { messageId: crypto.randomUUID(), contentType: "application/json", persistent: true }, e => e ? rej(e) : res()))
  await c.close()
} catch (e) { fail(String(e?.message ?? e)) }' "$@"
}
