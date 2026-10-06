import { KafkaJS } from '@confluentinc/kafka-javascript'
import type { Logger } from 'pino'
import type { Config } from '../config.ts'
import { TASKS_TOPIC, type OutgoingEvent } from '../events/envelope.ts'

type GlobalConfig = KafkaJS.ProducerConstructorConfig

export function connectionConfig(config: Config): GlobalConfig {
  const common = {
    'bootstrap.servers': config.KAFKA_BOOTSTRAP,
    'client.id': 'twake-tasks'
  }
  switch (config.KAFKA_SECURITY) {
    case 'plaintext':
      return { ...common, 'security.protocol': 'plaintext' }
    case 'ssl':
      return {
        ...common,
        'security.protocol': 'ssl',
        'ssl.ca.location': config.KAFKA_SSL_CA,
        'ssl.certificate.location': config.KAFKA_SSL_CERT,
        'ssl.key.location': config.KAFKA_SSL_KEY
      }
    case 'sasl_ssl':
      return {
        ...common,
        'security.protocol': 'sasl_ssl',
        'sasl.mechanisms': 'SCRAM-SHA-512',
        'sasl.username': config.KAFKA_SASL_USERNAME,
        'sasl.password': config.KAFKA_SASL_PASSWORD,
        ...(config.KAFKA_SSL_CA && { 'ssl.ca.location': config.KAFKA_SSL_CA })
      }
  }
}

function kafkaLogger(logger: Logger): KafkaJS.Logger {
  const child = logger.child({ component: 'kafka' })
  const adapter: KafkaJS.Logger = {
    info: (message, extra) => {
      child.info(extra ?? {}, message)
    },
    warn: (message, extra) => {
      child.warn(extra ?? {}, message)
    },
    error: (message, extra) => {
      child.error(extra ?? {}, message)
    },
    debug: (message, extra) => {
      child.debug(extra ?? {}, message)
    },
    namespace: () => adapter,
    setLogLevel: () => undefined
  }
  return adapter
}

export interface EventProducer {
  publish(key: string, event: OutgoingEvent): Promise<void>
  disconnect(): Promise<void>
}

export async function startProducer(
  config: Config,
  logger: Logger
): Promise<EventProducer> {
  const producer = new KafkaJS.Kafka().producer({
    ...connectionConfig(config),
    'enable.idempotence': true,
    acks: -1,
    kafkaJS: { logger: kafkaLogger(logger) }
  })
  await producer.connect()
  return {
    async publish(key, event) {
      await producer.send({
        topic: TASKS_TOPIC,
        messages: [
          {
            key,
            value: JSON.stringify(event),
            headers: { 'content-type': 'application/cloudevents+json' }
          }
        ]
      })
      logger.info(
        { topic: TASKS_TOPIC, type: event.type, id: event.id },
        'event published'
      )
    },
    disconnect: () => producer.disconnect()
  }
}
