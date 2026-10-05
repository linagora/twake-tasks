import type {
  Board,
  BoardSummary,
  Label,
  Person,
  Section,
  Task
} from '@/domain/board'

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

export type TaskChanges = Partial<
  Pick<
    Task,
    | 'title'
    | 'priority'
    | 'dueDate'
    | 'dueTime'
    | 'dueZone'
    | 'deadline'
    | 'duration'
  >
>

export interface Description {
  markdown: string
  version: number
}

export interface Comment {
  id: string
  author: Person
  body: string
  createdAt: string
}

/** `from` and `to` are ids for `section`, `assignees` and `labels`. */
export interface HistoryEntry {
  actor: Person
  field: string
  from: unknown
  to: unknown
  at: string
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
  /** Clearing the due date clears its time, and clearing the time its zone. */
  editTask: (
    boardId: string,
    taskId: string,
    changes: TaskChanges
  ) => Promise<void>
  getDescription: (boardId: string, taskId: string) => Promise<Description>
  /** `version` is the one the edit started from; a newer one is refused. */
  setDescription: (
    boardId: string,
    taskId: string,
    edit: Description
  ) => Promise<{ version: number }>
  listHistory: (boardId: string, taskId: string) => Promise<HistoryEntry[]>
  listComments: (boardId: string, taskId: string) => Promise<Comment[]>
  addComment: (boardId: string, taskId: string, body: string) => Promise<void>
  setAssignees: (
    boardId: string,
    taskId: string,
    userIds: string[]
  ) => Promise<void>
  /** Rejects with `label_taken` when the board's space or owner has that name. */
  createLabel: (boardId: string, name: string) => Promise<Label>
  setLabels: (
    boardId: string,
    taskId: string,
    labelIds: string[]
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
