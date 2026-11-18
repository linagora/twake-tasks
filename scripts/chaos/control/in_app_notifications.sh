#!/bin/bash
# In-app notifications: on a shared board (the "Product launch" space's project), bob assigns a task to alice and
# mentions her in a comment; alice's notifications list both (assigned, mentioned) and her unread count shows them.
# alice then deletes them (before the scheduler mails them: no email of hers spent), the task is purged.
. "$(dirname "$0")/lib.sh"

actor="$CHAOS_USER2" user="$CHAOS_USER"
board="$(board_of_project "$actor" "$CHAOS_PROJECT_LAUNCH")" || fail "$(api_err)"
task="$(new_task "$actor" "$board" "Notify $TOKEN_RUN")" || fail "create the task: $(api_err)"
# bob, an editor, trashes it; alice, an admin, purges it
on_exit "api '$user' DELETE '/boards/$board/trash/$task'"
api "$actor" PUT "/boards/$board/tasks/$task/assignees" "{\"userIds\":[\"$(uuid_of "$user")\"]}" >/dev/null || fail "assign: $(api_err)"
api "$actor" POST "/boards/$board/tasks/$task/comments" "{\"body\":\"@$(email_of "$user") please look ($TOKEN_RUN)\"}" >/dev/null \
  || fail "comment: $(api_err)"

n="$(api "$user" GET /notifications)" || fail "$(api_err)"
mine="$(jq -c --arg t "$task" '[.notifications[] | select(.taskId == $t)]' <<<"$n")"
for id in $(jq -r '.[].id' <<<"$mine"); do on_exit "api '$user' DELETE '/notifications/$id'"; done
for reason in assigned mentioned; do
  jq -e --arg r "$reason" 'any(.[]; .reason == $r and .readAt == null)' <<<"$mine" >/dev/null \
    || fail "alice has no unread '$reason' notification: $(jq -c '[.[].reason]' <<<"$mine")"
done
u="$(api "$user" GET /notifications/unread)" || fail "$(api_err)"
jq -e --arg p "$CHAOS_PROJECT_LAUNCH" 'any(.projects[]; .projectId == $p and .count >= 2)' <<<"$u" >/dev/null \
  || fail "the unread count misses them: ${u:0:200}"
ok "alice notified in the app: assigned and mentioned"
