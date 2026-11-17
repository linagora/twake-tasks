#!/bin/bash
#
# Builds the images of Twake Tasks' backend and frontend from the commit under test, as the repository's own scripts do
# (docker-compose.yml: apps/backend/Dockerfile and apps/frontend/Dockerfile, the repository as the context), and the
# PostgreSQL image of the stack (PostgreSQL 18 with Patroni and etcd, conf/postgres/Dockerfile), then pulls the others.
# BACKEND_IMAGE / FRONTEND_IMAGE given (published images, e.g. ghcr.io/linagora/twake-tasks-backend:latest): pulled instead.
#
set -euo pipefail
. "$(dirname "$0")/common.sh"

build_or_pull() {  # build_or_pull <image> <built image name> <Dockerfile>
  if [ "$1" != "$2" ]; then
    echo "==> Using $1: no build"
    docker image inspect "$1" >/dev/null 2>&1 || docker pull --quiet "$1"
  else
    echo "==> Building $2 ($3) from $REPO_DIR"
    docker build --quiet -f "$REPO_DIR/$3" -t "$2" "$REPO_DIR"
  fi
}
build_or_pull "$BACKEND_IMAGE" "$BUILT_BACKEND_IMAGE" apps/backend/Dockerfile
build_or_pull "$FRONTEND_IMAGE" "$BUILT_FRONTEND_IMAGE" apps/frontend/Dockerfile

echo "==> PostgreSQL with Patroni and etcd ($POSTGRES_IMAGE)"
docker build --quiet -t "$POSTGRES_IMAGE" "$CHAOS_DIR/conf/postgres"

echo "==> Pulling the other images"
compose pull --quiet --ignore-pull-failures $(compose config --services | grep -vxE 'backend|frontend|pg[0-9]+')
