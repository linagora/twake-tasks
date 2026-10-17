import { describe, expect, it } from 'vitest'

import { keptSection, openSection } from '@/application/viewTask'
import type { Section } from '@/domain/board'

describe('openSection', () => {
  const section = (id: string, category: Section['category']): Section => ({
    id,
    name: id,
    category
  })

  it('is the first section to do, else the first one still open', () => {
    expect(
      openSection([section('b', 'backlog'), section('t', 'unstarted')])?.id
    ).toBe('t')
    expect(
      openSection([section('d', 'completed'), section('s', 'started')])?.id
    ).toBe('s')
    expect(openSection([section('d', 'completed')])).toBeNull()
  })
})

describe('keptSection', () => {
  const from = [
    { id: 'a', name: 'To do' },
    { id: 'b', name: 'Review' }
  ]
  const to: Section[] = [
    { id: 'x', name: 'Later', category: 'backlog' },
    { id: 'y', name: 'Next', category: 'unstarted' },
    { id: 'z', name: ' review ', category: 'started' }
  ]

  it('keeps the status of the same name, whatever its case', () => {
    expect(keptSection(from, 'b', to)?.id).toBe('z')
  })

  it('takes the first open status for one the board has not, or none', () => {
    expect(keptSection(from, 'a', to)?.id).toBe('y')
    expect(keptSection(from, null, to)?.id).toBe('y')
  })
})
