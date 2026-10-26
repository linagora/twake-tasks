import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry
} from '@prometheus-io/client'

// Labels hold only bounded values, such as route templates and job kinds,
// never an id, an address or a URL.
export function createMetrics() {
  const registry = new Registry()
  collectDefaultMetrics({ register: registry })
  const registers = [registry]
  return {
    registry,
    httpRequests: new Counter({
      name: 'http_requests_total',
      help: 'HTTP requests answered',
      labelNames: ['method', 'route', 'status'],
      registers
    }),
    httpRequestDuration: new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Time to answer an HTTP request',
      labelNames: ['method', 'route'],
      registers
    }),
    jobsRun: new Counter({
      name: 'jobs_run_total',
      help: 'Jobs run, by outcome',
      labelNames: ['kind', 'outcome'],
      registers
    }),
    jobsDue: new Gauge({
      name: 'jobs_due',
      help: 'Jobs due and waiting',
      labelNames: ['kind'],
      registers
    }),
    jobsOldestDue: new Gauge({
      name: 'jobs_oldest_due_seconds',
      help: 'How long the oldest due job has waited',
      labelNames: ['kind'],
      registers
    }),
    outboxPublished: new Counter({
      name: 'outbox_published_total',
      help: 'Events published from the outbox',
      registers
    }),
    outboxPublishFailures: new Counter({
      name: 'outbox_publish_failures_total',
      help: 'Failed publications from the outbox',
      registers
    }),
    outboxPending: new Gauge({
      name: 'outbox_pending',
      help: 'Events waiting in the outbox',
      registers
    }),
    outboxOldestPending: new Gauge({
      name: 'outbox_oldest_pending_seconds',
      help: 'How long the oldest event has waited in the outbox',
      registers
    }),
    eventsConsumed: new Counter({
      name: 'events_consumed_total',
      help: 'RabbitMQ events consumed, by outcome',
      labelNames: ['routing_key', 'outcome'],
      registers
    }),
    eventsParked: new Gauge({
      name: 'events_parked',
      help: 'Events parked until their space is known',
      registers
    }),
    liveStreamsOpen: new Gauge({
      name: 'live_streams_open',
      help: 'Live board streams open on this replica',
      registers
    })
  }
}

export type Metrics = ReturnType<typeof createMetrics>
