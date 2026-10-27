import { describe, expect, it } from 'vitest'

import { fullName } from './fullName.ts'

describe('fullName', () => {
  it.each([
    ['Quentin', 'VALMORI', 'Quentin VALMORI'],
    [' Alice ', ' Martin ', 'Alice Martin'],
    ['Alice', null, 'Alice'],
    [null, 'Martin', 'Martin'],
    ['', ' ', null],
    ['User One', 'One', 'User One'],
    ['User One', 'one', 'User One'],
    ['Martin', 'Martin', 'Martin'],
    ['Jean-Martin', 'Martin', 'Jean-Martin Martin']
  ])('joins %j and %j', (given, family, name) => {
    expect(fullName(given, family)).toBe(name)
  })
})
