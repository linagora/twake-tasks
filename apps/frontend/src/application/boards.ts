import type {
  Board,
  BoardSummary,
  Label,
  Layout,
  Person,
  Priority,
  ProjectSummary,
  Role,
  Section,
  SectionCategory,
  Task,
  Template
} from '@/domain/board'

export type TemplateFields = Omit<Template, 'id' | 'projectId'>

/**
 * The task and its sub-tasks lose their assignees who are not on the target
 * board. Labels follow by name, and the target project gets the ones it lacks.
 */
export interface TransferPreview {
  droppedAssignees: {
    userId: string
    name: string | null
    email: string | null
  }[]
  createdLabels: string[]
}

export interface NewBoard {
  name: string
  keyPrefix: string
  language: string
  /** Without it, a project of its own. */
  projectId?: string
  copyOf?: BoardCopy
}

/**
 * The board's sections and its project's labels, plus its open tasks with
 * `tasks`. Assignees outside the new board's project are dropped.
 */
export interface BoardCopy {
  boardId: string
  tasks: boolean
  assignees: boolean
  dueDates: boolean
}

/** `suggestion` is the prefix asked for when it is free, else a free one close to it. */
export interface KeyPrefixCheck {
  available: boolean
  suggestion: string
}

export type NewTask = { title: string } & (
  { sectionId: string | null; templateId?: string } | { parentId: string }
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

export type BulkAction =
  | { kind: 'move'; sectionId: string | null }
  | { kind: 'assign'; userId: string; assigned: boolean }
  | { kind: 'label'; labelId: string; labeled: boolean }
  | {
      kind: 'edit'
      changes: Pick<
        TaskChanges,
        'priority' | 'dueDate' | 'dueTime' | 'dueZone' | 'recurrence'
      >
    }
  | { kind: 'archive' | 'trash' | 'restore' }
  | { kind: 'transfer'; to: { boardId: string; sectionId: string | null } }

export interface Description {
  markdown: string
  version: number
}

export interface Reaction {
  emoji: string
  /** In the order they reacted. */
  people: Person[]
}

export interface Comment {
  id: string
  author: Person
  body: string
  createdAt: string
  /** Null until the author changes the body. */
  editedAt: string | null
  /** Each emoji once, in the order it was first given. */
  reactions: Reaction[]
}

/** A body the comment had before an edit, and when it was written. */
export interface CommentEdit {
  body: string
  writtenAt: string
}

/**
 * `actor` is null for a reminder. `change` is the history entry behind it,
 * null for a comment or once the entry is gone.
 */
export interface Notification {
  id: string
  reason: 'assigned' | 'unassigned' | 'mentioned' | 'following' | 'reminder'
  boardId: string
  boardName: string
  taskId: string
  key: string
  title: string
  createdAt: string
  readAt: string | null
  actor: Person | null
  change: HistoryEntry | null
  commentExcerpt: string | null
}

/** The unread notifications of a project; a project without any is absent. */
export interface ProjectUnread {
  projectId: string
  count: number
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

export type LinkKind = 'blockedBy' | 'blocks'

/** `task` is null for a task on a board the person cannot open. */
export interface LinkedTask {
  taskId: string
  task: {
    key: string
    title: string
    boardId: string
    boardName: string
    section: string | null
    dueDate: string | null
    done: boolean
  } | null
}

export type Links = Record<LinkKind, LinkedTask[]>

/**
 * `from` and `to` are ids for `section`, `assignees` and `labels`, and
 * `{ id, name }` for `board`. `name` is the section or label's name when the
 * entry was logged, if it existed then. A change made outside a request has
 * no actor id.
 */
export interface HistoryEntry {
  actor: Omit<Person, 'userId'> & { userId: string | null }
  field: string
  from: unknown
  to: unknown
  name: string | null
  at: string
}

export const PROGRESS_DAYS = 56

export interface DayCount {
  /** YYYY-MM-DD */
  day: string
  done: number
}

export type NewSection = Omit<Section, 'id'> & { afterId?: string }

export interface SectionMove {
  afterId?: string
  beforeId?: string
}

/** `category` is the kind of the task's section, null when it has none. */
export type AgendaTask = Task & {
  category: SectionCategory | null
  boardId: string
  boardName: string
  parentTitle: string | null
}

/** Why a task answers a search: the field that matched, and its text. */
export type SearchMatch =
  | { field: 'key' | 'previousKey' | 'title' | 'description'; text: string }
  | { field: 'comment'; text: string; commentId: string; author: Person }

/** Without a status, a search finds tasks whatever their state. */
export interface SearchScope {
  status?: 'open' | 'done' | undefined
  board?: string | undefined
}

/** `excerpt` quotes the description around the match when the title does not match. */
export type SearchResult = AgendaTask & {
  projectId: string
  excerpt: string | null
  match: SearchMatch | null
}

export interface Agenda {
  today: string
  tasks: AgendaTask[]
}

// Each criterion matches any of its values; a task must match every criterion.
export interface FilterCriteria {
  board?: string[]
  /** `me`, `nobody`, or a user id. */
  assignee?: string[]
  priority?: number[]
  label?: string[]
  due?: ('overdue' | 'today' | 'week' | 'none')[]
  /** Section names, whatever their case. */
  section?: string[]
  /** Found in the title, key, description or comments, as search finds it. */
  text?: string
  /** Open when absent. */
  status?: 'open' | 'done' | 'any'
  /** Only with the done status: completed today, in the last 7 or 30 days. */
  completed?: 'today' | 'week' | 'month'
  /** `me` or a user id. */
  createdBy?: string[]
}

export interface SectionName {
  boardId: string
  name: string
}

export interface SavedFilter {
  id: string
  name: string
  criteria: FilterCriteria
  favorite: boolean
}

export type FilterFields = Pick<SavedFilter, 'name' | 'criteria'>

export interface Sharing {
  members: (Person & { role: Role })[]
  invites: { id: string; email: string; role: Role }[]
}

export interface Project extends ProjectSummary {
  role: Role
}

export type Shelf = 'archived' | 'trash'

/** `at` is when the task was archived or trashed. */
export interface HiddenTask extends Task {
  at: string
}

export interface ExportedTask extends Task {
  archived: boolean
  /** As plain text. */
  description: string
  createdAt: string
  /** Null once they left the board. */
  createdBy: Person | null
}

/**
 * A task to create, its section, labels and assignees named as in the file.
 * `parentKey` names another row's `key`, or a task of the board.
 */
export interface ImportRow {
  key?: string
  parentKey?: string
  title: string
  section?: string
  description?: string
  assignees?: string[]
  labels?: string[]
  priority?: Priority
  dueDate?: string
  dueTime?: string
}

export interface ImportResult {
  imported: number
  /** Rows of the request whose parent is missing, too deep or in a loop. */
  skipped: { row: number; reason: 'parent' }[]
  unknownAssignees: string[]
  /** Sections only an admin may add: their tasks went where new tasks go. */
  unplacedSections: string[]
}

/** The person's Twake Workplace settings; null where they never chose. */
export interface UserSettings {
  language: string | null
  timezone: string | null
  theme: 'light' | 'dark' | 'auto'
  avatar: string | null
  name: string | null
}

export type NotificationKind =
  'assigned' | 'mentioned' | 'reminder' | 'changes' | 'comments'

export interface NotificationPreferences {
  mutedInApp: NotificationKind[]
  mutedEmail: NotificationKind[]
  emailFrequency: 'instant' | 'daily' | 'never'
}

export type CalendarFeedScope = 'assigned' | 'mine'

export interface CalendarFeed {
  scope: CalendarFeedScope
  createdAt: string
}

/** Rejects with an ApiError when the backend refuses the request. */
export interface BoardsApi {
  settings: () => Promise<UserSettings>
  calendarFeed: () => Promise<CalendarFeed | null>
  /** A new link, which ends the one before: its address is only known now. */
  openCalendarFeed: (
    scope: CalendarFeedScope
  ) => Promise<CalendarFeed & { url: string }>
  changeCalendarFeed: (scope: CalendarFeedScope) => Promise<CalendarFeed>
  closeCalendarFeed: () => Promise<void>
  notificationPreferences: () => Promise<NotificationPreferences>
  keepNotificationPreferences: (
    preferences: NotificationPreferences
  ) => Promise<NotificationPreferences>
  /** Without a session, from the link of an email. */
  unsubscribe: (token: string, kind: NotificationKind | 'all') => Promise<void>
  /** Calls back with the board's version now, then with each new one. */
  watchBoard: (
    boardId: string,
    onVersion: (version: number) => void
  ) => () => void
  /**
   * Moves the task and its sub-tasks to another board, where they take new
   * keys. Search still finds them by the old ones.
   */
  transferTask: (
    boardId: string,
    taskId: string,
    to: { boardId: string; sectionId: string | null }
  ) => Promise<{ key: string } & TransferPreview>
  /**
   * Changes each task as its own request would, and resolves with those left
   * unchanged. Rejects only when none could be changed.
   */
  changeTasks: (
    boardId: string,
    taskIds: string[],
    action: BulkAction
  ) => Promise<{ failed: string[] }>
  /** What moving the tasks would change, each person and label once. */
  previewTasksTransfer: (
    boardId: string,
    taskIds: string[],
    to: { boardId: string; sectionId: string | null }
  ) => Promise<TransferPreview>
  /** What moving the task would change, without moving it. */
  previewTransfer: (
    boardId: string,
    taskId: string,
    to: { boardId: string; sectionId: string | null }
  ) => Promise<TransferPreview>
  /** Archiving or trashing a task also hides its sub-tasks. */
  archiveTask: (boardId: string, taskId: string) => Promise<void>
  /** The trash is purged after 30 days. */
  trashTask: (boardId: string, taskId: string) => Promise<void>
  restoreTask: (boardId: string, taskId: string) => Promise<void>
  /** A trashed task, with its sub-tasks, without waiting the 30 days. Admins only. */
  deleteForGood: (boardId: string, taskId: string) => Promise<void>
  /** Admins only. */
  emptyTrash: (boardId: string) => Promise<void>
  hiddenTasks: (boardId: string, shelf: Shelf) => Promise<HiddenTask[]>
  /** The board's tasks in board order, each sub-task after its parent. */
  exportTasks: (boardId: string, archived: boolean) => Promise<ExportedTask[]>
  /** Creates every row the board can place, or none. Editors only. */
  importTasks: (boardId: string, rows: ImportRow[]) => Promise<ImportResult>
  /** An archived board is read only. Admins only. */
  setBoardArchived: (boardId: string, archived: boolean) => Promise<void>
  renameBoard: (boardId: string, name: string) => Promise<void>
  /** The projects the signed-in person belongs to, with their role. */
  listProjects: () => Promise<Project[]>
  /**
   * The board takes the project's members and labels: its tasks drop the
   * labels and assignees the project does not have.
   */
  moveToProject: (boardId: string, projectId: string) => Promise<void>
  /** A user's board's members and pending invites. Admins only. */
  getSharing: (boardId: string) => Promise<Sharing>
  /**
   * The people Tasks knows whose name or email holds the query, apart from
   * the board's members and invites. Admins only, two characters at least.
   */
  suggestPeople: (boardId: string, query: string) => Promise<Person[]>
  /** Resolves whether or not the email has an account. */
  invite: (boardId: string, email: string, role: Role) => Promise<void>
  cancelInvite: (boardId: string, inviteId: string) => Promise<void>
  setMemberRole: (boardId: string, userId: string, role: Role) => Promise<void>
  removeMember: (boardId: string, userId: string) => Promise<void>
  listFilters: () => Promise<SavedFilter[]>
  createFilter: (filter: FilterFields) => Promise<{ id: string }>
  updateFilter: (filterId: string, filter: FilterFields) => Promise<void>
  deleteFilter: (filterId: string) => Promise<void>
  setFilterFavorite: (filterId: string, favorite: boolean) => Promise<void>
  /** The label names on the person's boards, one per spelling regardless of case. */
  labelNames: () => Promise<string[]>
  /** The sections of the person's active boards, in board order. */
  sectionNames: () => Promise<SectionName[]>
  /** The other members of the person's boards, once each. */
  people: () => Promise<Person[]>
  /** Tasks matching a saved filter, across the person's boards. */
  filteredTasks: (filterId: string, zone: string) => Promise<AgendaTask[]>
  /** Overdue tasks, then those due within `days` days of today in `zone`. */
  agenda: (zone: string, days: number) => Promise<Agenda>
  /** Tasks whose key starts with, or whose title, description or comments contain, `text`. */
  search: (text: string, scope?: SearchScope) => Promise<SearchResult[]>
  /** Open tasks assigned to the signed-in person, dated ones first. */
  myTasks: () => Promise<AgendaTask[]>
  listBoards: () => Promise<BoardSummary[]>
  getBoard: (boardId: string) => Promise<Board>
  createBoard: (board: NewBoard) => Promise<Board>
  /** Whether no other board of the organization uses `keyPrefix`. */
  checkKeyPrefix: (keyPrefix: string) => Promise<KeyPrefixCheck>
  setFavorite: (boardId: string, favorite: boolean) => Promise<void>
  /** Offers the board to start new boards from. Admins only. */
  setBoardTemplate: (boardId: string, on: boolean) => Promise<void>
  /** The signed-in person's own layout for the board. */
  setLayout: (boardId: string, layout: Layout) => Promise<void>
  /** The layout of everyone who has not picked their own. Admins only. */
  setDefaultLayout: (boardId: string, layout: Layout) => Promise<void>
  /**
   * The days of the last `PROGRESS_DAYS` in `zone` on which the board's tasks
   * were completed, each completion of a recurring task counted.
   */
  completions: (boardId: string, zone: string) => Promise<DayCount[]>
  createTask: (
    boardId: string,
    task: NewTask
  ) => Promise<Pick<Task, 'id' | 'key' | 'title' | 'sectionId'>>
  /** The templates of every project the person is in, by title. */
  listTemplates: () => Promise<Template[]>
  /**
   * Rejects with `invalid_label` or `invalid_assignee` for one not in the
   * project.
   */
  createTemplate: (
    projectId: string,
    template: TemplateFields
  ) => Promise<Template>
  editTemplate: (
    template: Pick<Template, 'id' | 'projectId'>,
    fields: TemplateFields
  ) => Promise<Template>
  /** The tasks made from it stay, unlinked. */
  deleteTemplate: (
    template: Pick<Template, 'id' | 'projectId'>
  ) => Promise<void>
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
  editComment: (
    boardId: string,
    taskId: string,
    commentId: string,
    body: string
  ) => Promise<void>
  /** By its author, or a board admin; its earlier bodies and reactions go too. */
  deleteComment: (
    boardId: string,
    taskId: string,
    commentId: string
  ) => Promise<void>
  /** Oldest first; the current body is not among them. */
  listCommentEdits: (
    boardId: string,
    taskId: string,
    commentId: string
  ) => Promise<CommentEdit[]>
  addReaction: (
    boardId: string,
    taskId: string,
    commentId: string,
    emoji: string
  ) => Promise<void>
  removeReaction: (
    boardId: string,
    taskId: string,
    commentId: string,
    emoji: string
  ) => Promise<void>
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
  listLinks: (boardId: string, taskId: string) => Promise<Links>
  /**
   * Rejects with `invalid_link` for the task itself, one of its sub-tasks, or
   * a task of another project without an organization, and with `link_cycle`
   * when the other task already waits on this one.
   */
  addLink: (
    boardId: string,
    taskId: string,
    kind: LinkKind,
    otherId: string
  ) => Promise<void>
  removeLink: (
    boardId: string,
    taskId: string,
    otherId: string
  ) => Promise<void>
  following: (boardId: string, taskId: string) => Promise<boolean>
  setFollowing: (
    boardId: string,
    taskId: string,
    following: boolean
  ) => Promise<void>
  listNotifications: () => Promise<Notification[]>
  unreadByProject: () => Promise<ProjectUnread[]>
  markNotificationsRead: (ids: string[]) => Promise<void>
  markNotificationRead: (notificationId: string) => Promise<void>
  removeNotification: (notificationId: string) => Promise<void>
  setAssignees: (
    boardId: string,
    taskId: string,
    userIds: string[]
  ) => Promise<void>
  /** Rejects with `label_taken` when the board's project has that name in any case. */
  createLabel: (
    boardId: string,
    label: { name: string; color?: string | null }
  ) => Promise<Label>
  /** Rejects with `label_taken` as `createLabel` does. */
  editLabel: (
    boardId: string,
    labelId: string,
    changes: Partial<Pick<Label, 'name' | 'color'>>
  ) => Promise<Label>
  /** Takes it off every task of the board's project. */
  deleteLabel: (boardId: string, labelId: string) => Promise<void>
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
