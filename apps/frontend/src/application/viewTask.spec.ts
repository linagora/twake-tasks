import { describe, expect, it } from 'vitest'

import {
  createViewTask,
  keptSection,
  openSection,
  placeInColumn,
  viewMove,
  viewTaskDefaults
} from '@/application/viewTask'
import type { BoardSummary, Section } from '@/domain/board'
import { aBoard, fakeBoardsApi } from '@/testing/fakeBoardsApi'

const summary = (
  id: string,
  overrides: Partial<BoardSummary> = {}
): BoardSummary => ({
  id,
  name: id,
  keyPrefix: id.toUpperCase(),
  project: { id: 'p', name: 'p', personal: false, managed: false },
  inbox: false,
  role: 'editor',
  archived: false,
  favorite: false,
  openTasks: 0,
  doneTasks: 0,
  totalTasks: 0,
  ...overrides
})

const boards = [
  summary('design'),
  summary('inbox', { inbox: true }),
  summary('read', { role: 'viewer' })
]

describe('viewTaskDefaults', () => {
  it('puts the task in the inbox unless the view keeps to a board', () => {
    expect(viewTaskDefaults({}, boards, '2026-10-16').boardId).toBe('inbox')
    expect(
      viewTaskDefaults({ boards: ['design'] }, boards, '2026-10-16').boardId
    ).toBe('design')
    expect(
      viewTaskDefaults({ boards: ['read'] }, boards, '2026-10-16').boardId
    ).toBe('inbox')
  })

  it('takes the assignee, priority, label and a due date in range', () => {
    expect(
      viewTaskDefaults(
        {
          assignees: ['me'],
          priorities: [2],
          labels: ['design'],
          dues: ['overdue']
        },
        boards,
        '2026-10-16'
      )
    ).toEqual({
      boardId: 'inbox',
      mine: true,
      priority: 2,
      label: 'design',
      dueDate: '2026-10-15'
    })
    expect(
      viewTaskDefaults({ dues: ['week'] }, boards, '2026-10-16').dueDate
    ).toBe('2026-10-16')
    expect(
      viewTaskDefaults({ dues: ['none'] }, boards, '2026-10-16').dueDate
    ).toBeNull()
  })
})

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

describe('placeInColumn', () => {
  const inbox = {
    id: 'inbox',
    sections: [{ id: 'i1', name: 'To do', category: 'unstarted' as const }]
  }
  const site = {
    id: 'site',
    sections: [
      { id: 's1', name: 'to do', category: 'unstarted' as const },
      { id: 's2', name: 'Review', category: 'started' as const }
    ]
  }

  it('prefers the view’s board, then a board with the section', () => {
    expect(placeInColumn('inbox', [site, inbox], 'To do')).toEqual({
      boardId: 'inbox',
      sectionId: 'i1'
    })
    expect(placeInColumn('inbox', [site, inbox], 'Review')).toEqual({
      boardId: 'site',
      sectionId: 's2'
    })
  })

  it('falls back on the view’s board with no section', () => {
    expect(placeInColumn('inbox', [site, inbox], null)).toEqual({
      boardId: 'inbox',
      sectionId: null
    })
    expect(placeInColumn('inbox', [site, inbox], 'Ideas')).toEqual({
      boardId: 'inbox',
      sectionId: null
    })
  })
})

describe('viewMove', () => {
  const board = {
    sections: [
      { id: 'a', name: 'To do', category: 'unstarted' as const },
      { id: 'b', name: 'Done', category: 'completed' as const }
    ]
  }
  const mine = (id: string) => id.startsWith('mine')

  it('moves to the section of the same name, beside tasks of its board', () => {
    expect(
      viewMove(
        board,
        'done',
        { sectionId: 'x', afterId: 'mine-1', beforeId: 'other-1' },
        mine
      )
    ).toEqual({ sectionId: 'b', afterId: 'mine-1' })
    expect(viewMove(board, null, { sectionId: 'none' }, mine)).toEqual({
      sectionId: null
    })
  })

  it('refuses a section its board has not', () => {
    expect(viewMove(board, 'Review', { sectionId: 'x' }, mine)).toBeNull()
  })
})

describe('createViewTask', () => {
  it('makes the section of the view’s status its board lacks', async () => {
    const inbox = aBoard({ name: 'Inbox', inbox: true, sections: [] })
    const api = fakeBoardsApi([inbox])

    await createViewTask(
      api,
      {
        title: 'Test',
        boardId: inbox.id,
        sectionId: null,
        newSection: 'In progress',
        mine: false,
        priority: null,
        label: null,
        dueDate: null
      },
      inbox,
      null
    )

    const section = inbox.sections.find(each => each.name === 'In progress')
    expect(section).toMatchObject({ name: 'In progress', category: 'started' })
    expect(inbox.tasks.find(each => each.title === 'Test')).toMatchObject({
      sectionId: section?.id
    })
  })
})
