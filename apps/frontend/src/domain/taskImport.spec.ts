import { describe, expect, it } from 'vitest'

import { dueOf, guessMapping, readRow, timeOf } from '@/domain/taskImport'

describe('reading tasks from a CSV file', () => {
  it('guesses the columns of a Trello export and of the app in French', () => {
    expect(
      guessMapping(['Card ID', 'Card Name', 'List Name', 'Labels', 'Due'], {})
    ).toEqual({ key: 0, title: 1, section: 2, labels: 3, dueDate: 4 })
    expect(
      guessMapping(['Clé', 'Titre', 'Échéance'], {
        key: 'Clé',
        title: 'Titre',
        dueDate: 'Échéance'
      })
    ).toEqual({ key: 0, title: 1, dueDate: 2 })
  })

  it('reads dates in the order of the reader, unless the day tells', () => {
    expect(dueOf('03/04/2026', true)).toEqual({
      date: '2026-04-03',
      time: null
    })
    expect(dueOf('03/04/2026', false)).toEqual({
      date: '2026-03-04',
      time: null
    })
    expect(dueOf('13/04/2026', false)).toEqual({
      date: '2026-04-13',
      time: null
    })
    expect(dueOf('2026-02-30', true)).toBeNull()
    expect(dueOf('2026-04-03 14:30', true)).toEqual({
      date: '2026-04-03',
      time: '14:30'
    })
    expect(dueOf('04/03/2026 2:30 PM', false)).toEqual({
      date: '2026-04-03',
      time: '14:30'
    })
    expect(timeOf('2:05 pm')).toBe('14:05')
    expect(timeOf('25:00')).toBeNull()
  })

  it('builds the task of a row, and says why a row is skipped', () => {
    const mapping = {
      title: 0,
      priority: 1,
      dueDate: 2,
      assignees: 3,
      labels: 4
    }
    expect(
      readRow(
        ['  Logo  ', 'High', '2026-04-03', 'alice@x.org; bob@x.org', 'design'],
        mapping,
        true
      )
    ).toEqual({
      row: {
        title: 'Logo',
        priority: 2,
        dueDate: '2026-04-03',
        assignees: ['alice@x.org', 'bob@x.org'],
        labels: ['design']
      }
    })
    expect(readRow(['', 'P1'], mapping, true)).toEqual({ skipped: 'title' })
    expect(readRow(['Logo', 'soon'], mapping, true)).toEqual({
      skipped: 'priority'
    })
    expect(readRow(['Logo', '', 'tomorrow'], mapping, true)).toEqual({
      skipped: 'date'
    })
  })
})
