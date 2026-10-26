import { useQuery } from '@tanstack/react-query'
import type { CompactEmoji } from 'emojibase'

import type { EmojiChoice } from '@/ds/EmojiPicker'
import { resolveLanguage, type SupportedLanguage } from '@/ui/i18n/languages'
import { keys } from '@/ui/queries/keys'

export interface Emoji extends EmojiChoice {
  hexcode: string
  tags: string[]
}

// Each language is a chunk of its own, fetched the first time a task opens.
const LOADERS: Record<
  SupportedLanguage,
  () => Promise<{ default: CompactEmoji[] }>
> = {
  en: () => import('emojibase-data/en/compact.json'),
  fr: () => import('emojibase-data/fr/compact.json'),
  de: () => import('emojibase-data/de/compact.json'),
  it: () => import('emojibase-data/it/compact.json'),
  es: () => import('emojibase-data/es/compact.json'),
  ru: () => import('emojibase-data/ru/compact.json'),
  vi: () => import('emojibase-data/vi/compact.json')
}

// Skin tone swatches and the regional letters only make sense inside other emoji.
const COMPONENT_GROUP = 2

const FREQUENT = [
  '1F600',
  '1F602',
  '1F60A',
  '1F60D',
  '1F914',
  '1F62E',
  '1F622',
  '1F621',
  '1F44D',
  '1F44E',
  '1F44F',
  '1F64F',
  '1F4AA',
  '1F440',
  '1F389',
  '1F525',
  '2764',
  '2705',
  '274C',
  '26A0',
  '1F680',
  '1F4A1',
  '23F0',
  '1F4CC'
]

// The reactions Twake Chat offers first, then 🎉, which throws confetti,
// written as emojibase writes them so that they match the same emoji picked
// from the grid.
const QUICK_REACTIONS = [
  { hexcode: '1F49C', unicode: '💜' },
  { hexcode: '1F44D', unicode: '👍\u{FE0F}' },
  { hexcode: '1F44E', unicode: '👎\u{FE0F}' },
  { hexcode: '1F602', unicode: '😂' },
  { hexcode: '1F62E', unicode: '😮' },
  { hexcode: '1F972', unicode: '🥲' },
  { hexcode: '1F389', unicode: '🎉' }
]

/** Named in the app's language once the names are in, by the emoji itself until then. */
export function findQuickReactions(emojis: Emoji[]): EmojiChoice[] {
  const byHexcode = new Map(emojis.map(emoji => [emoji.hexcode, emoji]))
  return QUICK_REACTIONS.map(({ hexcode, unicode }) => ({
    unicode,
    label: byHexcode.get(hexcode)?.label ?? unicode
  }))
}

const fold = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

// Newer emoji are missing from the fonts of many systems and show as a box.
const NEWEST_VERSION = 15.1

export async function fetchEmojis(lang: string): Promise<Emoji[]> {
  const [{ default: data }, { default: versions }] = await Promise.all([
    LOADERS[resolveLanguage([lang])](),
    import('emojibase-data/versions/emoji.json')
  ])
  const tooNew = new Set(
    Object.entries(versions)
      .filter(([version]) => Number(version) > NEWEST_VERSION)
      .flatMap(([, hexcodes]) => hexcodes)
  )
  return data
    .filter(
      emoji =>
        emoji.group !== undefined &&
        emoji.group !== COMPONENT_GROUP &&
        !tooNew.has(emoji.hexcode)
    )
    .map(emoji => ({
      hexcode: emoji.hexcode,
      unicode: emoji.unicode,
      label: emoji.label,
      tags: emoji.tags ?? []
    }))
}

function computeRank(emoji: Emoji, query: string): number | null {
  const label = fold(emoji.label)
  if (label.startsWith(query)) return 0
  if (label.split(/\s+/).some(word => word.startsWith(query))) return 1
  if (emoji.tags.some(tag => fold(tag).startsWith(query))) return 2
  return null
}

/**
 * The emoji whose name or keywords start with the query, best matches first.
 * An empty query gives the ones people use most.
 */
export function findEmojis(
  emojis: Emoji[],
  query: string,
  max: number
): Emoji[] {
  const wanted = fold(query.trim())
  if (wanted === '') {
    const byHexcode = new Map(emojis.map(emoji => [emoji.hexcode, emoji]))
    return FREQUENT.flatMap(hexcode => byHexcode.get(hexcode) ?? []).slice(
      0,
      max
    )
  }
  return emojis
    .flatMap(emoji => {
      const rank = computeRank(emoji, wanted)
      return rank === null ? [] : [{ emoji, rank }]
    })
    .sort((a, b) => a.rank - b.rank)
    .slice(0, max)
    .map(({ emoji }) => emoji)
}

export function useEmojis(lang: string): Emoji[] {
  return (
    useQuery({
      queryKey: keys.emojis(resolveLanguage([lang])),
      queryFn: () => fetchEmojis(lang),
      staleTime: Infinity,
      gcTime: Infinity
    }).data ?? []
  )
}
