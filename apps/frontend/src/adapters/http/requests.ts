import type * as wire from '@twake-tasks/api-contract'
import type { z } from 'zod'

import type {
  BoardsApi,
  Completion,
  Description,
  FilterFields,
  NewBoard,
  NewReminder,
  NewSection,
  NewTask,
  SectionMove,
  TaskChanges,
  TaskMove
} from '@/application/boards'
import type { Layout, Role } from '@/domain/board'

// Never imported: tsc fails here when a request the app sends no longer fits
// the schema the backend checks it with.
type Accepts<Schema extends z.ZodType, Body extends z.input<Schema>> = Body

export type Requests = [
  Accepts<typeof wire.newBoard, NewBoard>,
  Accepts<typeof wire.boardRename, { name: string }>,
  Accepts<typeof wire.boardMove, { projectId: string }>,
  Accepts<typeof wire.layoutChoice, { layout: Layout }>,
  Accepts<typeof wire.newTask, NewTask>,
  Accepts<typeof wire.taskMove, TaskMove>,
  Accepts<typeof wire.completion, { state: Completion }>,
  Accepts<typeof wire.taskChanges, TaskChanges>,
  Accepts<typeof wire.descriptionEdit, Description>,
  Accepts<typeof wire.assignment, { userIds: string[] }>,
  Accepts<typeof wire.transferTarget, Parameters<BoardsApi['transferTask']>[2]>,
  Accepts<typeof wire.newComment, { body: string }>,
  Accepts<typeof wire.newReminder, NewReminder>,
  Accepts<typeof wire.newLabel, Parameters<BoardsApi['createLabel']>[1]>,
  Accepts<typeof wire.labelChanges, Parameters<BoardsApi['editLabel']>[2]>,
  Accepts<typeof wire.labeling, { labelIds: string[] }>,
  Accepts<typeof wire.newSection, NewSection>,
  Accepts<typeof wire.sectionChanges, Parameters<BoardsApi['editSection']>[2]>,
  Accepts<typeof wire.sectionMove, SectionMove>,
  Accepts<typeof wire.sectionDeletion, { tasksTo: string | null }>,
  Accepts<typeof wire.newInvite, { email: string; role: Role }>,
  Accepts<typeof wire.roleChange, { role: Role }>,
  Accepts<typeof wire.newFilter, FilterFields>,
  Accepts<typeof wire.filterChanges, FilterFields>,
  Accepts<typeof wire.searchQuery, { q: string }>,
  Accepts<typeof wire.peopleQuery, { q: string }>,
  Accepts<typeof wire.agendaQuery, { zone: string; days: string }>,
  Accepts<typeof wire.zoneQuery, { zone: string }>
]
