export const ROLES = ['viewer', 'editor', 'admin'] as const
export type Role = (typeof ROLES)[number]

export type SectionCategory =
  'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled'

export type Priority = 1 | 2 | 3 | 4

/**
 * A project holds boards and gives them their members, labels and key
 * prefixes. A personal project is never shared; a managed one takes its
 * members from an integration, such as a space.
 */
export interface ProjectSummary {
  id: string
  name: string
  personal: boolean
  managed: boolean
}

export interface BoardSummary {
  id: string
  name: string
  keyPrefix: string
  project: ProjectSummary
  inbox: boolean
  role: Role
  archived: boolean
  favorite: boolean
  openTasks: number
  /** Top-level tasks completed, out of `totalTasks`, the ones not canceled. */
  doneTasks: number
  totalTasks: number
  /** When the person joined the board's project. */
  joinedAt: string
  /** Who invited the person: null on their own boards and a space's. */
  sharedBy: { name: string | null; email: string } | null
  /**
   * The first three members of its project by email, the ones a card draws,
   * out of `memberCount`. The board itself lists them all.
   */
  members: Person[]
  memberCount: number
}

export interface Section {
  id: string
  name: string
  category: SectionCategory
}

export interface Person {
  userId: string
  email: string
  /** Null until the person signs in to Tasks. */
  name: string | null
  /** The picture from the person's Twake Workplace settings, if any. */
  avatar?: string | null
}

export interface Task {
  id: string
  key: string
  sectionId: string | null
  parentId: string | null
  title: string
  priority: Priority | null
  dueDate: string | null
  /** `HH:MM`, the same wall clock time everywhere unless `dueZone` is set. */
  dueTime: string | null
  dueZone: string | null
  deadline: string | null
  duration: Duration | null
  recurrence: Recurrence | null
  completedAt: string | null
  canceledAt: string | null
  assignees: Person[]
  labels: Label[]
  commentCount: number
}

export interface Duration {
  amount: number
  unit: 'minutes' | 'days'
}

/** Completing a recurring task moves its due date instead of closing it. */
export interface Recurrence {
  every: number
  unit: 'days' | 'weeks' | 'months' | 'years'
  fromCompletion: boolean
}

export interface Label {
  id: string
  name: string
  /** `#RRGGBB`, or null for the colour computed from the name */
  color: string | null
}

// Format characters go, except the joiners and tags that change what renders.
const emojiJoiner = String.raw`(?<=[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{FE0F}])\u{200D}(?=\p{Extended_Pictographic})`
const scriptJoiner = String.raw`(?<=[\p{L}\p{M}])(?<![\p{sc=Latin}\p{sc=Inherited}])[\u{200C}\u{200D}](?=[\p{L}\p{M}])`
const flagTag = String.raw`\u{1F3F4}[\u{E0020}-\u{E007E}]*\u{E007F}?`
const invisible = new RegExp(
  String.raw`(${emojiJoiner}|${scriptJoiner}|${flagTag})|\p{Cf}`,
  'gu'
)

/** The name as the server stores it, so names that render alike compare equal. */
export function labelName(text: string): string {
  return text
    .normalize('NFKC')
    .replace(invisible, (_, kept: string | undefined) => kept ?? '')
    .normalize('NFKC')
    .trim()
}

export const deadlineBeforeDue = (
  dueDate: string | null | undefined,
  deadline: string | null | undefined
): boolean => Boolean(dueDate && deadline && deadline < dueDate)

export const MAX_TASK_DEPTH = 4

export const isAdmin = (role: Role): role is 'admin' => role === 'admin'

/** Whether removing this member, or lowering their role, leaves no admin. */
export const isLastAdmin = (
  member: { role: Role },
  members: readonly { role: Role }[]
): boolean =>
  isAdmin(member.role) &&
  members.filter(each => isAdmin(each.role)).length === 1

/** Whether this user may add, change and move the board's tasks. */
export const isEditable = (
  board: Pick<BoardSummary, 'role' | 'archived'>
): boolean => board.role !== 'viewer' && !board.archived

/** Whether this user may change the board's sections and default layout. */
export const isManageable = (
  board: Pick<BoardSummary, 'role' | 'archived'>
): boolean => board.role === 'admin' && !board.archived

export const isRenamable = (
  board: Pick<BoardSummary, 'role' | 'archived' | 'inbox'>
): boolean => isManageable(board) && !board.inbox

/** Whether this user may archive the board, or unarchive it. */
export const isArchivable = (
  board: Pick<BoardSummary, 'role' | 'inbox'>
): boolean => board.role === 'admin' && !board.inbox

export type NotShareable = 'personal' | 'managed' | 'archived' | 'notAdmin'

export const whyNotShareable = (
  board: Pick<BoardSummary, 'role' | 'archived' | 'project'>
): NotShareable | null =>
  board.project.personal
    ? 'personal'
    : board.project.managed
      ? 'managed'
      : board.archived
        ? 'archived'
        : board.role !== 'admin'
          ? 'notAdmin'
          : null

/** Whether this user may see and change who the board is shared with. */
export const isShareable = (
  board: Pick<BoardSummary, 'role' | 'archived' | 'project'>
): boolean => whyNotShareable(board) === null

/** Whether this user may move a board into the project. */
export const takesBoards = (project: {
  role: Role
  personal: boolean
}): boolean => project.role !== 'viewer' && !project.personal

export const LAYOUTS = ['board', 'list', 'calendar'] as const

export type Layout = (typeof LAYOUTS)[number]

export interface Board {
  id: string
  name: string
  keyPrefix: string
  project: ProjectSummary
  inbox: boolean
  archived: boolean
  version: number
  role: Role
  layout: Layout
  defaultLayout: Layout
  members: Person[]
  /** The emails invited to it, members once they sign in. Admins only. */
  invited: string[]
  labels: Label[]
  sections: Section[]
  tasks: Task[]
}

/**
 * A task in a section is done by being in a completed section; a task
 * outside sections, once completed.
 */
export const isDone = (
  task: Pick<Task, 'sectionId' | 'completedAt'>,
  sections: readonly Pick<Section, 'id' | 'category'>[]
): boolean => {
  const section = sections.find(each => each.id === task.sectionId)
  return section ? section.category === 'completed' : task.completedAt !== null
}
