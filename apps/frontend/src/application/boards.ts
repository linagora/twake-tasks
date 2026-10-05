import type { Board, BoardSummary, Section, Task } from '@/domain/board'

export interface NewBoard {
  name: string
  keyPrefix: string
}

export type NewTask = { title: string } & (
  { sectionId: string | null } | { parentId: string }
)

export type Completion = 'completed' | 'canceled' | null

export interface TaskMove {
  sectionId: string | null
  afterId?: string
  beforeId?: string
}

export interface Description {
  markdown: string
  version: number
}

export type NewSection = Omit<Section, 'id'> & { afterId?: string }

export interface SectionMove {
  afterId?: string
  beforeId?: string
}

/** Rejects with an ApiError when the backend refuses the request. */
export interface BoardsApi {
  listBoards: () => Promise<BoardSummary[]>
  getBoard: (boardId: string) => Promise<Board>
  createBoard: (board: NewBoard) => Promise<Board>
  setFavorite: (boardId: string, favorite: boolean) => Promise<void>
  createTask: (
    boardId: string,
    task: NewTask
  ) => Promise<Pick<Task, 'id' | 'key' | 'title' | 'sectionId'>>
  moveTask: (boardId: string, taskId: string, move: TaskMove) => Promise<void>
  /** Only for a task outside sections: one in a section completes by moving. */
  completeTask: (
    boardId: string,
    taskId: string,
    state: Completion
  ) => Promise<void>
  getDescription: (boardId: string, taskId: string) => Promise<Description>
  /** `version` is the one the edit started from; a newer one is refused. */
  setDescription: (
    boardId: string,
    taskId: string,
    edit: Description
  ) => Promise<{ version: number }>
  setAssignees: (
    boardId: string,
    taskId: string,
    userIds: string[]
  ) => Promise<void>
  createSection: (boardId: string, section: NewSection) => Promise<Section>
  editSection: (
    boardId: string,
    sectionId: string,
    changes: Partial<Omit<Section, 'id'>>
  ) => Promise<void>
  moveSection: (
    boardId: string,
    sectionId: string,
    move: SectionMove
  ) => Promise<void>
  /** Without `tasksTo`, the backend refuses a section that still has tasks. */
  deleteSection: (
    boardId: string,
    sectionId: string,
    tasksTo?: string | null
  ) => Promise<void>
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string | null

  constructor(status: number, code: string | null) {
    super(`API answered ${String(status)}${code ? ` ${code}` : ''}`)
    this.status = status
    this.code = code
  }
}
