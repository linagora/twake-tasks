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
  background: BoardBackground
  backgroundImage: string | null
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
const flagTag = String.raw`(?<=[\u{1F3F4}\u{E0020}-\u{E007E}])[\u{E0020}-\u{E007F}]`
const invisible = new RegExp(
  String.raw`(${emojiJoiner}|${scriptJoiner}|${flagTag})|\p{Cf}`,
  'gu'
)

/** The name as the server stores it, so names that render alike compare equal. */
export function labelName(text: string): string {
  return text
    .replace(invisible, (_, kept: string | undefined) => kept ?? '')
    .normalize('NFKC')
    .trim()
}

export const deadlineBeforeDue = (
  dueDate: string | null | undefined,
  deadline: string | null | undefined
): boolean => Boolean(dueDate && deadline && deadline < dueDate)

export const MAX_TASK_DEPTH = 4

/** Whether this user may see and change who the board is shared with. */
export const isShareable = (
  board: Pick<BoardSummary, 'role' | 'archived' | 'project'>
): boolean =>
  board.role === 'admin' &&
  !board.archived &&
  !board.project.personal &&
  !board.project.managed

/** The pictures shipped with the app, under `/backgrounds/`. */
export const BACKGROUNDS = [
  'orbitalblue',
  'earlymorning',
  'dawn',
  'stellarburst',
  'blossom',
  'lagoon',
  'ripple'
] as const

export type Background = (typeof BACKGROUNDS)[number]

/** The pale pictures, on which a name reads in a dark colour. */
const LIGHT_BACKGROUNDS: BoardBackground[] = ['blossom', 'lagoon']

export const isLightBackground = (background: BoardBackground): boolean =>
  LIGHT_BACKGROUNDS.includes(background)

/**
 * A shipped picture, one an admin sent (`custom`, whose id is
 * `backgroundImage`), or null for the default.
 */
export type BoardBackground = Background | 'custom' | null

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
  background: BoardBackground
  backgroundImage: string | null
  members: Person[]
  /** The emails invited to it, members once they sign in. Admins only. */
  invited: string[]
  labels: Label[]
  sections: Section[]
  tasks: Task[]
}
