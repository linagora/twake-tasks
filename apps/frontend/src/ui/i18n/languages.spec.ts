import { describe, expect, it } from 'vitest'

import { resolveLanguage } from '@/ui/i18n/languages'

describe('resolveLanguage', () => {
  it('takes the first supported candidate by its primary subtag', () => {
    expect(resolveLanguage(['pt-BR', 'de-AT', 'fr'])).toBe('de')
  })

  it('ignores case and empty candidates', () => {
    expect(resolveLanguage([null, '', 'VI_vn'])).toBe('vi')
  })

  it('falls back to English', () => {
    expect(resolveLanguage(['pt', 'ja'])).toBe('en')
  })
})
