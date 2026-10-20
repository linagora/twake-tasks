import { Typography } from '@linagora/twake-mui'

import type { EmojiPickerOptions } from '@/ds/EmojiPicker'
import { Highlight } from '@/ds/Highlight'
import type { Suggestions } from '@/ds/Suggestions'
import { findEmojis, useEmojis } from '@/ui/boards/emojis'
import { useI18n } from '@/ui/i18n/useI18n'

const MAX_PICKED = 48
const MAX_SUGGESTED = 8
// One letter after ":" matches half the list, and ":)" or "10:30" match nothing.
const MIN_QUERY = 2

export interface EmojiInput {
  /** The button that opens the emoji grid. */
  emoji: EmojiPickerOptions
  /** The list that opens on ":name". */
  suggestions: Suggestions
}

export function useEmojiInput(): EmojiInput {
  const { t, lang } = useI18n()
  const emojis = useEmojis(lang)
  return {
    emoji: {
      labels: {
        open: t('editor.emoji'),
        search: t('editor.emojiSearch'),
        list: t('editor.emojiList'),
        none: t('editor.emojiNone')
      },
      search: query => findEmojis(emojis, query, MAX_PICKED)
    },
    suggestions: {
      trigger: ':',
      label: t('editor.emojiList'),
      search: query =>
        query.length < MIN_QUERY
          ? []
          : findEmojis(emojis, query, MAX_SUGGESTED).map(emoji => ({
              key: emoji.hexcode,
              insert: emoji.unicode,
              label: (
                <>
                  <span aria-hidden>{emoji.unicode}</span>
                  <Typography variant="body2" className="u-ellipsis">
                    <Highlight text={emoji.label} query={query} />
                  </Typography>
                </>
              )
            }))
    }
  }
}
