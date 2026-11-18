#!/bin/bash
# Common settings: a person changes their settings in Twake Workplace (user.settings.updated on the `settings` exchange,
# all their settings, a version); Twake Tasks applies them: the app, reloaded, follows their name, language and timezone
# (GET /api/settings). carol's settings, with a unique display name each run; language and timezone kept as they were
# (en, Europe/Paris).
. "$(dirname "$0")/lib.sh"
BUDGET=55

user=carol
display="Carol $TOKEN_RUN"
# the version: an int (32 bits in the backend), growing from run to run: deciseconds since 2026-01-01
version=$(( ($(date +%s%3N) - 1767225600000) / 100 ))
body="{\"version\":$version,\"payload\":{\"email\":\"$(email_of "$user")\",\"language\":\"en\",\"timezone\":\"Europe/Paris\",\"theme\":\"light\",\"first_name\":\"Carol\",\"last_name\":\"Chaos\",\"display_name\":\"$display\"}}"
err="$(amqp_publish settings user.settings.updated "$body" 2>&1)" \
  || fail "common settings cannot publish the update to RabbitMQ: $err"
while [ "$(remaining)" -gt 0 ]; do
  s="$(api "$user" GET /settings 2>/dev/null)" && [ "$(jq -r .name <<<"$s")" = "$display" ] && break
  s=
  sleep 0.5
done
[ -n "$s" ] || fail "the settings update was not applied in $BUDGET s"
jq -e '.language == "en" and .timezone == "Europe/Paris" and .theme == "light"' <<<"$s" >/dev/null || fail "settings applied partly: $s"
ok "the settings update was applied in $((SECONDS - START)) s"
