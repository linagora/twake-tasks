#!/bin/bash
# Twake Space spaces: a space created in Twake Space (twake.space.created on the `space` exchange, as ldap-rest
# announces it, alice its admin, bob a member) gets its managed project: its board appears in alice's boards, bob a
# member of it. At the end the space is deleted (twake.space.deleted, not checked): its project leaves alice's boards,
# purged 30 days later as any deleted space's.
. "$(dirname "$0")/lib.sh"
BUDGET=55

user="$CHAOS_USER"
space="$(cat /proc/sys/kernel/random/uuid)"
name="Space $TOKEN_RUN"
now() { date -u +%Y-%m-%dT%H:%M:%S.%3NZ; }
members="[{\"uuid\":\"$(uuid_of "$user")\",\"email\":\"$(email_of "$user")\",\"role\":\"admin\"},{\"uuid\":\"$(uuid_of "$CHAOS_USER2")\",\"email\":\"$(email_of "$CHAOS_USER2")\",\"role\":\"editor\"}]"
err="$(amqp_publish space twake.space.created \
  "{\"timestamp\":\"$(now)\",\"organizationId\":\"$CHAOS_ORG\",\"id\":\"$space\",\"name\":\"$name\",\"members\":$members}" 2>&1)" \
  || fail "Twake Space cannot publish the space's creation to RabbitMQ: $err"
on_exit "amqp_publish space twake.space.deleted '{\"timestamp\":\"'\$(now)'\",\"organizationId\":\"$CHAOS_ORG\",\"id\":\"$space\"}'"

found=
while [ "$(remaining)" -gt 0 ]; do
  b="$(api "$user" GET /boards 2>/dev/null)" \
    && found="$(jq -c --arg n "$name" '[.boards[] | select(.project.name == $n and .project.managed)][0] // empty' <<<"$b")" \
    && [ -n "$found" ] && break
  sleep 0.5
done
[ -n "$found" ] || fail "the space's project did not appear in $user's boards in $BUDGET s"
jq -e --arg u "$(uuid_of "$CHAOS_USER2")" '.role == "admin" and any(.members[]; .userId == $u)' <<<"$found" >/dev/null \
  || fail "the space's project has not its members' roles: ${found:0:200}"
ok "the space's project appeared in $((SECONDS - START)) s, $user admin, $CHAOS_USER2 a member"
