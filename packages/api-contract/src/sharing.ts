import { z } from 'zod'
import { boardParams } from './boards.ts'
import { role } from './people.ts'

export const newInvite = z.object({
  email: z.email().max(254).toLowerCase(),
  role
})

export const inviteParams = boardParams.extend({ inviteId: z.uuid() })

// Two characters at least, so a suggestion never lists the whole directory.
export const peopleQuery = z.object({ q: z.string().trim().min(2).max(254) })

export const memberParams = boardParams.extend({ userId: z.uuid() })

export const roleChange = z.object({ role })
