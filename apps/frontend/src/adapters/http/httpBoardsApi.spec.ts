import { describe, expect, it, vi } from 'vitest'

import { httpBoardsApi, type Send } from '@/adapters/http/httpBoardsApi'
import { ApiError } from '@/application/boards'

function backend(status: number, body?: unknown) {
  return vi.fn<Send>(() =>
    Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
      })
    )
  )
}

const BASE = 'https://tasks.example.com'

describe('httpBoardsApi', () => {
  it('lists boards from /api/boards', async () => {
    const send = backend(200, { boards: [{ id: 'b1', name: 'Design' }] })

    const boards = await httpBoardsApi(BASE, send).listBoards()

    expect(boards).toEqual([{ id: 'b1', name: 'Design' }])
    const [request] = send.mock.calls[0] ?? []
    expect(request?.method).toBe('GET')
    expect(request?.url).toBe(`${BASE}/api/boards`)
  })

  it('posts a new board as JSON', async () => {
    const send = backend(201, { id: 'b1', name: 'Design' })

    await httpBoardsApi(BASE, send).createBoard({
      name: 'Design',
      keyPrefix: 'DES'
    })

    const [request] = send.mock.calls[0] ?? []
    expect(request?.method).toBe('POST')
    expect(request?.url).toBe(`${BASE}/api/boards`)
    expect(request?.headers.get('content-type')).toBe('application/json')
    expect(await request?.json()).toEqual({ name: 'Design', keyPrefix: 'DES' })
  })

  it('moves a task and accepts an empty answer', async () => {
    const send = backend(204)

    await expect(
      httpBoardsApi(BASE, send).moveTask('b1', 't1', {
        sectionId: null,
        beforeId: 't2'
      })
    ).resolves.toBeUndefined()

    const [request] = send.mock.calls[0] ?? []
    expect(request?.url).toBe(`${BASE}/api/boards/b1/tasks/t1/move`)
  })

  it('rejects with the status and code the backend refused with', async () => {
    const send = backend(409, { error: 'key_prefix_taken' })

    const created = httpBoardsApi(BASE, send).createBoard({
      name: 'Design',
      keyPrefix: 'DES'
    })

    await expect(created).rejects.toEqual(new ApiError(409, 'key_prefix_taken'))
  })

  it('rejects without a code when the answer has no body', async () => {
    const send = backend(502)

    await expect(httpBoardsApi(BASE, send).getBoard('b1')).rejects.toEqual(
      new ApiError(502, null)
    )
  })
})
