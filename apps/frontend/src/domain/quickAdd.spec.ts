import { describe, expect, it } from 'vitest'

import { parseQuickAdd } from '@/domain/quickAdd'

// A Wednesday.
const today = '2026-10-07'
const parse = (line: string) => parseQuickAdd(line, today)

describe('parseQuickAdd', () => {
  it('reads a date, a time, a priority and a board', () => {
    expect(parse('Call Bob tomorrow 3pm p1 #Design')).toEqual({
      title: 'Call Bob',
      board: 'Design',
      priority: 1,
      dueDate: '2026-10-08',
      dueTime: '15:00',
      labels: [],
      people: []
    })
  })

  it('reads the same line in French', () => {
    expect(parse('Appeler Bob demain à 15h p1 #Design')).toMatchObject({
      title: 'Appeler Bob',
      board: 'Design',
      priority: 1,
      dueDate: '2026-10-08',
      dueTime: '15:00'
    })
  })

  it.each([
    ['today', '2026-10-07'],
    ["aujourd'hui", '2026-10-07'],
    ['after tomorrow', '2026-10-09'],
    ['après-demain', '2026-10-09'],
    ['monday', '2026-10-12'],
    ['next wednesday', '2026-10-14'],
    ['lundi prochain', '2026-10-12'],
    ['in 3 days', '2026-10-10'],
    ['dans 2 semaines', '2026-10-21'],
    ['in 1 month', '2026-11-07'],
    ['nov 2', '2026-11-02'],
    ['January 5th', '2027-01-05'],
    ['le 2 novembre', '2026-11-02'],
    ['1er mars 2027', '2027-03-01'],
    ['2026-12-24', '2026-12-24']
  ])('reads "%s" as a due date', (words, dueDate) => {
    expect(parse(`Pay rent ${words}`)).toMatchObject({
      title: 'Pay rent',
      dueDate
    })
  })

  it.each([
    ['at 9am', '09:00'],
    ['12:30pm', '12:30'],
    ['12am', '00:00'],
    ['17:45', '17:45'],
    ['à 8h30', '08:30']
  ])(
    'reads "%s" as a time, today unless a date says otherwise',
    (words, dueTime) => {
      expect(parse(`Stand-up ${words}`)).toMatchObject({
        title: 'Stand-up',
        dueDate: today,
        dueTime
      })
    }
  )

  it.each([
    ['every day', { every: 1, unit: 'days', fromCompletion: false }, today],
    [
      'every 2 weeks',
      { every: 2, unit: 'weeks', fromCompletion: false },
      today
    ],
    [
      'every! 3 months',
      { every: 3, unit: 'months', fromCompletion: true },
      today
    ],
    ['weekly', { every: 1, unit: 'weeks', fromCompletion: false }, today],
    [
      'every friday',
      { every: 1, unit: 'weeks', fromCompletion: false },
      '2026-10-09'
    ],
    [
      'tous les jours',
      { every: 1, unit: 'days', fromCompletion: false },
      today
    ],
    [
      'toutes les 2 semaines',
      { every: 2, unit: 'weeks', fromCompletion: false },
      today
    ],
    ['chaque mois', { every: 1, unit: 'months', fromCompletion: false }, today],
    [
      'tous les lundis',
      { every: 1, unit: 'weeks', fromCompletion: false },
      '2026-10-12'
    ]
  ])('reads "%s" as a recurrence', (words, recurrence, dueDate) => {
    expect(parse(`Water plants ${words}`)).toMatchObject({
      title: 'Water plants',
      recurrence,
      dueDate
    })
  })

  it('starts a recurrence from its own date', () => {
    expect(parse('Report every month nov 2')).toMatchObject({
      title: 'Report',
      dueDate: '2026-11-02',
      recurrence: { every: 1, unit: 'months' }
    })
  })

  it('reads sections, labels, people, a deadline and a duration', () => {
    expect(
      parse('Draft /Doing %urgent %ops +alice +bob {friday} !30m Release notes')
    ).toEqual({
      title: 'Draft Release notes',
      section: 'Doing',
      labels: ['urgent', 'ops'],
      people: ['alice', 'bob'],
      deadline: '2026-10-09',
      duration: { amount: 30, unit: 'minutes' }
    })
  })

  it.each([
    ['!2h', { amount: 120, unit: 'minutes' }],
    ['!3d', { amount: 3, unit: 'days' }],
    ['!3j', { amount: 3, unit: 'days' }]
  ])('reads "%s" as a duration', (words, duration) => {
    expect(parse(`Write ${words}`)).toMatchObject({ duration })
  })

  it('leaves words that only look like dates in the title', () => {
    expect(parse('Read Monday.com docs about Mars')).toEqual({
      title: 'Read Monday.com docs about Mars',
      labels: [],
      people: []
    })
  })
})
