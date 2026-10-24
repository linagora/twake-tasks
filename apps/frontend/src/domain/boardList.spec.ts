import { describe, expect, it } from 'vitest'

import type { BoardSummary, ProjectSummary } from './board'
import { listBoards } from './boardList'

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
    doneTasks: 0,
    totalTasks: 0,
    joinedAt: '2026-01-01T00:00:00Z',
    sharedBy: null,
    members: [],
    memberCount: 0,
    ...overrides
  }
}

const names = (boards: BoardSummary[]) => boards.map(b => b.name)

describe('listBoards', () => {
  it('puts the personal boards first, the inbox leading, then the others by name', () => {
    const boards = listBoards([
      board('Launch', marketing),
      board('Notes', personal),
      board('Inbox', personal, { inbox: true }),
      board('ads', marketing)
    ])

    expect(names(boards)).toEqual(['Inbox', 'Notes', 'ads', 'Launch'])
  })

  it('puts the favorites before the others, in the same order', () => {
    const boards = listBoards([
      board('Launch', marketing, { favorite: true }),
      board('Ads', marketing),
      board('Notes', personal),
      board('Brand', marketing, { favorite: true })
    ])

    expect(names(boards)).toEqual(['Brand', 'Launch', 'Notes', 'Ads'])
  })
})
