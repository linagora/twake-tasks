import { describe, expect, it } from 'vitest'

import { applyMove, moveInto } from '@/application/moveTask'
import { aTask } from '@/testing/fakeBoardsApi'

describe('moveInto', () => {
  it('places a task between the neighbours it was dropped between', () => {
    expect(moveInto('s1', ['a', 'b', 'c'], 1)).toEqual({
      sectionId: 's1',
      afterId: 'a',
      beforeId: 'b'
    })
  })

  it('places a task first or last with a single neighbour', () => {
    expect(moveInto('s1', ['a', 'b'], 0)).toEqual({
      sectionId: 's1',
      beforeId: 'a'
    })
    expect(moveInto(null, ['a', 'b'], 2)).toEqual({
      sectionId: null,
      afterId: 'b'
    })
  })

  it('needs no neighbour in an empty column', () => {
    expect(moveInto('s1', [], 0)).toEqual({ sectionId: 's1' })
  })
})

describe('applyMove', () => {
  const todo = { id: 's1' }
  const done = { id: 's2' }
  const logo = aTask(null, { id: 'logo', sectionId: todo.id })
  const poster = aTask(null, { id: 'poster', sectionId: todo.id })
  const flyer = aTask(null, { id: 'flyer', sectionId: done.id })
  const order = (tasks: { id: string; sectionId: string | null }[]) =>
    tasks.map(task => `${task.sectionId ?? '-'}:${task.id}`)

  it('moves a task into another section before its new neighbour', () => {
    expect(
      order(
        applyMove([logo, poster, flyer], 'logo', {
          sectionId: done.id,
          beforeId: 'flyer'
        })
      )
    ).toEqual(['s1:poster', 's2:logo', 's2:flyer'])
  })

  it('moves a task after its new neighbour', () => {
    expect(
      order(
        applyMove([logo, poster, flyer], 'logo', {
          sectionId: todo.id,
          afterId: 'poster'
        })
      )
    ).toEqual(['s1:poster', 's1:logo', 's2:flyer'])
  })

  it('moves a task to the end of an empty section', () => {
    expect(
      order(applyMove([logo, poster], 'poster', { sectionId: done.id }))
    ).toEqual(['s1:logo', 's2:poster'])
  })
})
