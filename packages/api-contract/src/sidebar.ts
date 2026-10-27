import { z } from 'zod'
import { boardName } from './boards.ts'

export const sidebarSectionName = z.object({ name: boardName })

export const sidebarSectionParams = z.object({ sectionId: z.uuid() })

export const sidebarLayout = z.object({
  sections: z
    .array(
      z.object({
        id: z.uuid(),
        items: z
          .array(z.object({ kind: z.enum(['board', 'view']), id: z.uuid() }))
          .max(500)
      })
    )
    .max(100)
})
