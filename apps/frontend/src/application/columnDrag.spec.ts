import { describe, expect, it } from 'vitest'

import { columnMove, reorder } from './columnDrag'

describe('columnDrag', () => {
  const order = ['todo', 'doing', 'review', 'done']

  it('takes the place of the section it is dropped on', () => {
    expect(reorder(order, 'todo', 'review')).toEqual([
      'doing',
      'review',
      'todo',
      'done'
    ])
    expect(reorder(order, 'done', 'doing')).toEqual([
      'todo',
      'done',
      'doing',
      'review'
    ])
  })

  it('places a section after the one before it, or before the first', () => {
    expect(columnMove(order, 'todo', 'review')).toEqual({ afterId: 'review' })
    expect(columnMove(order, 'done', 'doing')).toEqual({ afterId: 'todo' })
    expect(columnMove(order, 'review', 'todo')).toEqual({ beforeId: 'todo' })
  })

  it('moves nothing when dropped where it was', () => {
    expect(columnMove(order, 'doing', 'doing')).toBeNull()
    expect(columnMove(order, 'doing', 'elsewhere')).toBeNull()
  })
})
