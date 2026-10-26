import { z } from 'zod'
import { taskParams } from './tasks.ts'

export const newComment = z.object({
  body: z.string().trim().min(1).max(10_000)
})

export const reactionParams = taskParams.extend({
  commentId: z.uuid(),
  emoji: z.string()
})

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' })

// One emoji, possibly a sequence of them joined into one, or a keycap such
// as the digit one in a box: nothing else.
export const reactionEmoji = z
  .string()
  .max(32)
  .regex(
    /^(?:[#*0-9]\uFE0F?\u20E3|(?=.*[\p{Extended_Pictographic}\p{Regional_Indicator}])(?:[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u{E0020}-\u{E007F}]|\u200D|\uFE0F)+)$/u
  )
  .refine(text => [...graphemes.segment(text)].length === 1)
