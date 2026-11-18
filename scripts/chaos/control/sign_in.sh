#!/bin/bash
# A user signs in to the web app through the SSO (a new sign-in: the mock's authorization code + PKCE, the code
# exchanged for a token), then the app's first calls with that token: their settings and their boards (the backend
# checks the token by introspection and records the person). Checked: the seeded "Product launch" project is listed.
. "$(dirname "$0")/lib.sh"

FRESH_TOKEN=1 token "$CHAOS_USER" >/dev/null || broken "the mock SSO does not sign $CHAOS_USER in (not a component under test)"
unset FRESH_TOKEN
api "$CHAOS_USER" GET /settings >/dev/null || fail "$(api_err)"
boards="$(api "$CHAOS_USER" GET "/boards?zone=UTC")" || fail "$(api_err)"
jq -e --arg p "$CHAOS_PROJECT_LAUNCH" 'any(.boards[]; .project.id == $p)' <<<"$boards" >/dev/null \
  || fail "signed in, but the boards miss the Product launch project: ${boards:0:200}"
ok "$CHAOS_USER signed in, $(jq '.boards | length' <<<"$boards") boards listed"
