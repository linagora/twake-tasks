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
  dueTime: null,
  dueZone: null,
  recurrence: null,
  reminders: [],
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

  it('creates the task with its due time, repeat and reminders', async () => {
    const { design, api } = boards()
    const at = '2030-01-02T09:00:00.000Z'

    await createTask(
      api,
      design.id,
      draft({
        dueDate: '2030-01-03',
        dueTime: '15:00',
        dueZone: 'Europe/Paris',
        recurrence: { every: 1, unit: 'weeks', fromCompletion: false },
        reminders: [{ beforeMinutes: 60, zone: 'Europe/Paris' }, { at }]
      })
    )

    const [task] = design.tasks
    expect(task).toMatchObject({
      dueDate: '2030-01-03',
      dueTime: '15:00',
      dueZone: 'Europe/Paris',
      recurrence: { every: 1, unit: 'weeks', fromCompletion: false }
    })
    expect(await api.listReminders(design.id, task?.id ?? '')).toMatchObject([
      { beforeMinutes: 60, at: null },
      { beforeMinutes: null, at }
    ])
  })

  it('adds only the reminders still missing when finishing a task', async () => {
    const { design, api } = boards()
    const at = '2030-01-02T09:00:00.000Z'
    const started = await api.createTask(design.id, {
      title: 'Logo',
      sectionId: null
    })
    await api.editTask(design.id, started.id, { dueDate: '2030-01-03' })
    await api.addReminder(design.id, started.id, { at })

    await createTask(
      api,
      design.id,
      draft({
        dueDate: '2030-01-03',
        reminders: [{ at }, { beforeMinutes: 15, zone: 'UTC' }]
      }),
      started
    )

    expect(await api.listReminders(design.id, started.id)).toMatchObject([
      { at },
      { beforeMinutes: 15 }
    ])
  })

  it('removes the reminders taken out of the draft when finishing a task', async () => {
    const { design, api } = boards()
    const started = await api.createTask(design.id, {
      title: 'Logo',
      sectionId: null
    })
    await api.addReminder(design.id, started.id, {
      at: '2030-01-02T09:00:00.000Z'
    })

    await createTask(api, design.id, draft(), started)

    expect(await api.listReminders(design.id, started.id)).toEqual([])
  })

  it('leaves out what the draft does not hold', async () => {
    const { design, api } = boards()

    await createTask(api, design.id, draft())

    expect(api.editTask).not.toHaveBeenCalled()
    expect(api.setDescription).not.toHaveBeenCalled()
    expect(api.setLabels).not.toHaveBeenCalled()
    expect(api.setAssignees).not.toHaveBeenCalled()
    expect(api.addReminder).not.toHaveBeenCalled()
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

  it('is the first board when none is the Inbox', async () => {
    const { design } = boards()
    const roadmap = aBoard({ name: 'Roadmap' })
    const api = fakeBoardsApi([design, roadmap])

    expect(defaultBoard(await api.listBoards(), 'elsewhere')?.id).toBe(
      design.id
    )
  })
})
