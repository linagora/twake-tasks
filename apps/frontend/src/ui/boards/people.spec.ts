import { describe, expect, it } from 'vitest'

import type { Person } from '@/domain/board'
import { matchingPeople, matchScore } from '@/ui/boards/people'

const jean: Person = {
  userId: 'u-jean',
  email: 'jean_dupont@example.com',
  name: null
}
const alice: Person = {
  userId: 'u-alice',
  email: 'alice@example.com',
  name: 'Alice Martin'
}

describe('matchScore', () => {
  it('splits the query like the words of the person', () => {
    expect(matchScore(jean, 'jean_du')).toBe(3)
    expect(matchScore(jean, 'jean.du')).toBe(3)
    expect(matchScore(jean, 'jean du')).toBe(3)
    expect(matchScore(alice, 'alice@ex')).toBe(3)
  })

  it('still refuses what matches nothing', () => {
    expect(matchScore(jean, 'zzz')).toBe(0)
  })
})

describe('matchingPeople', () => {
  it('finds a person by an email with an underscore', () => {
    expect(matchingPeople([alice, jean], 'jean_du')).toEqual([jean])
  })
})
