#!/bin/bash
# Run once by Patroni on the node that bootstraps the cluster ($1: a superuser connection string): the roles and the
# database of the repository's postgres-init.sql (the backend serves as twake_tasks, which owns nothing, and migrates
# as twake_tasks_owner), as the repository's docker-compose.yml runs it in docker-entrypoint-initdb.d.
set -euo pipefail
psql -v ON_ERROR_STOP=1 "$1" -f /postgres-init.sql
