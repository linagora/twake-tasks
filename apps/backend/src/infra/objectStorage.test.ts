import { AwsClient } from 'aws4fetch'
import {
  GenericContainer,
  Wait,
  type StartedTestContainer
} from 'testcontainers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { s3Storage, type ObjectStorage } from './objectStorage.ts'

const credentials = { accessKeyId: 'minio', secretAccessKey: 'minio-secret' }

describe('the S3 storage, on MinIO', () => {
  let container: StartedTestContainer
  let storage: ObjectStorage

  beforeAll(async () => {
    container = await new GenericContainer(
      'minio/minio:RELEASE.2025-02-28T09-55-16Z'
    )
      .withCommand(['server', '/data'])
      .withEnvironment({
        MINIO_ROOT_USER: credentials.accessKeyId,
        MINIO_ROOT_PASSWORD: credentials.secretAccessKey
      })
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp('/minio/health/ready', 9000))
      .start()
    const endpoint = `http://${container.getHost()}:${String(container.getMappedPort(9000))}`
    const created = await new AwsClient({
      ...credentials,
      service: 's3',
      region: 'us-east-1'
    }).fetch(`${endpoint}/covers`, { method: 'PUT' })
    expect(created.ok).toBe(true)
    storage = s3Storage({
      ...credentials,
      endpoint,
      region: 'us-east-1',
      bucket: 'covers',
      pathStyle: true
    })
  })

  afterAll(async () => {
    await container.stop()
  })

  it('gives back what it keeps, with its type, until it is removed', async () => {
    const picture = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

    await storage.put('covers/a', picture, 'image/jpeg')

    expect(await storage.get('covers/a')).toEqual({
      body: picture,
      contentType: 'image/jpeg'
    })
    await storage.remove('covers/a')
    expect(await storage.get('covers/a')).toBeNull()
  })

  it('removes what it never kept without failing', async () => {
    await expect(storage.remove('covers/never')).resolves.toBeUndefined()
  })
})
