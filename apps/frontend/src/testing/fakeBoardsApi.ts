import { vi } from 'vitest'

import { ApiError, type BoardsApi } from '@/application/boards'
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

export function fakeBoardsApi(boards: Board[] = []) {
  const store = new Map(boards.map(board => [board.id, board]))
  const find = (boardId: string) => {
    const board = store.get(boardId)
    if (!board) throw new ApiError(404, 'not_found')
    return board
  }

  const api = {
    listBoards: vi.fn(() =>
      Promise.resolve([...store.values()].map(board => summaryOf(board)))
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
    )
  } satisfies BoardsApi

  return api
}
