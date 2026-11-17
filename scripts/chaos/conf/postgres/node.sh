#!/bin/bash
# A node of the PostgreSQL cluster (NODE: pg1, pg2 or pg3): its etcd member, then Patroni, which runs PostgreSQL (the first
# node to take the initialize key in etcd runs initdb and post-bootstrap.sh; the others copy it by pg_basebackup and
# stream from it). Either process ending ends the container (compose restarts it): never a node half up.
set -euo pipefail
: "${NODE:?}" "${PEERS:?}"
DATA=/var/lib/postgresql
if [ "$(id -u)" = 0 ]; then
  mkdir -p "$DATA/etcd" "$DATA/patroni"
  chown -R postgres:postgres "$DATA"
  chmod 700 "$DATA/patroni"
  exec gosu postgres "$0" "$@"
fi

cluster=""
for p in $PEERS; do cluster="$cluster${cluster:+,}$p=http://$p:2380"; done
# heartbeat 100 ms, election 1 s (etcd's defaults): a paused member that led is replaced within ~1-2 s
etcd --name "$NODE" --data-dir "$DATA/etcd" \
  --listen-peer-urls http://0.0.0.0:2380 --initial-advertise-peer-urls "http://$NODE:2380" \
  --listen-client-urls http://0.0.0.0:2379 --advertise-client-urls "http://$NODE:2379" \
  --initial-cluster "$cluster" --initial-cluster-state new --initial-cluster-token ttasks-chaos \
  --quota-backend-bytes 268435456 --auto-compaction-retention 1h --log-level warn &
etcd_pid=$!

until etcdctl --endpoints=http://localhost:2379 endpoint health >/dev/null 2>&1; do
  kill -0 "$etcd_pid" 2>/dev/null || { echo "etcd exited" >&2; exit 1; }
  sleep 1
done
echo "etcd member $NODE healthy"

export PATRONI_NAME="$NODE"
export PATRONI_RESTAPI_CONNECT_ADDRESS="$NODE:8008"
export PATRONI_POSTGRESQL_CONNECT_ADDRESS="$NODE:5432"
export PATRONI_ETCD3_HOSTS="$(for p in $PEERS; do printf '%s:2379,' "$p"; done | sed 's/,$//')"
patroni /etc/patroni.yml &
patroni_pid=$!

# docker stop: Patroni first (a leader that stops gives the leadership up at once), then etcd
trap 'kill -TERM $patroni_pid 2>/dev/null; wait $patroni_pid; kill -TERM $etcd_pid 2>/dev/null; wait $etcd_pid; exit 0' TERM INT
wait -n "$etcd_pid" "$patroni_pid"
echo "etcd or patroni exited" >&2
kill -TERM "$patroni_pid" "$etcd_pid" 2>/dev/null || true
wait
exit 1
