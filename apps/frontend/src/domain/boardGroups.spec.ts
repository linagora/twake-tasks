import { describe, expect, it } from 'vitest'

import type { BoardSummary, ProjectSummary } from './board'
import { groupBoards } from './boardGroups'

const personal: ProjectSummary = {
  id: 'p-personal',
  name: 'Personal',
  personal: true,
  managed: false
}
const marketing: ProjectSummary = {
  id: 'p-marketing',
  name: 'Marketing',
  personal: false,
  managed: false
}
const acme: ProjectSummary = {
  id: 'p-acme',
  name: 'acme space',
  personal: false,
  managed: true
}

function board(
  name: string,
  project: ProjectSummary,
  overrides: Partial<BoardSummary> = {}
): BoardSummary {
  return {
    id: `b-${name}`,
    name,
    keyPrefix: name.slice(0, 3).toUpperCase(),
    project,
    inbox: false,
    role: 'admin',
    archived: false,
    favorite: false,
    openTasks: 0,
    ...overrides
  }
}

const names = (boards: BoardSummary[]) => boards.map(b => b.name)

describe('groupBoards', () => {
  it('puts the personal project first, then the others by name', () => {
    const groups = groupBoards([
      board('Inbox', personal, { inbox: true }),
      board('Launch', marketing),
      board('Notes', personal),
      board('Ops', acme)
    ])

    expect(groups.starred).toEqual([])
    expect(groups.projects.map(g => g.project.id)).toEqual([
      'p-personal',
      'p-acme',
      'p-marketing'
    ])
    expect(names(groups.projects[0]?.boards ?? [])).toEqual(['Inbox', 'Notes'])
  })

  it('keeps the order the boards came in within a project', () => {
    const groups = groupBoards([
      board('Zeta', marketing),
      board('Alpha', marketing)
    ])

    expect(names(groups.projects[0]?.boards ?? [])).toEqual(['Zeta', 'Alpha'])
  })

  it('pins starred boards apart, and drops a project left empty', () => {
    const groups = groupBoards([
      board('Inbox', personal, { inbox: true }),
      board('Launch', marketing, { favorite: true }),
      board('Ops', acme)
    ])

    expect(names(groups.starred)).toEqual(['Launch'])
    expect(groups.projects.map(g => g.project.id)).toEqual([
      'p-personal',
      'p-acme'
    ])
  })
})
