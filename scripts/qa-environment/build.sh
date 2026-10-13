#!/usr/bin/env bash
#
# Builds the backend and frontend images start.sh runs, from the working tree, and pulls the
# others.
#
#   scripts/qa-environment/build.sh    # once, and whenever the code under test changes
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/qa-environment/compose.sh
. "$SCRIPT_DIR/compose.sh"

compose pull --quiet --ignore-buildable
compose build
