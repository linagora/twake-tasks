#!/bin/bash
# A member opens a shared board: bob opens the board of the seeded "Support" space's project (its sections, its tasks,
# its members) and its progress. Read only.
. "$(dirname "$0")/lib.sh"

user="$CHAOS_USER2"
board="$(board_of_project "$user" "$CHAOS_PROJECT_SUPPORT")" || fail "$(api_err)"
b="$(api "$user" GET "/boards/$board")" || fail "$(api_err)"
jq -e '(.sections | length) > 0 and (.tasks | type) == "array" and (.members | length) > 0' <<<"$b" >/dev/null \
  || fail "the board has no sections or members: ${b:0:200}"
api "$user" GET "/boards/$board/progress?zone=UTC" >/dev/null || fail "$(api_err)"
ok "board $(jq -r .name <<<"$b"): $(jq '.sections | length' <<<"$b") sections, $(jq '.tasks | length' <<<"$b") tasks"
