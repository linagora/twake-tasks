import { AwsClient } from 'aws4fetch'
import type { Logger } from 'pino'
import type { Config } from '../config.ts'

export interface StoredObject {
  body: Buffer
  contentType: string
}

/** Files kept outside the database, the same for every replica. */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<StoredObject | null>
  remove(key: string): Promise<void>
}

const TIMEOUT_MS = 10_000

export function s3Storage(options: {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  pathStyle: boolean
}): ObjectStorage {
  const client = new AwsClient({
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    service: 's3',
    region: options.region,
    retries: 2
  })
  const urlOf = (key: string) => {
    const url = new URL(options.endpoint)
    const base = url.pathname.replace(/\/$/, '')
    if (options.pathStyle) {
      url.pathname = `${base}/${options.bucket}/${key}`
    } else {
      url.hostname = `${options.bucket}.${url.hostname}`
      url.pathname = `${base}/${key}`
    }
    return url
  }
  const call = async (key: string, init: RequestInit) => {
    const response = await client.fetch(urlOf(key), {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!response.ok && response.status !== 404) {
      throw new Error(
        `object storage answered ${String(response.status)} to ${init.method ?? 'GET'} ${key}`
      )
    }
    return response
  }
  return {
    async put(key, body, contentType) {
      await call(key, {
        method: 'PUT',
        headers: { 'content-type': contentType },
        body: new Uint8Array(body)
      })
    },
    async get(key) {
      const response = await call(key, { method: 'GET' })
      if (response.status === 404) return null
      return {
        body: Buffer.from(await response.arrayBuffer()),
        contentType:
          response.headers.get('content-type') ?? 'application/octet-stream'
      }
    },
    async remove(key) {
      await call(key, { method: 'DELETE' })
    }
  }
}

export function createObjectStorage(
  config: Pick<
    Config,
    | 'S3_ENDPOINT'
    | 'S3_REGION'
    | 'S3_BUCKET'
    | 'S3_ACCESS_KEY_ID'
    | 'S3_SECRET_ACCESS_KEY'
    | 'S3_FORCE_PATH_STYLE'
  >,
  logger: Logger
): ObjectStorage | undefined {
  if (
    !config.S3_BUCKET ||
    !config.S3_ENDPOINT ||
    !config.S3_ACCESS_KEY_ID ||
    !config.S3_SECRET_ACCESS_KEY
  ) {
    logger.info('S3_BUCKET is not set, so boards take no picture of their own')
    return undefined
  }
  return s3Storage({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    bucket: config.S3_BUCKET,
    accessKeyId: config.S3_ACCESS_KEY_ID,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    pathStyle: config.S3_FORCE_PATH_STYLE
  })
}
