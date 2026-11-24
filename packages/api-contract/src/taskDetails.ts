import { z } from 'zod'
import { commentsResponse } from './comments.ts'
import { linksResponse } from './dependencies.ts'
import { historyResponse } from './history.ts'
import { followingResponse, remindersResponse } from './reminders.ts'
import { descriptionResponse } from './tasks.ts'

export const taskDetailsResponse = z.object({
  description: descriptionResponse,
  comments: commentsResponse.shape.comments,
  history: historyResponse.shape.entries,
  links: linksResponse,
  reminders: remindersResponse.shape.reminders,
  following: followingResponse.shape.following
})
