import { describe, expect, it } from 'vitest'

import { quickAdd } from '@/application/quickAdd'
import { aBoard, fakeBoardsApi } from '@/testing/fakeBoardsApi'

const today = '2026-10-07'

function boards() {
  const inbox = aBoard({
    name: 'Inbox',
    keyPrefix: 'INB',
    inbox: true,
    sections: []
  })
  const design = aBoard({
    name: 'Product Design',
    keyPrefix: 'DES',
    members: [
      { userId: 'u-alice', email: 'alice@example.com' },
      { userId: 'u-bob', email: 'bob@example.com' }
    ],
    labels: [{ id: 'l-urgent', name: 'Urgent' }]
  })
  return { inbox, design, api: fakeBoardsApi([inbox, design]) }
}

describe('quickAdd', () => {
  it('lands in the Inbox without a board', async () => {
    const { inbox, api } = boards()

    const added = await quickAdd(api, 'Buy milk tomorrow p2', today)

    expect(added).toMatchObject({ boardId: inbox.id, key: 'INB-1' })
    expect(inbox.tasks).toMatchObject([
      { title: 'Buy milk', priority: 2, dueDate: '2026-10-08', sectionId: null }
    ])
  })

  it('finds the board, section, labels and people by name', async () => {
    const { design, api } = boards()

    await quickAdd(
      api,
      'Logo #productdesign /in-progress %urgent %brand +alice',
      today
    )

    const label = design.labels.find(each => each.name === 'brand')
    expect(design.tasks).toMatchObject([
      {
        title: 'Logo',
        sectionId: design.sections[1]?.id,
        labels: [{ id: 'l-urgent' }, { id: label?.id }],
        assignees: [{ userId: 'u-alice' }]
      }
    ])
  })

  it('finds a board by its key prefix', async () => {
    const { design, api } = boards()

    await quickAdd(api, 'Logo #des', today)

    expect(design.tasks).toHaveLength(1)
  })

  it.each([
    ['Logo #Marketing', 'unknown_board', 'Marketing'],
    ['Logo #DES /Review', 'unknown_section', 'Review'],
    ['Logo #DES +carol', 'unknown_person', 'carol'],
    ['#DES p1 tomorrow', 'no_title', undefined]
  ])('refuses "%s" before creating anything', async (line, code, typed) => {
    const { inbox, design, api } = boards()

    await expect(quickAdd(api, line, today)).rejects.toMatchObject({
      code,
      typed
    })
    expect([...inbox.tasks, ...design.tasks]).toEqual([])
  })
})
