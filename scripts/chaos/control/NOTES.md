# Control scripts of Twake Tasks: what was seen

Checked on 2026-11-18, commit 56e2b6b, on the chaos stack (`ttasks-chaos`), with `run_all.sh` (every script in parallel).

## Healthy stack

Every script exited 0 on 3 runs in a row. Each takes 0-2 s, except `email_notifications` (8-13 s: the reminder waits
for the job scheduler, which polls every 5 s, twice: the reminder's job, then its email's).

## Each component stopped (every node `docker stop`ped, all the scripts run, nodes restarted, `healthy` awaited)

| Component | Failing | Claimed (`impacts`) | Matches |
|---|---|---|---|
| smtp (`mailpit`) | `email_notifications` (the reminder fires in the app, no mail in 85 s) | `email_notifications` | yes |
| rabbitMQ (`rabbitmq1..3`) | `live_updates`, `activity_events`, `space_provisioning`, `settings_sync` | the same 4 | yes |
| postgresql (`pg1..3`) | all 14 | `all` | yes, but see failFast below |

After each restart (`healthy` reached: Mailpit a second, RabbitMQ ~9 s, Patroni ~15 s, a new leader), every script
passed again on its first run, with no restart of the backend (accidentRecovery `live` as far as these features go).

### postgresql: `failFast: true` does not hold on this stack

With the 3 nodes stopped, no API request is answered: every call of the scripts ran into its own 30 s timeout
(`HTTP no answer`). By hand: `GET /api/boards` got nginx's 504 after 60 s (the backend had not answered), and the
backend's own `GET /health/ready` had not answered after 150 s. The backend logged `write CONNECT_TIMEOUT
postgres:5432` (postgres.js' 30 s connect timeout), no 503 `unavailable`. The load balancer (`lb`, HAProxy in TCP mode)
accepts the connection and holds it with no server behind it ("proxy postgres has no server available"), so the
backend's connection attempts hang instead of being refused. claims.yaml's failFast cites infra/http.ts answering 503
on a connection error: it does not get one quickly here. Whether that is the stack's load balancer (a refused
connection might fail fast) or the backend (no bound on how long a request waits for a connection) is twake-chaos's to
judge; the scripts report it as the slowness of failing features (30 s each instead of a fast failure).

### rabbitMQ: how the event features fail

`activity_events`, `space_provisioning` and `settings_sync` play the other side of RabbitMQ (another app's consumer,
Twake Space publishing, common settings publishing), connected through the same load balancer as the backend. With
the cluster down that side cannot connect either ("Socket closed abruptly during opening handshake"), so they fail in
~6 s by the platform's side, not by waiting for the backend. That is the claimed impact as a user sees it (the event
is not applied / not received), but these probes do not show, while RabbitMQ is down, whether the backend itself
queues its activity events (the outbox) for later: that is accidentRecovery's. `live_updates` fails at the end of its
40 s wait: the change is saved, the open stream is never pushed it.

## Features of downImpact not checked

- rabbitMQ: account and organization deletions (`domain.user.deleted`, `user.deleted`, `domain.organization.deleted`):
  a probe would delete a person or an organization of the stack on each run. Same queue and consumer as
  `space_provisioning` and `settings_sync`, which are checked.
- smtp: digests (sent once a person has used their budget of 10 notification emails in 10 minutes, at the end of the
  window) and project invitations (an email to a new address each run). Same mailer and scheduler as the reminder's
  email, which is checked. The probe uses a reminder because reminders are not counted against that budget: an
  assignment's email would stop after 10 runs in 10 minutes.

## Probe notes (not findings)

- All the scripts call from one address. The backend checks at most 5 tokens of one address at once
  (`RATE_LIMIT_TOKEN_CHECKS_PER_ADDRESS`, a check cached 60 s): a parallel burst after a minute idle got 429 on 3
  scripts once. `api` (lib.sh) retries a 429 after 1 s, a few times; a person's browser does not meet this limit.
- A failing run purges what it created within a few seconds, so a reminder set while SMTP was down is not mailed once
  it is back (its task is gone): the scripts leave no pending email for accidentRecovery to observe.
- `settings_sync` sends a version in deciseconds since 2026-01-01: the backend stores it in a 32-bit integer (a version
  in epoch milliseconds was dead-lettered, `value ... is out of range for type integer`; one such message from the
  first try sits in `twake-tasks.dlq`).
