import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))

const publish = `
const { connect } = await import('amqplib')
const [exchange, routingKey, messageId, body] = process.argv.slice(1)
const connection = await connect(process.env.RABBITMQ_URL)
const channel = await connection.createConfirmChannel()
channel.publish(exchange, routingKey, Buffer.from(body), {
  messageId,
  persistent: true,
  contentType: 'application/json'
})
await channel.waitForConfirms()
await connection.close()
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
