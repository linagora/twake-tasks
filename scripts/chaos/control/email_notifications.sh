#!/bin/bash
# Email notifications: a user sets a reminder on a task, a few seconds ahead; when it fires (the job scheduler) they are
# notified in the app and by email: the mail reaches their mailbox (Mailpit, the backend's SMTP server), its subject
# naming the task. A reminder (not counted against the person's email budget, unlike the other notification emails:
# 10 in 10 minutes) so that the probe can run as often as needed. erin's Inbox; task purged, mail deleted at the end.
. "$(dirname "$0")/lib.sh"
BUDGET=85

user=erin
board="$(inbox_of "$user")" || fail "$(api_err)"
task="$(new_task "$user" "$board" "Remind $TOKEN_RUN")" || fail "create the task: $(api_err)"
at="$(date -u -d '+2 seconds' +%Y-%m-%dT%H:%M:%S.000Z)"
api "$user" POST "/boards/$board/tasks/$task/reminders" "{\"at\":\"$at\"}" >/dev/null || fail "set the reminder: $(api_err)"

notified=
while [ "$(remaining)" -gt 0 ]; do
  sleep 2
  if [ -z "$notified" ]; then
    n="$(api "$user" GET /notifications 2>/dev/null)" && jq -e --arg t "$task" 'any(.notifications[]; .taskId == $t and .reason == "reminder")' <<<"$n" >/dev/null && notified=1
  fi
  m="$(curl -s -m 5 --get "$CHAOS_MAIL_URL/api/v1/search" --data-urlencode "query=subject:\"$TOKEN_RUN\"")" || continue
  id="$(jq -r --arg to "$(email_of "$user")" '[.messages[]? | select(any(.To[]; .Address == $to))][0].ID // empty' <<<"$m")"
  if [ -n "$id" ]; then
    curl -s -m 5 -X DELETE -H 'Content-Type: application/json' -d "{\"IDs\":[\"$id\"]}" "$CHAOS_MAIL_URL/api/v1/messages" >/dev/null
    ok "reminder mailed to $(email_of "$user") in $((SECONDS - START)) s: $(jq -r '.messages[0].Subject' <<<"$m")"
  fi
done
[ -n "$notified" ] || fail "the reminder did not fire (not even in the app) in $BUDGET s"
fail "the reminder fired in the app, no mail received in $BUDGET s"
