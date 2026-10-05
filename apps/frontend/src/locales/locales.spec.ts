import { describe, expect, it } from 'vitest'

import de from '@/locales/de.json'
import en from '@/locales/en.json'
import es from '@/locales/es.json'
import fr from '@/locales/fr.json'
import it_ from '@/locales/it.json'
import ru from '@/locales/ru.json'
import vi from '@/locales/vi.json'

interface Dictionary {
  [key: string]: string | Dictionary
}

function keys(dictionary: Dictionary, prefix = ''): string[] {
  return Object.entries(dictionary).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [`${prefix}${key}`]
      : keys(value, `${prefix}${key}.`)
  )
}

describe('locales', () => {
  const english = keys(en).sort()

  it.each([
    ['fr', fr],
    ['de', de],
    ['es', es],
    ['it', it_],
    ['ru', ru],
    ['vi', vi]
  ])('%s has exactly the English keys', (_lang, dictionary) => {
    expect(keys(dictionary).sort()).toEqual(english)
  })
})
