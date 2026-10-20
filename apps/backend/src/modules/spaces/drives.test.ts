import { randomUUID } from 'node:crypto'
import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import type { PlatformEvent } from '../../events/envelope.ts'
import { NotYetKnownError } from '../../events/router.ts'
import { createDb, inTenant } from '../../infra/db.ts'
import {
  aBoardIn,
  aManagedProject,
  aUser,
  startApp,
  type TestUser
} from '../../testing/app.ts'
import { driveRoutes } from './drives.ts'
import { spaces } from './schema.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

function deliver(type: string, body: object) {
  const handler = driveRoutes.get(type)
  if (!handler) throw new Error(`no handler for ${type}`)
  const event: PlatformEvent = {
    routingKey: type,
    messageId: randomUUID(),
    body
  }
  return db.transaction(tx => handler(event, tx, pino({ level: 'silent' })))
}

const ready = (
  organizationId: string,
  spaceId: string,
  revision: number,
  driveId: string,
  source = 'twake-space'
) => ({
  specversion: '1.0',
  type: 'com.twake.drive.org_drive.ready.v1',
  source: 'twake://drive',
  twakeorg: organizationId,
  data: {
    reference: { source, id: spaceId },
    revision,
    drive: { id: driveId }
  }
})

async function aSpaceBoard() {
  const alice = aUser()
  const projectId = await aManagedProject(db, [[alice, 'editor']])
  const spaceId = randomUUID()
  await inTenant(db, alice, tx =>
    tx.insert(spaces).values({
      id: spaceId,
      organizationId: alice.organizationId ?? '',
      projectId
    })
  )
  const boardId = await aBoardIn(db, alice, projectId, {
    name: 'Launch',
    keyPrefix: 'LAU'
  })
  return { alice, spaceId, boardId }
}

const teamDriveOf = async (user: TestUser, boardId: string) =>
  (await api.as(user).get(`/boards/${boardId}`)).json<{
    teamDriveId: string | null
  }>().teamDriveId

describe('team drives of the spaces', () => {
  it('gives the board of a space the drive the platform made for it', async () => {
    const { alice, spaceId, boardId } = await aSpaceBoard()
    expect(await teamDriveOf(alice, boardId)).toBe(null)

    await deliver(
      'com.twake.drive.org_drive.ready.v1',
      ready(alice.organizationId ?? '', spaceId, 3, 'drive-1')
    )

    expect(await teamDriveOf(alice, boardId)).toBe('drive-1')
  })

  it('keeps the newest reply when they come out of order', async () => {
    const { alice, spaceId, boardId } = await aSpaceBoard()
    const org = alice.organizationId ?? ''

    await deliver(
      'com.twake.drive.org_drive.ready.v1',
      ready(org, spaceId, 5, 'drive-new')
    )
    await deliver(
      'com.twake.drive.org_drive.ready.v1',
      ready(org, spaceId, 4, 'drive-old')
    )

    expect(await teamDriveOf(alice, boardId)).toBe('drive-new')
  })

  it('forgets the drive once the platform removed it', async () => {
    const { alice, spaceId, boardId } = await aSpaceBoard()
    const org = alice.organizationId ?? ''
    await deliver(
      'com.twake.drive.org_drive.ready.v1',
      ready(org, spaceId, 1, 'drive-1')
    )

    await deliver('com.twake.drive.org_drive.removed.v1', {
      type: 'com.twake.drive.org_drive.removed.v1',
      twakeorg: org,
      data: { reference: { source: 'twake-space', id: spaceId }, revision: 2 }
    })

    expect(await teamDriveOf(alice, boardId)).toBe(null)
  })

  it('leaves the drives of other apps alone', async () => {
    const { alice, spaceId, boardId } = await aSpaceBoard()

    await deliver(
      'com.twake.drive.org_drive.ready.v1',
      ready(alice.organizationId ?? '', spaceId, 1, 'drive-1', 'other-app')
    )

    expect(await teamDriveOf(alice, boardId)).toBe(null)
  })

  it('waits for a space it does not know yet', async () => {
    const alice = aUser()

    await expect(
      deliver(
        'com.twake.drive.org_drive.ready.v1',
        ready(alice.organizationId ?? '', randomUUID(), 1, 'drive-1')
      )
    ).rejects.toBeInstanceOf(NotYetKnownError)
  })

  it('gives no drive to a board outside any space', async () => {
    const alice = aUser()
    const board = (
      await api.as(alice).post('/boards', { name: 'Design', keyPrefix: 'DES' })
    ).json<{ id: string }>()

    expect(await teamDriveOf(alice, board.id)).toBe(null)
  })
})
