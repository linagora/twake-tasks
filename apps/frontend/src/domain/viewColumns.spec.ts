import { describe, expect, it } from 'vitest'

import type { Section } from '@/domain/board'
import { viewColumns, type ViewColumn } from '@/domain/viewColumns'

const section = (
  id: string,
  name: string,
  category: Section['category']
): Section => ({ id, name, category })

const board = (id: string, sections: Section[]) => ({ id, sections })

const task = (key: string, boardId: string, sectionId: string | null) => ({
  key,
  boardId,
  sectionId
})

const design = board('design', [
  section('d1', 'To do', 'unstarted'),
  section('d2', 'Review', 'started'),
  section('d3', 'Done', 'completed')
])
const site = board('site', [
  section('s1', 'Backlog', 'backlog'),
  section('s2', 'to do', 'unstarted'),
  section('s3', 'In progress', 'started'),
  section('s4', 'Done', 'completed')
])
const unused = board('unused', [section('u1', 'Ideas', 'backlog')])

const shown = (columns: ViewColumn<{ key: string }>[]) =>
  columns.map(
    column =>
      `${column.name ?? '-'}: ${column.tasks.map(each => each.key).join(' ')}`
  )

describe('viewColumns', () => {
  const tasks = [
    task('DES-1', 'design', 'd1'),
    task('SIT-1', 'site', 's2'),
    task('SIT-2', 'site', 's3'),
    task('DES-2', 'design', null)
  ]

  it('merges the sections of the same name, keeping those with tasks', () => {
    expect(shown(viewColumns(tasks, [design, site, unused], false))).toEqual([
      '-: DES-2',
      'To do: DES-1 SIT-1',
      'In progress: SIT-2'
    ])
  })

  it('shows every section of the boards with a task, by category', () => {
    expect(shown(viewColumns(tasks, [design, site, unused], true))).toEqual([
      '-: DES-2',
      'Backlog: ',
      'To do: DES-1 SIT-1',
      'Review: ',
      'In progress: SIT-2',
      'Done: '
    ])
  })

  it('puts the tasks of a board not loaded yet in no section', () => {
    expect(shown(viewColumns(tasks, [design], false))).toEqual([
      '-: SIT-1 SIT-2 DES-2',
      'To do: DES-1'
    ])
  })
})
