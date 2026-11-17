# Chaos environment: the resilience claims of Twake Tasks

`claims.yaml` says, for each service the backend relies on, what it survives:

| Key | Meaning |
|---|---|
| `faultTolerance` | nodes that can be lost with no impact at all (absent: a single node) |
| `downImpact` | what stops working while the whole component is down; every other feature keeps working |
| `accidentRecovery` | `live`: once the component is back, everything works again without restarting the backend |
| `requiredOnStartup` | `false`: the backend starts without it, degraded as `downImpact` says |
| `failFast` | what `downImpact` names fails fast with a clear error, no request hanging |

This folder is the stack that checks them: every node of a replicated service is its own compose service, so that a
tool ([twake-chaos](https://github.com/linagora), the Twake QA tooling) can pause, stop and restart them one by one while
control scripts check the features. `topology.yaml` maps each component of `claims.yaml` onto its services.

| Component | Nodes | Replication |
|---|---|---|
| PostgreSQL 18 | `pg1..3` (each with Patroni 4.1 and an etcd 3.5 member) | Patroni: a primary, 2 streaming replicas, quorum commit (`ANY 1`), automatic failover (leader key TTL 15 s), the old primary rewound and rejoining |
| RabbitMQ 4.1 | `rabbitmq1..3` | quorum queues on the 3 nodes (`default_queue_type = quorum`, membership reconciled to 3), `autoheal` |
| Mailpit | `mailpit` (the backend's SMTP) | |

Not claimed, never faulted: `lb` (HAProxy, the one address of the PostgreSQL primary, by Patroni's `/primary`, and of
the RabbitMQ nodes: the backend takes one URL of each), `oidc` (the mock SSO of `e2e/oidc`, as the QA environment),
`twakespace` (the Twake Space stand-in of the QA environment).

The backend, the frontend, the SSO and Twake Space are configured as `scripts/qa-environment/docker-compose.qa.yml` does
(space mode, the mock SSO, Mailpit), with the ports below. Each container has a memory limit (~5.5 GB in all).

## Usage

```bash
scripts/chaos/build.sh   # the backend and frontend images of this commit, the PostgreSQL image (conf/postgres); BACKEND_IMAGE / FRONTEND_IMAGE=<published image>: pulled instead
scripts/chaos/start.sh   # the clusters formed and checked, the backend and frontend healthy, the spaces seeded, an SSO sign-in reaching the API
scripts/chaos/stop.sh    # everything removed, volumes included
```

Published on 127.0.0.1: the app 19740 (`/api`: the API), the backend's probes 19741 (`/health/ready`, `/metrics`), Twake
Space 19742, the SSO 19743 (https, self-signed), Mailpit 19744. Accounts (signed in by a button, no password): alice
(administrator of acme.e2e.test), bob, carol, dave, erin (globex.e2e.test), frank (none). Seeded spaces: "Product launch"
(alice admin, bob editor, carol viewer), "Support" (bob admin, dave editor, alice viewer). start.sh writes the URLs,
accounts and project ids to `~/.cache/twake-chaos/ttasks-chaos/env`; `sso_token <uid>` (common.sh) signs in headless.
A fault by hand:

```bash
. scripts/chaos/common.sh
pg_leader                    # the primary now
compose pause pg2            # a hung node; `stop` for a crashed one
compose unpause pg2
pg_healthy && rabbitmq_healthy
```
