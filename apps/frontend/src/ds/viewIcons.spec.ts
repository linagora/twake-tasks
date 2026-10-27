import { describe, expect, it } from 'vitest'

import { searchIcons, viewIcon, VIEW_ICONS } from '@/ds/viewIcons'

describe('view icons', () => {
  it('offers the icons Twake Drive offers its folders, in its order', () => {
    expect(VIEW_ICONS).toHaveLength(259)
    expect(VIEW_ICONS.slice(0, 3)).toEqual(['AlbumAdd', 'AlbumRemove', 'Album'])
    expect(VIEW_ICONS).not.toContain('Drive')
  })

  it('offers no logo of a brand or an institution', () => {
    for (const logo of [
      'Apple',
      'BrowserChrome',
      'BrowserFirefox',
      'BrowserSafari',
      'CozyText',
      'CloudHappy',
      'Matrix',
      'Gouv',
      'Eu'
    ]) {
      expect(VIEW_ICONS).not.toContain(logo)
    }
  })

  it('still draws an icon a view took before, though no longer offered', () => {
    expect(viewIcon('Drive')).not.toBe(viewIcon(null))
    expect(viewIcon('Apple')).not.toBe(viewIcon(null))
    expect(viewIcon('Nope')).toBe(viewIcon(null))
  })

  it('finds icons by their name in words, or in English and French', () => {
    expect(searchIcons('check list')).toContain('CheckList')
    expect(searchIcons('troph')).toEqual(['Trophy'])
  })
})
