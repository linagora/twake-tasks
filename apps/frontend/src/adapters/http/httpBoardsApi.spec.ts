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

  it('sends where the tasks go only when deleting a section with some', async () => {
    const send = backend(204)
    const api = httpBoardsApi(BASE, send)

    await api.deleteSection('b1', 's1')
    await api.deleteSection('b1', 's1', null)

    const [[empty], [emptied]] = send.mock.calls as [[Request], [Request]]
    expect(empty.method).toBe('DELETE')
    expect(empty.url).toBe(`${BASE}/api/boards/b1/sections/s1`)
    expect(empty.body).toBeNull()
    expect(await emptied.json()).toEqual({ tasksTo: null })
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

  it('reads board versions from the event stream, across chunks', async () => {
    const encoder = new TextEncoder()
    const chunks = [
      'id: 4\ndata: {"version":4}\n\n:\n\nid: 5\nda',
      'ta: {}\n\n'
    ]
    const send = vi.fn<Send>(() =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              for (const chunk of chunks)
                controller.enqueue(encoder.encode(chunk))
            }
          }),
          { headers: { 'content-type': 'text/event-stream' } }
        )
      )
    )
    const versions: number[] = []

    const stop = httpBoardsApi(BASE, send).watchBoard('b1', version => {
      versions.push(version)
    })

    await vi.waitFor(() => {
      expect(versions).toEqual([4, 5])
    })
    stop()
    const [request] = send.mock.calls[0] ?? []
    expect(request?.url).toBe(`${BASE}/api/boards/b1/events`)
  })

  it('previews a transfer by posting the target to the preview route', async () => {
    const preview = { droppedAssignees: [], createdLabels: ['Brand'] }
    const send = backend(200, preview)

    const result = await httpBoardsApi(BASE, send).previewTransfer('b1', 't1', {
      boardId: 'b2',
      sectionId: null
    })

    expect(result).toEqual(preview)
    const [request] = send.mock.calls[0] ?? []
    expect(request?.method).toBe('POST')
    expect(request?.url).toBe(`${BASE}/api/boards/b1/tasks/t1/transfer/preview`)
  })
})
