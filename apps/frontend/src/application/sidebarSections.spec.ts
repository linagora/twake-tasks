import { describe, expect, it } from 'vitest'

import type { SidebarSection } from '@/application/boards'
import {
  droppedItem,
  movedSection,
  sectionOf,
  withItem,
  withoutItem
} from '@/application/sidebarSections'

const board = (id: string) => ({ kind: 'board' as const, id })
const view = (id: string) => ({ kind: 'view' as const, id })

const sections = (): SidebarSection[] => [
  {
    id: 'work',
    name: 'Work',
    favorites: false,
    items: [board('a'), board('b'), view('c')]
  },
  { id: 'home', name: 'Home', favorites: false, items: [view('d')] }
]

const itemsOf = (all: SidebarSection[]) =>
  all.map(section => section.items.map(item => item.id))

describe('sidebar sections', () => {
  it('moves an item to the end of a section, out of the one it was in', () => {
    const moved = withItem(sections(), 'home', board('a'))

    expect(itemsOf(moved)).toEqual([
      ['b', 'c'],
      ['d', 'a']
    ])
    expect(itemsOf(withItem(moved, 'home', board('a')))).toEqual(itemsOf(moved))
    expect(itemsOf(withItem(sections(), 'home', board('e')))).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e']
    ])
  })

  it('takes an item out of its section, back to Favorites', () => {
    const left = withoutItem(sections(), board('a'))

    expect(itemsOf(left)).toEqual([['b', 'c'], ['d']])
    expect(sectionOf(left, board('a'))).toBe(null)
    expect(sectionOf(left, view('d'))).toBe('home')
  })

  it('moves a section up or down, not past the ends', () => {
    expect(movedSection(sections(), 'home', -1).map(s => s.id)).toEqual([
      'home',
      'work'
    ])
    expect(movedSection(sections(), 'home', 1).map(s => s.id)).toEqual([
      'work',
      'home'
    ])
  })

  it('reorders an item within its section, up or down', () => {
    expect(
      itemsOf(
        droppedItem(sections(), board('a'), { sectionId: 'work', index: 2 })
      )
    ).toEqual([['b', 'c', 'a'], ['d']])
    expect(
      itemsOf(
        droppedItem(sections(), view('c'), { sectionId: 'work', index: 0 })
      )
    ).toEqual([['c', 'a', 'b'], ['d']])
  })

  it('moves an item to another section, where it is dropped, wherever it is dragged from', () => {
    expect(
      itemsOf(
        droppedItem(sections(), board('b'), { sectionId: 'home', index: 0 })
      )
    ).toEqual([
      ['a', 'c'],
      ['b', 'd']
    ])
    expect(
      itemsOf(
        droppedItem(sections(), board('e'), { sectionId: 'home', index: 1 })
      )
    ).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e']
    ])
    expect(
      itemsOf(
        droppedItem(sections(), view('d'), { sectionId: 'work', index: 0 })
      )
    ).toEqual([['d', 'a', 'b', 'c'], []])
  })
})
