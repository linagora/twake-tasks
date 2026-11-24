import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { inTenant, shareTransaction } from '../../infra/db.ts'
import { aUser, startApp } from '../../testing/app.ts'
import { anIdentity } from '../auth/testing.ts'
import { checkBoardAccess, roleOn } from './access.ts'

let api: Awaited<ReturnType<typeof startApp>>

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
})

async function aTask() {
  const user = aUser()
  const board = (
    await api.as(user).post('/boards', { name: 'Design', keyPrefix: 'DES' })
  ).json<{ id: string; sections: { id: string }[] }>()
  const task = (
    await api.as(user).post(`/boards/${board.id}/tasks`, {
      sectionId: board.sections[0]?.id,
      title: 'Logo'
    })
  ).json<{ id: string }>()
  return { user, boardId: board.id, taskId: task.id }
}

describe('board access', () => {
  it('checks a read and answers it in one transaction', async () => {
    const { user, boardId, taskId } = await aTask()
    const transactions = vi.spyOn(api.db, 'transaction')

    try {
      const read = await api
        .as(user)
        .get(`/boards/${boardId}/tasks/${taskId}/comments`)

      expect(read.statusCode).toBe(200)
      expect(transactions).toHaveBeenCalledOnce()
    } finally {
      transactions.mockRestore()
    }
  })

  it('reuses the role the route found for the stores in its transaction', async () => {
    const { user, boardId } = await aTask()
    const identity = anIdentity(user)

    await shareTransaction(api.db, identity, async () => {
      await checkBoardAccess(api.db)(
        identity,
        { boardId },
        { on: 'board', role: 'viewer' }
      )
      await inTenant(api.db, identity, async tx => {
        const select = vi.spyOn(tx, 'select')

        expect(await roleOn(tx, user.userId, boardId)).toBe('admin')
        expect(select).not.toHaveBeenCalled()
      })
    })
  })
})
