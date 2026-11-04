import { z } from 'zod'
import { taskTitle } from './tasks.ts'

export const projectParams = z.object({ projectId: z.uuid() })

export const projectTemplateParams = z.object({
  projectId: z.uuid(),
  templateId: z.uuid()
})

export const templateFields = z.strictObject({
  title: taskTitle,
  description: z.string().max(50_000),
  priority: z.int().min(1).max(4).nullable(),
  labelIds: z.array(z.uuid()).max(50),
  assigneeIds: z.array(z.uuid()).max(50)
})

export const template = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  description: z.string(),
  priority: z.literal([1, 2, 3, 4]).nullable(),
  labelIds: z.array(z.string()),
  assigneeIds: z.array(z.string())
})

export const templatesResponse = z.object({ templates: z.array(template) })
