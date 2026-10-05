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
  completedAt: string | null
  canceledAt: string | null
  assignees: Person[]
  labels: Label[]
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
