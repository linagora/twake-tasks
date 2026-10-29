# Operations

The backend serves Prometheus metrics on `GET /metrics`, on `HTTP_PORT`, unless `METRICS_ENABLED=false` (see [configuration](configuration.md)). Scrape every backend replica directly: the frontend's nginx proxies only `/api/`.

Errors go to Sentry, see [error reporting](error-reporting.md). A request id follows a change into its events and jobs, see [architecture](architecture.md).

## Metrics

HTTP:

- `http_requests_total{method,route,status}`
- `http_request_duration_seconds{method,route}`

Jobs (reminders, emails, purges, space repair):

- `jobs_run_total{kind,outcome}`, where `outcome` is `done`, `retried` or `dropped`. A job is dropped after its 10th failed attempt.
- `jobs_due{kind}`: jobs past their time and still waiting.
- `jobs_oldest_due_seconds{kind}`: how long the oldest of them has waited.

Outbox (the events the backend publishes):

- `outbox_published_total`, `outbox_publish_failures_total`
- `outbox_pending`, `outbox_oldest_pending_seconds`

Consumed events:

- `events_consumed_total{routing_key,outcome}`, where `outcome` is `processed`, `duplicate`, `unrouted`, `malformed`, `rejected`, `parked` or `failed`.
- `events_parked`: events waiting for a space the backend does not know yet.

Live updates:

- `live_streams_open`: board streams open on the replica.

Every replica reads the same database, so `jobs_due`, `jobs_oldest_due_seconds`, `outbox_pending`, `outbox_oldest_pending_seconds` and `events_parked` hold the same value on each one. Take their `max`, not their `sum`.

## Dashboards

- Requests: request rate and 5xx rate by `route`, and the 95th percentile of `http_request_duration_seconds`.
- Jobs: `max by (kind) (jobs_oldest_due_seconds)`, `max by (kind) (jobs_due)`, and `sum by (kind, outcome) (rate(jobs_run_total[5m]))`.
- Events: `max(outbox_oldest_pending_seconds)`, `rate(outbox_publish_failures_total[5m])`, `sum by (routing_key, outcome) (rate(events_consumed_total[5m]))` and `max(events_parked)`.
- Live: `sum(live_streams_open)`.

## Alert rules

```yaml
groups:
  - name: twake-tasks
    rules:
      - alert: TwakeTasksJobsLate
        expr: max by (kind) (jobs_oldest_due_seconds) > 600
        for: 10m
      - alert: TwakeTasksOutboxStuck
        expr: max(outbox_oldest_pending_seconds) > 300
      - alert: TwakeTasksJobsDropped
        expr: sum by (kind) (increase(jobs_run_total{outcome="dropped"}[1h])) > 0
      - alert: TwakeTasksEventsParked
        expr: max(events_parked) > 0
        for: 1h
      - alert: TwakeTasksServerErrors
        expr: >
          sum(rate(http_requests_total{status=~"5.."}[5m]))
            / sum(rate(http_requests_total[5m])) > 0.01
```

What each one means:

- Jobs late: reminders or emails of that kind go out more than 10 minutes late. Look for `jobs are late` and `job failed` in the logs.
- Outbox stuck: an event has waited more than 5 minutes to be published, so other apps see task changes late. Look for `relay failed`, and check RabbitMQ.
- Jobs dropped: a reminder or an email was given up on. Sentry has the `job dropped` event with its kind.
- Events parked: an event came for a space the backend has not received for an hour.
- Server errors: more than 1% of requests answer 5xx. Sentry groups them.
