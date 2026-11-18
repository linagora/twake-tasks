#!/bin/bash
# A user comments on a task: bob writes a Markdown comment, reacts to it with an emoji, edits it; the task's comments,
# read again, show the edited body, the reaction and the edit mark. bob's Inbox; the task is purged at the end.
. "$(dirname "$0")/lib.sh"

user="$CHAOS_USER2"
board="$(inbox_of "$user")" || fail "$(api_err)"
task="$(new_task "$user" "$board" "Comments $TOKEN_RUN")" || fail "create the task: $(api_err)"
base="/boards/$board/tasks/$task/comments"
c="$(api "$user" POST "$base" "{\"body\":\"First *$TOKEN_RUN*\"}")" || fail "comment: $(api_err)"
id="$(jq -er '.id' <<<"$c" 2>/dev/null)" \
  || { l="$(api "$user" GET "$base")" || fail "$(api_err)"; id="$(jq -er '.comments[0].id' <<<"$l")" || fail "no comment listed: ${l:0:200}"; }
api "$user" PUT "$base/$id/reactions/%F0%9F%91%8D" >/dev/null || fail "react: $(api_err)"
api "$user" PATCH "$base/$id" "{\"body\":\"Edited $TOKEN_RUN\"}" >/dev/null || fail "edit: $(api_err)"
l="$(api "$user" GET "$base")" || fail "$(api_err)"
jq -e --arg id "$id" --arg b "Edited $TOKEN_RUN" \
  'any(.comments[]; .id == $id and (.body | contains($b)) and .editedAt != null and (.reactions | length) == 1)' <<<"$l" >/dev/null \
  || fail "the comment does not show the edit and the reaction: ${l:0:200}"
ok "comment written, reacted to and edited"
