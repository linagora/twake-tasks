#!/bin/bash
# A user searches their tasks: carol creates a task with a unique word in its title, searches the word (the search box,
# the same route Twake Space calls); the task is found, then found by its key too. carol's Inbox; purged at the end.
. "$(dirname "$0")/lib.sh"

user=carol
word="zq${TOKEN_RUN//[^a-z0-9]/}"
board="$(inbox_of "$user")" || fail "$(api_err)"
task="$(new_task "$user" "$board" "Find $word")" || fail "create the task: $(api_err)"
r="$(api "$user" GET "/search?q=$word")" || fail "search: $(api_err)"
key="$(jq -er --arg id "$task" '.tasks[] | select(.id == $id) | .key' <<<"$r")" \
  || fail "the search does not find the task by its title: ${r:0:200}"
r="$(api "$user" GET "/search?q=$key&board=$board")" || fail "search by key: $(api_err)"
jq -e --arg id "$task" 'any(.tasks[]; .id == $id)' <<<"$r" >/dev/null || fail "the search does not find $key by its key"
ok "found by title and by key ($key)"
