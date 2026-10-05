import { vi } from 'vitest'

import {
  ApiError,
  type BoardsApi,
  type Description
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
    title: 'Logo',
    priority: null,
    dueDate: null,
    completedAt: null,
    canceledAt: null,
    assignees: [],
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
    createTask: vi.fn<BoardsApi['createTask']>(
      (boardId, { sectionId, title }) =>
        Promise.resolve().then(() => {
          const board = find(boardId)
          const task = aTask(null, {
            sectionId,
            title,
            key: `${board.keyPrefix}-${String(board.tasks.length + 1)}`
          })
          board.tasks.push(task)
          board.version += 1
          return { id: task.id, key: task.key, title, sectionId }
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

  return Object.assign(api, { descriptions })
}
