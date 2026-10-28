import { z } from 'zod'
import { instant } from './common.ts'
import { person } from './people.ts'

export const historyEntry = z.object({
  actor: person.extend({ userId: z.string().nullable() }),
  field: z.string(),
  from: z.unknown(),
  to: z.unknown(),
  name: z.string().nullable(),
  at: instant
})

export const historyResponse = z.object({ entries: z.array(historyEntry) })
