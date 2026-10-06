import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))

/** Publishes an event the way ldap-rest's bridge does: AMQP routing key and id as headers. */
export function publishPlatformEvent(
  routingKey: string,
  body: { organizationId: string } & Record<string, unknown>
) {
  const headers = `amqp_routing_key:${routingKey},amqp_message_id:${randomUUID()}`
  execFileSync(
    'docker',
    [
      'compose',
      '-p',
      'twake-tasks-e2e',
      '-f',
      'docker-compose.yml',
      '-f',
      'e2e/docker-compose.e2e.yml',
      'exec',
      '-T',
      'kafka',
      '/opt/kafka/bin/kafka-console-producer.sh',
      '--bootstrap-server',
      'kafka:29092',
      '--topic',
      'twake.platform.events.v1',
      '--property',
      'parse.key=true',
      '--property',
      'key.separator=|',
      '--property',
      'parse.headers=true'
    ],
    {
      cwd: root,
      input: `${headers}\t${body.organizationId}|${JSON.stringify(body)}\n`
    }
  )
}
