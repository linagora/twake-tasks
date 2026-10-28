import { z } from 'zod'

export const MEMBER_ROLES = ['viewer', 'editor', 'admin'] as const

export const role = z.enum(MEMBER_ROLES)

export const person = z.object({
  userId: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  avatar: z.string().nullable()
})

export const peopleResponse = z.object({ people: z.array(person) })
