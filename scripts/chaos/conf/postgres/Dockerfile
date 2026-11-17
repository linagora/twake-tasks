# A node of the PostgreSQL cluster of the chaos stack: PostgreSQL 18 (the version of the repository's docker-compose.yml),
# Patroni (the automatic failover: leader election, promotion, the old primary rewound and rejoining as a replica) and an
# etcd member (Patroni's consensus store). Each node runs its etcd member next to its PostgreSQL, as each machine of a
# 3 node cluster would: pausing a node freezes both.
FROM quay.io/coreos/etcd:v3.5.21 AS etcd

FROM postgres:18
# Patroni from Debian's archive (the image's own apt sources: PGDG and Debian); python3-etcd: its etcd3 client builds on it
RUN apt-get update \
 && apt-get install -y --no-install-recommends patroni python3-etcd curl \
 && rm -rf /var/lib/apt/lists/*
COPY --from=etcd /usr/local/bin/etcd /usr/local/bin/etcdctl /usr/local/bin/
COPY node.sh /node.sh
COPY patroni.yml /etc/patroni.yml
COPY post-bootstrap.sh /post-bootstrap.sh
RUN chmod 755 /node.sh /post-bootstrap.sh
ENTRYPOINT ["/node.sh"]
