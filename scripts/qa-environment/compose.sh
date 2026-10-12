# Sourced by the QA scripts: the settings of the stack and how to reach it.

REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
GENERATED_DIR="$SCRIPT_DIR/.generated"

QA_PROJECT="${QA_PROJECT:-twake-tasks-qa}"
# Accounts on top of alice and bob, see start.sh
export QA_USERS="${QA_USERS-carol dave erin@globex.e2e.test frank@}"
export QA_APP_PORT="${QA_APP_PORT:-18800}"
export QA_SPACE_PORT="${QA_SPACE_PORT:-18801}"

compose() {
  docker compose -p "$QA_PROJECT" --project-directory "$REPO_DIR" \
    -f "$REPO_DIR/docker-compose.yml" -f "$SCRIPT_DIR/docker-compose.qa.yml" \
    --profile app "$@"
}
