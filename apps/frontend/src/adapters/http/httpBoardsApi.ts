import { ApiError, type BoardsApi } from '@/application/boards'
import type { BoardSummary } from '@/domain/board'

export type Send = (request: Request) => Promise<Response>

async function errorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json()
    return typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
      ? body.error
      : null
  } catch {
    return null
  }
}

export function httpBoardsApi(baseUrl: string, send: Send): BoardsApi {
  async function call<T>(method: string, path: string, body?: object) {
    const response = await send(
      new Request(new URL(`/api${path}`, baseUrl), {
        method,
        ...(body && {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        })
      })
    )
    if (!response.ok) {
      throw new ApiError(response.status, await errorCode(response))
    }
    return (response.status === 204 ? undefined : await response.json()) as T
  }

  return {
    listBoards: async () =>
      (await call<{ boards: BoardSummary[] }>('GET', '/boards')).boards,
    getBoard: boardId => call('GET', `/boards/${boardId}`),
    createBoard: board => call('POST', '/boards', board),
    setFavorite: (boardId, favorite) =>
      call(favorite ? 'PUT' : 'DELETE', `/boards/${boardId}/favorite`),
    createTask: (boardId, task) =>
      call('POST', `/boards/${boardId}/tasks`, task),
    moveTask: (boardId, taskId, move) =>
      call('POST', `/boards/${boardId}/tasks/${taskId}/move`, move),
    setAssignees: (boardId, taskId, userIds) =>
      call('PUT', `/boards/${boardId}/tasks/${taskId}/assignees`, { userIds }),
    createSection: (boardId, section) =>
      call('POST', `/boards/${boardId}/sections`, section),
    editSection: (boardId, sectionId, changes) =>
      call('PATCH', `/boards/${boardId}/sections/${sectionId}`, changes),
    moveSection: (boardId, sectionId, move) =>
      call('POST', `/boards/${boardId}/sections/${sectionId}/move`, move),
    deleteSection: (boardId, sectionId, tasksTo) =>
      call(
        'DELETE',
        `/boards/${boardId}/sections/${sectionId}`,
        tasksTo === undefined ? undefined : { tasksTo }
      )
  }
}
