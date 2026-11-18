#!/bin/bash
# Live board updates: a board open in the web app (its event stream, /api/boards/<id>/events: the version it holds)
# learns of another tab's change without reloading: dave opens his Inbox's stream, a task is created on it, the stream
# pushes the newer version (the backend publishes board.changed on RabbitMQ's twake-tasks.live exchange once the change
# commits; each replica consumes it and writes to its open streams). The task is purged at the end.
. "$(dirname "$0")/lib.sh"
BUDGET=40

user=dave
board="$(inbox_of "$user")" || fail "$(api_err)"
tok="$(token "$user")" || fail "no token for $user"
stream="$TMP/stream"
curl -s -N -m "$BUDGET" -H "Authorization: Bearer $tok" -H 'Accept: text/event-stream' \
  -o "$stream" -w '%{http_code}' "$CHAOS_APP_URL/api/boards/$board/events" >"$TMP/code" 2>/dev/null &
pid=$!
on_exit "kill $pid"
version() { sed -n 's/^data: {"version":\([0-9]*\)}.*/\1/p' "$stream" 2>/dev/null | tail -1; }

# the version the stream sends when it opens
until [ -n "$(version)" ]; do
  kill -0 $pid 2>/dev/null || fail "the stream closed before its first version: HTTP $(cat "$TMP/code") $(head -c 120 "$stream")"
  [ "$(remaining)" -gt 0 ] || fail "the stream sends no version in $BUDGET s"
  sleep 0.2
done
v0="$(version)"
new_task "$user" "$board" "Live $TOKEN_RUN" >/dev/null || fail "create a task: $(api_err)"
while [ "$(remaining)" -gt 0 ]; do
  v="$(version)"
  [ "$v" -gt "$v0" ] && ok "the open board was pushed version $v (was $v0) in $((SECONDS - START)) s"
  kill -0 $pid 2>/dev/null || fail "the stream closed without pushing the change (still version $v0)"
  sleep 0.2
done
fail "the open board was not pushed the change in $BUDGET s (still version $v0)"
