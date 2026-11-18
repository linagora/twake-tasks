#!/bin/bash
# A user manages a task on their board: creates it, edits it (title, priority, due date), writes its description,
# completes it; the board, read again, shows each change. alice's Inbox (never shared: notifies no one). The task is
# trashed and purged at the end.
. "$(dirname "$0")/lib.sh"

user="$CHAOS_USER"
board="$(inbox_of "$user")" || fail "$(api_err)"
task="$(new_task "$user" "$board" "Task $TOKEN_RUN")" || fail "create: $(api_err)"
today="$(date -u +%F)"
api "$user" PATCH "/boards/$board/tasks/$task" \
  "{\"title\":\"Edited $TOKEN_RUN\",\"priority\":2,\"dueDate\":\"$today\"}" >/dev/null || fail "edit: $(api_err)"
d="$(api "$user" GET "/boards/$board/tasks/$task/description")" || fail "$(api_err)"
api "$user" PUT "/boards/$board/tasks/$task/description" \
  "{\"markdown\":\"Notes **$TOKEN_RUN**\",\"version\":$(jq '.version' <<<"$d")}" >/dev/null || fail "description: $(api_err)"
api "$user" POST "/boards/$board/tasks/$task/complete" '{"state":"completed"}' >/dev/null || fail "complete: $(api_err)"

b="$(api "$user" GET "/boards/$board")" || fail "$(api_err)"
t="$(jq -c --arg id "$task" '.tasks[] | select(.id == $id)' <<<"$b")"
[ -n "$t" ] || fail "the task is not on the board once completed"
jq -e --arg title "Edited $TOKEN_RUN" --arg d "$today" \
  '.title == $title and .priority == 2 and .dueDate == $d and .completedAt != null' <<<"$t" >/dev/null \
  || fail "the board does not show the changes: ${t:0:200}"
d="$(api "$user" GET "/boards/$board/tasks/$task/description")" || fail "$(api_err)"
grep -q "$TOKEN_RUN" <<<"$d" || fail "the description is not saved: ${d:0:120}"
ok "task $(jq -r .key <<<"$t") created, edited, described and completed"
