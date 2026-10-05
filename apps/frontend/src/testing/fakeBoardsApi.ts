import { vi } from 'vitest'

import {
  ApiError,
  type BoardsApi,
  type Comment,
  type Description,
  type HistoryEntry,
  type Reminder
} from '@/application/boards'
import type { Board, BoardSummary, Section, Task } from '@/domain/board'

let counter = 0
const nextId = () => {
  counter += 1
  return `00000000-0000-7000-8000-${String(counter).padStart(12, '0')}`
}

export function aBoard(overrides: Partial<Board> = {}): Board {
  return {
    id: nextId(),
    name: 'Design',
    keyPrefix: 'DES',
    spaceId: null,
    inbox: false,
    archived: false,
    version: 1,
    role: 'admin',
    members: [],
    labels: [],
    sections: [
      { id: nextId(), name: 'To do', category: 'unstarted' },
      { id: nextId(), name: 'In progress', category: 'started' },
      { id: nextId(), name: 'Done', category: 'completed' }
    ],
    tasks: [],
    ...overrides
  }
}

export function aTask(section: Section | null, overrides: Partial<Task> = {}) {
  return {
    id: nextId(),
    key: 'DES-1',
    sectionId: section?.id ?? null,
    parentId: null,
    title: 'Logo',
    priority: null,
    dueDate: null,
    dueTime: null,
    dueZone: null,
    deadline: null,
    duration: null,
    recurrence: null,
    completedAt: null,
    canceledAt: null,
    assignees: [],
    labels: [],
    ...overrides
  } satisfies Task
}

function summaryOf(board: Board, favorite = false): BoardSummary {
  return {
    id: board.id,
    name: board.name,
    keyPrefix: board.keyPrefix,
    spaceId: board.spaceId,
    inbox: board.inbox,
    role: board.role,
    archived: board.archived,
    favorite
  }
}

function sectionOf(board: Board, sectionId: string) {
  const section = board.sections.find(candidate => candidate.id === sectionId)
  if (!section) throw new ApiError(404, 'not_found')
  return section
}

