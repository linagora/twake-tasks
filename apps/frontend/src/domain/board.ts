export type Role = 'viewer' | 'editor' | 'admin'

export type SectionCategory =
  'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled'

export type Priority = 1 | 2 | 3 | 4

export interface BoardSummary {
  id: string
  name: string
  keyPrefix: string
  spaceId: string | null
  role: Role
  archived: boolean
  favorite: boolean
}

export interface Section {
  id: string
  name: string
  category: SectionCategory
}

export interface Task {
  id: string
  key: string
  sectionId: string | null
  title: string
  priority: Priority | null
  dueDate: string | null
  completedAt: string | null
  canceledAt: string | null
  assignees: string[]
}

export interface Board {
  id: string
  name: string
  keyPrefix: string
  spaceId: string | null
  archived: boolean
  version: number
  role: Role
  sections: Section[]
  tasks: Task[]
}
