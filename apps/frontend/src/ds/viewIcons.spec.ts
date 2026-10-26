import { describe, expect, it } from 'vitest'

import { searchIcons, viewIcon, VIEW_ICONS } from '@/ds/viewIcons'

describe('view icons', () => {
  it('offers the icons Twake Drive offers its folders, in its order', () => {
    expect(VIEW_ICONS).toHaveLength(278)
    expect(VIEW_ICONS.slice(0, 3)).toEqual(['AlbumAdd', 'AlbumRemove', 'Album'])
    expect(VIEW_ICONS).not.toContain('Drive')
  })

  it('still draws an icon a view took before, though no longer offered', () => {
    expect(viewIcon('Drive')).not.toBe(viewIcon(null))
    expect(viewIcon('Nope')).toBe(viewIcon(null))
  })

  it('finds icons by their name in words, or in English and French', () => {
    expect(searchIcons('check list')).toContain('CheckList')
    expect(searchIcons('troph')).toEqual(['Trophy'])
  })
})
