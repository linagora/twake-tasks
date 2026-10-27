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

  it('finds an emoji by words from the middle of its name', async () => {
    const emojis = await fetchEmojis('en')

    expect(unicodes(findEmojis(emojis, 'tears of joy', 8))).toEqual([
      '😂',
      '😹'
    ])
    expect(unicodes(findEmojis(emojis, 'open mouth', 8))).toContain('😮')
    expect(unicodes(findEmojis(emojis, 'heart eyes', 8))).toContain('😍')
    expect(unicodes(findEmojis(emojis, "o'clock", 1))).toHaveLength(1)
  })

  it('finds an emoji by a phrase across a no-break space', async () => {
    const emojis = await fetchEmojis('fr')

    expect(findEmojis(emojis, 'homme : cheveux roux', 1)[0]?.hexcode).toBe(
      '1F468-200D-1F9B0'
    )
  })

  it('finds nothing for punctuation alone', async () => {
    const emojis = await fetchEmojis('en')

    expect(findEmojis(emojis, '::', 8)).toEqual([])
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

  it('leaves out the emoji too new for most fonts', async () => {
    const emojis = await fetchEmojis('en')

    expect(emojis.find(emoji => emoji.hexcode === '1F6D8')).toBe(undefined)
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
