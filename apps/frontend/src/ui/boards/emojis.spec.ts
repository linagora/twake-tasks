import { describe, expect, it } from 'vitest'

import { fetchEmojis, findEmojis, findQuickReactions } from '@/ui/boards/emojis'

const unicodes = (found: { unicode: string }[]) =>
  found.map(emoji => emoji.unicode)

describe('emojis', () => {
  it('finds an emoji by the start of its name', async () => {
    const emojis = await fetchEmojis('en')

    expect(unicodes(findEmojis(emojis, 'thumbs', 2))).toEqual(['👍️', '👎️'])
  })

  it('finds an emoji by its name in the language of the app', async () => {
    const emojis = await fetchEmojis('fr')

    expect(unicodes(findEmojis(emojis, 'pouce vers le h', 8))).toEqual(['👍️'])
  })

  it('finds an emoji by a keyword, ignoring case and accents', async () => {
    const emojis = await fetchEmojis('fr')

    expect(unicodes(findEmojis(emojis, 'FETE', 48))).toContain('🎉')
  })

  it('puts the emoji whose name starts with the query first', async () => {
    const emojis = await fetchEmojis('en')

    expect(findEmojis(emojis, 'cat', 1)[0]?.label).toMatch(/^cat/)
  })

  it('gives the usual emoji for an empty query', async () => {
    const emojis = await fetchEmojis('en')

    const found = findEmojis(emojis, '', 48)

    expect(found).toHaveLength(24)
    expect(unicodes(found).slice(0, 2)).toEqual(['😀', '😂'])
  })

  it('leaves out the skin tone swatches', async () => {
    const emojis = await fetchEmojis('en')

    expect(emojis.find(emoji => emoji.hexcode === '1F3FB')).toBe(undefined)
  })

  it('falls back to English for a language it does not know', async () => {
    const emojis = await fetchEmojis('pt-BR')

    expect(emojis.find(emoji => emoji.hexcode === '1F44D')?.label).toBe(
      'thumbs up'
    )
  })

  it('offers the reactions of Twake Chat, as the grid writes them', async () => {
    const emojis = await fetchEmojis('fr')

    const quick = findQuickReactions(emojis)

    expect(unicodes(quick)).toEqual(['💜', '👍️', '👎️', '😂', '😮', '🥲', '🎉'])
    expect(quick[1]?.label).toBe('pouce vers le haut')
    for (const emoji of quick) {
      expect(emojis.some(each => each.unicode === emoji.unicode)).toBe(true)
    }
  })
})
