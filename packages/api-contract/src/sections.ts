import { z } from 'zod'
import { uniqueName } from './common.ts'

export const SECTION_CATEGORIES = [
  'backlog',
  'unstarted',
  'started',
  'completed',
  'canceled'
] as const

export const sectionName = uniqueName(100)
export const category = z.enum(SECTION_CATEGORIES)

export const newSection = z.object({
  name: sectionName,
  category,
  afterId: z.uuid().optional()
})

export const sectionParams = z.object({
  boardId: z.uuid(),
  sectionId: z.uuid()
})

export const sectionChanges = z
  .object({ name: sectionName, category })
  .partial()
  .refine(changes => Object.keys(changes).length > 0)

export const sectionMove = z.object({
  afterId: z.uuid().optional(),
  beforeId: z.uuid().optional()
})

export const sectionDeletion = z.object({
  tasksTo: z.uuid().nullable().optional()
})

export const section = z.object({
  id: z.string(),
  name: z.string(),
  category
})
