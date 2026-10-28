import { z } from 'zod'
import { role } from './people.ts'

export const projectSummary = z.object({
  id: z.string(),
  name: z.string(),
  personal: z.boolean(),
  managed: z.boolean()
})

export const projectsResponse = z.object({
  projects: z.array(projectSummary.extend({ role }))
})
