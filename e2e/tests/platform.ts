import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))

const publish = `
const { RabbitMQClient } = await import('@linagora/rabbitmq-client')
const [exchange, routingKey, messageId, body] = process.argv.slice(1)
const client = new RabbitMQClient({ url: process.env.RABBITMQ_URL })
await client.init()
await client.publish(exchange, routingKey, JSON.parse(body), { messageId })
await client.close()
`

const provisionedProject = `
const { default: postgres } = await import('postgres')
const sql = postgres(process.env.DATABASE_URL)
const [row] = await sql\`
  select event -> 'data' -> 'resource' ->> 'id' as id from outbox
  where event ->> 'type' = 'com.twake.tasks.space.provisioned.v1'
    and event -> 'data' ->> 'space_id' = \${process.argv[1]}\`
await sql.end()
process.stdout.write(row?.id ?? '')
`

function inBackend(script: string, ...args: string[]) {
  return execFileSync(
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
      'backend',
      'node',
      '--input-type=module',
      '-e',
      script,
      ...args
    ],
    { cwd: root, encoding: 'utf8' }
  )
}

/** Publishes a space event the way ldap-rest does, on its `space` exchange. */
export function publishPlatformEvent(
  routingKey: `twake.space.${string}`,
  body: { organizationId: string } & Record<string, unknown>
) {
  inBackend(publish, 'space', routingKey, randomUUID(), JSON.stringify(body))
}

/** The project id TwakeSpace learns from the space's provisioned event. */
export function projectOfSpace(spaceId: string) {
  return inBackend(provisionedProject, spaceId)
}
