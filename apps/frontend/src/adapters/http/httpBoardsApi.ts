import {
  ApiError,
  type AgendaTask,
  type HiddenTask,
  type Notification,
  type SavedFilter,
  type Project,
  type BoardsApi,
  type Comment,
  type Reminder,
  type HistoryEntry,
  type SearchResult
} from '@/application/boards'
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

const RETRY_MS = 1000
const MAX_RETRY_MS = 30_000

// The stream's messages each carry the board version as their id.
async function readVersions(
  body: ReadableStream<Uint8Array>,
  onVersion: (version: number) => void
) {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true })
    const messages = buffer.split('\n\n')
    buffer = messages.pop() ?? ''
    for (const message of messages) {
      const id = message
        .split('\n')
        .find(line => line.startsWith('id:'))
        ?.slice(3)
        .trim()
      if (id) onVersion(Number(id))
    }
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
    agenda: (zone, days) =>
      call(
        'GET',
        `/agenda?${new URLSearchParams({ zone, days: String(days) }).toString()}`
      ),
    listFilters: async () =>
      (await call<{ filters: SavedFilter[] }>('GET', '/filters')).filters,
    createFilter: filter => call('POST', '/filters', filter),
    deleteFilter: filterId => call('DELETE', `/filters/${filterId}`),
    labelNames: async () =>
      (await call<{ labels: string[] }>('GET', '/labels')).labels,
    filteredTasks: async (filterId, zone) =>
      (
        await call<{ tasks: AgendaTask[] }>(
          'GET',
          `/filters/${filterId}/tasks?${new URLSearchParams({ zone }).toString()}`
        )
      ).tasks,
    search: async text =>
      (
        await call<{ tasks: SearchResult[] }>(
          'GET',
          `/search?${new URLSearchParams({ q: text }).toString()}`
        )
      ).tasks,
    myTasks: async () =>
      (await call<{ tasks: AgendaTask[] }>('GET', '/my-tasks')).tasks,
    listBoards: async () =>
      (await call<{ boards: BoardSummary[] }>('GET', '/boards')).boards,
    getBoard: boardId => call('GET', `/boards/${boardId}`),
    watchBoard(boardId, onVersion) {
      const stop = new AbortController()
      void (async () => {
        let delay = RETRY_MS
        while (!stop.signal.aborted) {
          try {
            const response = await send(
              new Request(new URL(`/api/boards/${boardId}/events`, baseUrl), {
                signal: stop.signal
              })
            )
            if (response.ok && response.body) {
              delay = RETRY_MS
              await readVersions(response.body, onVersion)
            }
          } catch {
            // Dropped: reconnect below, unless stopped.
          }
          await new Promise(resolve => setTimeout(resolve, delay))
          delay = Math.min(delay * 2, MAX_RETRY_MS)
        }
      })()
      return () => {
        stop.abort()
      }
    },
    createBoard: board => call('POST', '/boards', board),
    transferTask: (boardId, taskId, to) =>
      call('POST', `/boards/${boardId}/tasks/${taskId}/transfer`, to),
    archiveTask: (boardId, taskId) =>
      call('POST', `/boards/${boardId}/tasks/${taskId}/archive`, {}),
    trashTask: (boardId, taskId) =>
      call('DELETE', `/boards/${boardId}/tasks/${taskId}`),
    restoreTask: (boardId, taskId) =>
      call('POST', `/boards/${boardId}/tasks/${taskId}/restore`, {}),
    hiddenTasks: async (boardId, shelf) =>
      (
        await call<{ tasks: HiddenTask[] }>(
          'GET',
          `/boards/${boardId}/${shelf}`
        )
      ).tasks,
    setBoardArchived: (boardId, archived) =>
      call(
        'POST',
        `/boards/${boardId}/${archived ? 'archive' : 'unarchive'}`,
        {}
      ),
    listProjects: async () =>
      (await call<{ projects: Project[] }>('GET', '/projects')).projects,
    moveToProject: (boardId, projectId) =>
      call('POST', `/boards/${boardId}/move`, { projectId }),
    getSharing: boardId => call('GET', `/boards/${boardId}/sharing`),
    invite: (boardId, email, role) =>
      call('POST', `/boards/${boardId}/invites`, { email, role }),
    cancelInvite: (boardId, inviteId) =>
      call('DELETE', `/boards/${boardId}/invites/${inviteId}`),
    setMemberRole: (boardId, userId, role) =>
      call('PUT', `/boards/${boardId}/members/${userId}`, { role }),
    removeMember: (boardId, userId) =>
      call('DELETE', `/boards/${boardId}/members/${userId}`),
    setLayout: (boardId, layout) =>
      call('PUT', `/boards/${boardId}/layout`, { layout }),
    setDefaultLayout: (boardId, layout) =>
      call('PUT', `/boards/${boardId}/default-layout`, { layout }),
    setFavorite: (boardId, favorite) =>
      call(favorite ? 'PUT' : 'DELETE', `/boards/${boardId}/favorite`),
    createTask: (boardId, task) =>
      call('POST', `/boards/${boardId}/tasks`, task),
    moveTask: (boardId, taskId, move) =>
      call('POST', `/boards/${boardId}/tasks/${taskId}/move`, move),
    completeTask: (boardId, taskId, state) =>
      call('POST', `/boards/${boardId}/tasks/${taskId}/complete`, { state }),
    editTask: (boardId, taskId, changes) =>
      call('PATCH', `/boards/${boardId}/tasks/${taskId}`, changes),
    getDescription: (boardId, taskId) =>
      call('GET', `/boards/${boardId}/tasks/${taskId}/description`),
    setDescription: (boardId, taskId, edit) =>
      call('PUT', `/boards/${boardId}/tasks/${taskId}/description`, edit),
    listHistory: async (boardId, taskId) =>
      (
        await call<{ entries: HistoryEntry[] }>(
          'GET',
          `/boards/${boardId}/tasks/${taskId}/history`
        )
      ).entries,
    listComments: async (boardId, taskId) =>
      (
        await call<{ comments: Comment[] }>(
          'GET',
          `/boards/${boardId}/tasks/${taskId}/comments`
        )
      ).comments,
    addComment: async (boardId, taskId, body) => {
      await call('POST', `/boards/${boardId}/tasks/${taskId}/comments`, {
        body
      })
    },
    listReminders: async (boardId, taskId) =>
      (
        await call<{ reminders: Reminder[] }>(
          'GET',
          `/boards/${boardId}/tasks/${taskId}/reminders`
        )
      ).reminders,
    addReminder: async (boardId, taskId, reminder) => {
      await call(
        'POST',
        `/boards/${boardId}/tasks/${taskId}/reminders`,
        reminder
      )
    },
    deleteReminder: (boardId, taskId, reminderId) =>
      call(
        'DELETE',
        `/boards/${boardId}/tasks/${taskId}/reminders/${reminderId}`
      ),
    following: async (boardId, taskId) =>
      (
        await call<{ following: boolean }>(
          'GET',
          `/boards/${boardId}/tasks/${taskId}/follow`
        )
      ).following,
    setFollowing: (boardId, taskId, following) =>
      call(
        following ? 'PUT' : 'DELETE',
        `/boards/${boardId}/tasks/${taskId}/follow`
      ),
    listNotifications: async () =>
      (await call<{ notifications: Notification[] }>('GET', '/notifications'))
        .notifications,
    markNotificationsRead: () => call('POST', '/notifications/read', {}),
    setAssignees: (boardId, taskId, userIds) =>
      call('PUT', `/boards/${boardId}/tasks/${taskId}/assignees`, { userIds }),
    createLabel: (boardId, name) =>
      call('POST', `/boards/${boardId}/labels`, { name }),
    setLabels: (boardId, taskId, labelIds) =>
      call('PUT', `/boards/${boardId}/tasks/${taskId}/labels`, { labelIds }),
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
