#!/bin/bash
# Saved filters: a user saves a filter (priority 1 and a text, across boards), pins it to the sidebar, opens it: the
# matching task is listed, the other is not. erin's Inbox; the filter is deleted and the tasks purged at the end.
. "$(dirname "$0")/lib.sh"

user=erin
board="$(inbox_of "$user")" || fail "$(api_err)"
hit="$(new_task "$user" "$board" "Urgent $TOKEN_RUN")" || fail "create a task: $(api_err)"
miss="$(new_task "$user" "$board" "Later $TOKEN_RUN")" || fail "create a task: $(api_err)"
api "$user" PATCH "/boards/$board/tasks/$hit" '{"priority":1}' >/dev/null || fail "priority: $(api_err)"
f="$(api "$user" POST /filters "{\"name\":\"Filter $TOKEN_RUN\",\"criteria\":{\"priority\":[1],\"text\":\"$TOKEN_RUN\"}}")" \
  || fail "save the filter: $(api_err)"
filter="$(jq -er .id <<<"$f")" || fail "no filter id: ${f:0:120}"
on_exit "api '$user' DELETE '/filters/$filter'"
api "$user" PUT "/filters/$filter/favorite" >/dev/null || fail "pin: $(api_err)"
l="$(api "$user" GET /filters)" || fail "$(api_err)"
jq -e --arg id "$filter" 'any(.filters[]; .id == $id and .favorite)' <<<"$l" >/dev/null || fail "the filter is not listed pinned"
t="$(api "$user" GET "/filters/$filter/tasks?zone=UTC")" || fail "$(api_err)"
jq -e --arg hit "$hit" --arg miss "$miss" '(any(.tasks[]; .id == $hit)) and (all(.tasks[]; .id != $miss))' <<<"$t" >/dev/null \
  || fail "the filter lists the wrong tasks: $(jq -c '[.tasks[].title]' <<<"$t" | head -c 200)"
ok "filter saved, pinned, listing the matching task"
