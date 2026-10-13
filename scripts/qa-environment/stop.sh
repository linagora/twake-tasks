#!/usr/bin/env bash
#
# Stops the QA environment started by start.sh and deletes its data.
#
#   scripts/qa-environment/stop.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/qa-environment/compose.sh
. "$SCRIPT_DIR/compose.sh"

compose down --volumes --remove-orphans
# The project ids of the seeded spaces die with the database
rm -f "$GENERATED_DIR/space.json"
echo "==> QA environment '$QA_PROJECT' stopped"
