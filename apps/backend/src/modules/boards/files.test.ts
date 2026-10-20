import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import { aUser, joinBoard, startApp, type TestUser } from '../../testing/app.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

interface Listed {
  id: string
  url: string
  name: string
  mimeType: string | null
  size: number | null
  addedBy: string
}

const report = {
  url: 'https://alice-drive.example.com/public?sharecode=abc',
  name: 'report.pdf',
  mimeType: 'application/pdf',
  size: 1200,
  driveFileId: 'file-1'
}

async function aTaskOf(owner: TestUser) {
  const board = (
    await api.as(owner).post('/boards', { name: 'Design', keyPrefix: 'DES' })
  ).json<{ id: string }>()
  const task = (
    await api
      .as(owner)
      .post(`/boards/${board.id}/tasks`, { sectionId: null, title: 'Logo' })
  ).json<{ id: string }>()
  const path = `/boards/${board.id}/tasks/${task.id}/files`
  const filesOf = async (viewer: TestUser) =>
    (await api.as(viewer).get(path)).json<{ files: Listed[] }>().files
  return { boardId: board.id, taskId: task.id, path, filesOf }
}

describe('task files', () => {
  it('lists the links added, oldest first, with who added them', async () => {
    const alice = aUser()
    const { path, filesOf } = await aTaskOf(alice)

    const added = await api.as(alice).post(path, {
      files: [report, { url: 'https://drive.example.com/b', name: 'logo.svg' }]
    })

    expect(added.statusCode).toBe(201)
    expect((await filesOf(alice)).map(file => file.name)).toEqual([
      'report.pdf',
      'logo.svg'
    ])
    expect((await filesOf(alice))[0]).toMatchObject({
      url: report.url,
      mimeType: 'application/pdf',
      size: 1200,
      addedBy: alice.userId
    })
  })

  it('lets viewers see the files but not change them', async () => {
    const alice = aUser()
    const viewer = aUser({ organizationId: alice.organizationId })
    const { boardId, path, filesOf } = await aTaskOf(alice)
    await joinBoard(db, alice, boardId, viewer, 'viewer')
    await api.as(alice).post(path, { files: [report] })

    expect(await filesOf(viewer)).toHaveLength(1)
    expect(
      (await api.as(viewer).post(path, { files: [report] })).statusCode
    ).toBe(403)
    const [file] = await filesOf(viewer)
    expect(
      (await api.as(viewer).delete(`${path}/${file?.id ?? ''}`)).statusCode
    ).toBe(403)
  })

  it('hides the files from outsiders', async () => {
    const alice = aUser()
    const outsider = aUser({ organizationId: alice.organizationId })
    const { path } = await aTaskOf(alice)
    await api.as(alice).post(path, { files: [report] })

    expect((await api.as(outsider).get(path)).statusCode).toBe(404)
  })

  it('removes the link of a file', async () => {
    const alice = aUser()
    const { path, filesOf } = await aTaskOf(alice)
    await api.as(alice).post(path, { files: [report] })
    const [file] = await filesOf(alice)

    const removed = await api.as(alice).delete(`${path}/${file?.id ?? ''}`)

    expect(removed.statusCode).toBe(204)
    expect(await filesOf(alice)).toEqual([])
  })

  it('refuses links that are not https, and names nobody can read', async () => {
    const alice = aUser()
    const { path } = await aTaskOf(alice)

    for (const file of [
      { ...report, url: 'http://drive.example.com/a' },
      { ...report, url: 'javascript:alert(1)' },
      { ...report, name: '' },
      { ...report, name: 'evil‮txt.exe' },
      { ...report, name: 'a'.repeat(256) }
    ]) {
      expect(
        (await api.as(alice).post(path, { files: [file] })).statusCode
      ).toBe(400)
    }
  })

  it('keeps a task to 50 files', async () => {
    const alice = aUser()
    const { path } = await aTaskOf(alice)
    await api
      .as(alice)
      .post(path, { files: Array.from({ length: 49 }, () => report) })

    const tooMany = await api.as(alice).post(path, { files: [report, report] })

    expect(tooMany.statusCode).toBe(409)
    expect(tooMany.json()).toEqual({ error: 'too_many_files' })
    expect(
      (await api.as(alice).post(path, { files: [report] })).statusCode
    ).toBe(201)
  })

  it('refuses changes on an archived board', async () => {
    const alice = aUser()
    const { boardId, path } = await aTaskOf(alice)
    await api.as(alice).post(`/boards/${boardId}/archive`, {})

    expect(
      (await api.as(alice).post(path, { files: [report] })).statusCode
    ).toBe(409)
  })
})