export function fakeBoardsApi(boards: Board[] = []) {
  const store = new Map(boards.map(board => [board.id, board]))
  const find = (boardId: string) => {
    const board = store.get(boardId)
    if (!board) throw new ApiError(404, 'not_found')
    return board
  }

  const favorites = new Set<string>()
  const descriptions = new Map<string, Description>()
  const comments = new Map<string, Comment[]>()
  const history = new Map<string, HistoryEntry[]>()
  const reminders = new Map<string, Reminder[]>()
  const findTask = (boardId: string, taskId: string) => {
    const task = find(boardId).tasks.find(candidate => candidate.id === taskId)
    if (!task) throw new ApiError(404, 'not_found')
    return task
  }

  const api = {
    listBoards: vi.fn(() =>
      Promise.resolve(
        [...store.values()]
          .map(board => summaryOf(board, favorites.has(board.id)))
          .sort((a, b) => Number(b.favorite) - Number(a.favorite))
      )
    ),
    setFavorite: vi.fn<BoardsApi['setFavorite']>((boardId, favorite) =>
      Promise.resolve().then(() => {
        find(boardId)
        if (favorite) favorites.add(boardId)
        else favorites.delete(boardId)
      })
    ),
    getBoard: vi.fn((boardId: string) =>
      Promise.resolve().then(() => structuredClone(find(boardId)))
    ),
    createBoard: vi.fn<BoardsApi['createBoard']>(({ name, keyPrefix }) => {
      const taken = [...store.values()].some(
        board => board.keyPrefix === keyPrefix
      )
      if (taken) return Promise.reject(new ApiError(409, 'key_prefix_taken'))
      const board = aBoard({ name, keyPrefix })
      store.set(board.id, board)
      return Promise.resolve(structuredClone(board))
    }),
    createTask: vi.fn<BoardsApi['createTask']>((boardId, input) =>
      Promise.resolve().then(() => {
        const board = find(boardId)
        const task = aTask(null, {
          sectionId: 'sectionId' in input ? input.sectionId : null,
          parentId: 'parentId' in input ? input.parentId : null,
          title: input.title,
          key: `${board.keyPrefix}-${String(board.tasks.length + 1)}`
        })
        board.tasks.push(task)
        board.version += 1
        return {
          id: task.id,
          key: task.key,
          title: task.title,
          sectionId: task.sectionId
        }
      })
    ),
    completeTask: vi.fn<BoardsApi['completeTask']>((boardId, taskId, state) =>
      Promise.resolve().then(() => {
        const task = findTask(boardId, taskId)
        const now = new Date().toISOString()
        task.completedAt = state === 'completed' ? now : null
        task.canceledAt = state === 'canceled' ? now : null
      })
    ),
    moveTask: vi.fn<BoardsApi['moveTask']>((boardId, taskId, move) =>
      Promise.resolve().then(() => {
        const board = find(boardId)
        const task = board.tasks.find(candidate => candidate.id === taskId)
        if (!task) throw new ApiError(404, 'not_found')
        board.tasks = board.tasks.filter(candidate => candidate !== task)
        task.sectionId = move.sectionId
        const anchor = move.beforeId ?? null
        const index = anchor
          ? board.tasks.findIndex(candidate => candidate.id === anchor)
          : -1
        if (index < 0) board.tasks.push(task)
        else board.tasks.splice(index, 0, task)
        board.version += 1
      })
    ),
    editTask: vi.fn<BoardsApi['editTask']>((boardId, taskId, changes) =>
      Promise.resolve().then(() => {
        Object.assign(findTask(boardId, taskId), changes)
      })
    ),
    getDescription: vi.fn<BoardsApi['getDescription']>((boardId, taskId) =>
      Promise.resolve().then(() => {
        findTask(boardId, taskId)
        return descriptions.get(taskId) ?? { markdown: '', version: 0 }
      })
    ),
    setDescription: vi.fn<BoardsApi['setDescription']>(
      (boardId, taskId, { markdown, version }) =>
        Promise.resolve().then(() => {
          findTask(boardId, taskId)
          if ((descriptions.get(taskId)?.version ?? 0) !== version) {
            throw new ApiError(409, 'stale_version')
          }
          descriptions.set(taskId, { markdown, version: version + 1 })
          return { version: version + 1 }
        })
    ),
    listHistory: vi.fn<BoardsApi['listHistory']>((boardId, taskId) =>
      Promise.resolve().then(() => {
        findTask(boardId, taskId)
        return structuredClone(history.get(taskId) ?? [])
      })
    ),
    listReminders: vi.fn<BoardsApi['listReminders']>((boardId, taskId) =>
      Promise.resolve().then(() => {
        findTask(boardId, taskId)
        return structuredClone(reminders.get(taskId) ?? [])
      })
    ),
    addReminder: vi.fn<BoardsApi['addReminder']>((boardId, taskId, reminder) =>
      Promise.resolve().then(() => {
        findTask(boardId, taskId)
        const at = 'at' in reminder ? reminder.at : null
        reminders.set(taskId, [
          ...(reminders.get(taskId) ?? []),
          {
            id: nextId(),
            at,
            beforeMinutes:
              'beforeMinutes' in reminder ? reminder.beforeMinutes : null,
            firesAt: at
          }
        ])
      })
    ),
    deleteReminder: vi.fn<BoardsApi['deleteReminder']>(
      (boardId, taskId, reminderId) =>
        Promise.resolve().then(() => {
          findTask(boardId, taskId)
          reminders.set(
            taskId,
            (reminders.get(taskId) ?? []).filter(
              reminder => reminder.id !== reminderId
            )
          )
        })
    ),
    listComments: vi.fn<BoardsApi['listComments']>((boardId, taskId) =>
      Promise.resolve().then(() => {
        findTask(boardId, taskId)
        return structuredClone(comments.get(taskId) ?? [])
      })
    ),
    addComment: vi.fn<BoardsApi['addComment']>((boardId, taskId, body) =>
      Promise.resolve().then(() => {
        findTask(boardId, taskId)
        comments.set(taskId, [
          ...(comments.get(taskId) ?? []),
          {
            id: nextId(),
            author: { userId: 'me', email: 'me@example.com' },
            body,
            createdAt: new Date().toISOString()
          }
        ])
      })
    ),
    setAssignees: vi.fn<BoardsApi['setAssignees']>((boardId, taskId, userIds) =>
      Promise.resolve().then(() => {
        const board = find(boardId)
        const task = board.tasks.find(candidate => candidate.id === taskId)
        if (!task) throw new ApiError(404, 'not_found')
        task.assignees = board.members.filter(member =>
          userIds.includes(member.userId)
        )
      })
    ),
    createLabel: vi.fn<BoardsApi['createLabel']>((boardId, name) =>
      Promise.resolve().then(() => {
        const board = find(boardId)
        if (board.labels.some(label => label.name === name)) {
          throw new ApiError(409, 'label_taken')
        }
        const label = { id: nextId(), name }
        board.labels.push(label)
        return label
      })
    ),
    setLabels: vi.fn<BoardsApi['setLabels']>((boardId, taskId, labelIds) =>
      Promise.resolve().then(() => {
        const board = find(boardId)
        findTask(boardId, taskId).labels = board.labels.filter(label =>
          labelIds.includes(label.id)
        )
      })
    ),
    createSection: vi.fn<BoardsApi['createSection']>(
      (boardId, { name, category, afterId }) =>
        Promise.resolve().then(() => {
          const board = find(boardId)
          const section = { id: nextId(), name, category }
          const after = board.sections.findIndex(
            candidate => candidate.id === afterId
          )
          board.sections.splice(
            after < 0 ? board.sections.length : after + 1,
            0,
            section
          )
          return section
        })
    ),
    editSection: vi.fn<BoardsApi['editSection']>(
      (boardId, sectionId, changes) =>
        Promise.resolve().then(() => {
          const section = sectionOf(find(boardId), sectionId)
          Object.assign(section, changes)
        })
    ),
    moveSection: vi.fn<BoardsApi['moveSection']>((boardId, sectionId, move) =>
      Promise.resolve().then(() => {
        const board = find(boardId)
        const section = sectionOf(board, sectionId)
        board.sections = board.sections.filter(other => other !== section)
        const at = move.beforeId
          ? board.sections.findIndex(other => other.id === move.beforeId)
          : board.sections.findIndex(other => other.id === move.afterId) + 1
        board.sections.splice(at, 0, section)
      })
    ),
    deleteSection: vi.fn<BoardsApi['deleteSection']>(
      (boardId, sectionId, tasksTo) =>
        Promise.resolve().then(() => {
          const board = find(boardId)
          const tasks = board.tasks.filter(task => task.sectionId === sectionId)
          if (tasksTo === undefined && tasks.length > 0) {
            throw new ApiError(409, 'section_not_empty')
          }
          for (const task of tasks) task.sectionId = tasksTo ?? null
          board.sections = board.sections.filter(
            section => section.id !== sectionId
          )
        })
    )
  } satisfies BoardsApi

  return Object.assign(api, { descriptions, comments, history })
}
