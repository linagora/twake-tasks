import { describe, expect, it } from 'vitest'

import { dropOn, enterLane } from '@/application/boardDrag'

const lanes = { 'lane:todo': ['a', 'b', 'c'], 'lane:done': ['d'] }

describe('enterLane', () => {
  it('makes room in the lane under the pointer', () => {
    expect(enterLane(lanes, 'a', 'd', false)).toEqual({
      'lane:todo': ['b', 'c'],
      'lane:done': ['a', 'd']
    })
    expect(enterLane(lanes, 'a', 'd', true)).toEqual({
      'lane:todo': ['b', 'c'],
      'lane:done': ['d', 'a']
    })
  })

  it('appends to a lane entered through its empty space', () => {
    expect(enterLane(lanes, 'b', 'lane:done', false)).toEqual({
      'lane:todo': ['a', 'c'],
      'lane:done': ['d', 'b']
    })
  })

  it('leaves the lanes alone within the same lane', () => {
    expect(enterLane(lanes, 'a', 'c', true)).toBe(lanes)
  })
})

describe('dropOn', () => {
  it('reorders within a lane', () => {
    expect(dropOn(lanes, lanes, 'a', 'c')).toEqual({
      lane: 'lane:todo',
      ids: ['b', 'c'],
      index: 2
    })
  })

  it('lands where the lane made room', () => {
    const entered = enterLane(lanes, 'b', 'd', false)
    expect(dropOn(lanes, entered, 'b', 'b')).toEqual({
      lane: 'lane:done',
      ids: ['d'],
      index: 0
    })
  })

  it('lands nowhere when the task ends where it started', () => {
    expect(dropOn(lanes, lanes, 'b', 'b')).toBeNull()
    expect(dropOn(lanes, lanes, 'b', 'lane:todo')).toBeNull()
  })
})
