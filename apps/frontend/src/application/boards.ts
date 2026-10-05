import type {
  Board,
  BoardSummary,
  Label,
  Layout,
  Person,
  Role,
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
    | 'recurrence'
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

/** `firesAt` is null while a relative reminder has no due date to follow. */
export interface Reminder {
  id: string
  at: string | null
  beforeMinutes: number | null
  firesAt: string | null
}

export type NewReminder =
  { at: string } | { beforeMinutes: number; zone: string }

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

export type AgendaTask = Task & { boardId: string; boardName: string }

export interface Agenda {
  today: string
  tasks: AgendaTask[]
}

export interface FilterCriteria {
  assignee?: 'me' | 'nobody'
  priority?: number
  label?: string
  due?: 'overdue' | 'today' | 'week' | 'none'
}

export interface SavedFilter {
  id: string
  name: string
  criteria: FilterCriteria
}

export interface Sharing {
  members: (Person & { role: Role })[]
  invites: { id: string; email: string; role: Role }[]
}

export interface Space {
  id: string
  name: string
  role: Role
}

export type Shelf = 'archived' | 'trash'

/** `at` is when the task was archived or trashed. */
export interface HiddenTask {
  id: string
  key: string
  title: string
  at: string
}

/** Rejects with an ApiError when the backend refuses the request. */
export interface BoardsApi {
  /**
   * Moves the task and its sub-tasks to another board, where they take new
   * keys. Search still finds them by the old ones.
   */
  transferTask: (
    boardId: string,
    taskId: string,
    to: { boardId: string; sectionId: string | null }
  ) => Promise<{ key: string }>
  /** Archiving or trashing a task also hides its sub-tasks. */
  archiveTask: (boardId: string, taskId: string) => Promise<void>
  /** The trash is purged after 30 days. */
  trashTask: (boardId: string, taskId: string) => Promise<void>
  restoreTask: (boardId: string, taskId: string) => Promise<void>
  hiddenTasks: (boardId: string, shelf: Shelf) => Promise<HiddenTask[]>
  /** An archived board is read only. Admins only. */
  setBoardArchived: (boardId: string, archived: boolean) => Promise<void>
  /** The spaces the signed-in person belongs to, with their role. */
  listSpaces: () => Promise<Space[]>
  /** The board's members and invites go, and the space's roles apply. */
  moveToSpace: (boardId: string, spaceId: string) => Promise<void>
  /** A user's board's members and pending invites. Admins only. */
  getSharing: (boardId: string) => Promise<Sharing>
  /** Resolves whether or not the email has an account. */
  invite: (boardId: string, email: string, role: Role) => Promise<void>
  cancelInvite: (boardId: string, inviteId: string) => Promise<void>
  setMemberRole: (boardId: string, userId: string, role: Role) => Promise<void>
  removeMember: (boardId: string, userId: string) => Promise<void>
  listFilters: () => Promise<SavedFilter[]>
  createFilter: (filter: Omit<SavedFilter, 'id'>) => Promise<{ id: string }>
  deleteFilter: (filterId: string) => Promise<void>
  /** Open tasks matching a saved filter, across the person's boards. */
  filteredTasks: (filterId: string, zone: string) => Promise<AgendaTask[]>
  /** Overdue tasks, then those due within `days` days of today in `zone`. */
  agenda: (zone: string, days: number) => Promise<Agenda>
  /** Tasks whose key starts with, or whose title or description contains, `text`. */
  search: (text: string) => Promise<AgendaTask[]>
  /** Open tasks assigned to the signed-in person, dated ones first. */
  myTasks: () => Promise<AgendaTask[]>
  listBoards: () => Promise<BoardSummary[]>
  getBoard: (boardId: string) => Promise<Board>
  createBoard: (board: NewBoard) => Promise<Board>
  setFavorite: (boardId: string, favorite: boolean) => Promise<void>
  /** The signed-in person's own layout for the board. */
  setLayout: (boardId: string, layout: Layout) => Promise<void>
  /** The layout of everyone who has not picked their own. Admins only. */
  setDefaultLayout: (boardId: string, layout: Layout) => Promise<void>
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
  /**
   * Clearing the due date clears its time and recurrence, and clearing the
   * time its zone.
   */
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
  listReminders: (boardId: string, taskId: string) => Promise<Reminder[]>
  addReminder: (
    boardId: string,
    taskId: string,
    reminder: NewReminder
  ) => Promise<void>
  deleteReminder: (
    boardId: string,
    taskId: string,
    reminderId: string
  ) => Promise<void>
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
