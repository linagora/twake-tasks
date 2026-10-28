import { z } from 'zod'

export const settingsResponse = z.object({
  language: z.string().nullable(),
  timezone: z.string().nullable(),
  theme: z.enum(['light', 'dark', 'auto']),
  avatar: z.string().nullable(),
  name: z.string().nullable()
})
