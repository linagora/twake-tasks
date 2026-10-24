import { describe, expect, it } from 'vitest'

import {
  createTask,
  defaultBoard,
  type NewTaskDraft
} from '@/application/newTask'
import { aBoard, fakeBoardsApi } from '@/testing/fakeBoardsApi'

const draft = (changes: Partial<NewTaskDraft> = {}): NewTaskDraft => ({
  title: 'Logo',
  description: '',
  assigneeIds: [],
  labelIds: [],
  dueDate: null,
  priority: null,
  ...changes
})

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
    members: [{ userId: 'u-alice', email: 'alice@example.com', name: null }],
    labels: [{ id: 'l-urgent', name: 'Urgent', color: null }]
  })
  return { inbox, design, api: fakeBoardsApi([inbox, design]) }
}

describe('createTask', () => {
  it('creates the task with everything the draft holds', async () => {
    const { design, api } = boards()

    const created = await createTask(
      api,
      design.id,
      draft({
        title: '  Logo  ',
        description: 'Three **variants**',
        assigneeIds: ['u-alice'],
        labelIds: ['l-urgent'],
        dueDate: '2026-10-08',
        priority: 1
      })
    )

    expect(created).toEqual({ boardId: design.id, key: 'DES-1' })
    const [task] = design.tasks
    expect(task).toMatchObject({
      title: 'Logo',
      priority: 1,
      dueDate: '2026-10-08',
      assignees: [{ userId: 'u-alice' }],
      labels: [{ id: 'l-urgent' }]
    })
    expect(await api.getDescription(design.id, task?.id ?? '')).toEqual({
      markdown: 'Three **variants**',
      version: 1
    })
  })

  it('lands in the first open section, and outside sections without any', async () => {
    const { inbox, design, api } = boards()

    await createTask(api, design.id, draft())
    await createTask(api, inbox.id, draft({ title: 'Milk' }))

    expect(design.tasks[0]?.sectionId).toBe(
      design.sections.find(section => section.category === 'unstarted')?.id
    )
    expect(inbox.tasks[0]?.sectionId).toBe(null)
  })

  it('lands in the section picked', async () => {
    const { design, api } = boards()
    const started = design.sections.find(
      section => section.category === 'started'
    )

    await createTask(api, design.id, draft({ sectionId: started?.id ?? '' }))

    expect(design.tasks[0]?.sectionId).toBe(started?.id)
    expect(api.getBoard).not.toHaveBeenCalled()
  })

  it('leaves out what the draft does not hold', async () => {
    const { design, api } = boards()

    await createTask(api, design.id, draft())

    expect(api.editTask).not.toHaveBeenCalled()
    expect(api.setDescription).not.toHaveBeenCalled()
    expect(api.setLabels).not.toHaveBeenCalled()
    expect(api.setAssignees).not.toHaveBeenCalled()
  })
})

describe('defaultBoard', () => {
  it('is the board it is opened from, else the Inbox', async () => {
    const { inbox, design, api } = boards()
    const summaries = await api.listBoards()

    expect(defaultBoard(summaries, design.id)?.id).toBe(design.id)
    expect(defaultBoard(summaries)?.id).toBe(inbox.id)
  })

  it.each([
    ['archived', { archived: true }],
    ['read only', { role: 'viewer' as const }]
  ])(
    'is the Inbox when the board it is opened from is %s',
    async (_case, closed) => {
      const { inbox, design } = boards()
      const api = fakeBoardsApi([inbox, { ...design, ...closed }])

      expect(defaultBoard(await api.listBoards(), design.id)?.id).toBe(inbox.id)
    }
  )
})
