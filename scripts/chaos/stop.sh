#!/bin/bash
set -euo pipefail
. "$(dirname "$0")/common.sh"
compose down -v --remove-orphans
# the project ids of the seeded spaces die with the database
rm -f "$CHAOS_RUN/space.json"
