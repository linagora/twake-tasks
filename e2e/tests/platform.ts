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

/** Publishes a space event the way ldap-rest does, on its `space` exchange. */
export function publishPlatformEvent(
  routingKey: `twake.space.${string}`,
  body: { organizationId: string } & Record<string, unknown>
) {
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
      'backend',
      'node',
      '--input-type=module',
      '-e',
      publish,
      'space',
      routingKey,
      randomUUID(),
      JSON.stringify(body)
    ],
    { cwd: root }
  )
}
