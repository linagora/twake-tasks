export type Role = 'viewer' | 'editor' | 'admin'

export type SectionCategory =
  'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled'

export type Priority = 1 | 2 | 3 | 4

export interface BoardSummary {
  id: string
  name: string
  keyPrefix: string
  spaceId: string | null
  inbox: boolean
  role: Role
  archived: boolean
  favorite: boolean
}

export interface Section {
  id: string
  name: string
  category: SectionCategory
}

export interface Person {
  userId: string
  email: string
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
}

export const MAX_TASK_DEPTH = 4

export interface Board {
  id: string
  name: string
  keyPrefix: string
  spaceId: string | null
  inbox: boolean
  archived: boolean
  version: number
  role: Role
  members: Person[]
  labels: Label[]
  sections: Section[]
  tasks: Task[]
}
