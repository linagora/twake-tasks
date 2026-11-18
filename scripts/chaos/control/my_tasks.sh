#!/bin/bash
# The personal views: a task assigned to the user and due today shows in My tasks and in Today / Upcoming (the agenda).
# dave assigns himself a task of his Inbox, due today; purged at the end.
. "$(dirname "$0")/lib.sh"

user=dave
me="$(uuid_of "$user")"
board="$(inbox_of "$user")" || fail "$(api_err)"
task="$(new_task "$user" "$board" "Mine $TOKEN_RUN")" || fail "create the task: $(api_err)"
api "$user" PATCH "/boards/$board/tasks/$task" "{\"dueDate\":\"$(date -u +%F)\"}" >/dev/null || fail "due date: $(api_err)"
api "$user" PUT "/boards/$board/tasks/$task/assignees" "{\"userIds\":[\"$me\"]}" >/dev/null || fail "assign: $(api_err)"
m="$(api "$user" GET /my-tasks)" || fail "$(api_err)"
jq -e --arg id "$task" 'any(.tasks[]; .id == $id)' <<<"$m" >/dev/null || fail "My tasks misses the assigned task"
a="$(api "$user" GET "/agenda?zone=UTC&days=7")" || fail "$(api_err)"
jq -e --arg id "$task" 'any(.tasks[]; .id == $id)' <<<"$a" >/dev/null || fail "Today / Upcoming misses the task due today"
ok "the task shows in My tasks ($(jq '.tasks | length' <<<"$m")) and in the agenda"
