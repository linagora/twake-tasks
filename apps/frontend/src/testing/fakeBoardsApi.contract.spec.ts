import * as wire from '@twake-tasks/api-contract'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

import {
  aBoard,
  aNotification,
  aProject,
  aTask,
  fakeBoardsApi
} from './fakeBoardsApi'

type Answers = Record<string, [z.ZodType, unknown]>

const drifts = (answers: Answers) =>
  Object.entries(answers).flatMap(([name, [schema, value]]) => {
    const issues = schema.safeParse(value).error?.issues ?? []
    return issues.map(issue => `${name}: ${issue.path.join('.')}`)
  })

const alice = {
  userId: 'alice',
  email: 'alice@example.com',
  name: 'Alice Martin',
  avatar: null
}

function aSeededFake() {
  const label = { id: 'label-1', name: 'Brand', color: '#336699' }
  const board = aBoard({ members: [alice], labels: [label] })
  const target = aBoard({ keyPrefix: 'OPS' })
  const task = aTask(board.sections[0] ?? null, {
    priority: 2,
    dueDate: '2026-10-28',
    dueTime: '09:30',
    dueZone: 'Europe/Paris',
    deadline: '2026-10-30',
    duration: { amount: 30, unit: 'minutes' },
    recurrence: { every: 1, unit: 'weeks', fromCompletion: false },
    assignees: [{ ...alice, userId: 'me' }],
    labels: [label]
  })
  board.tasks.push(task)
  const fake = fakeBoardsApi([board, target])
  fake.projects.push({ ...aProject(), role: 'admin' })
  fake.directory.push({ ...alice, userId: 'bob', email: 'bob@example.com' })
  fake.notifications.push(aNotification({ boardId: board.id }))
  return { fake, board, target, task }
}

describe('the fake boards API', () => {
  it('answers reads in the shapes the backend answers', async () => {
    const { fake, board, task } = aSeededFake()
    const at = [board.id, task.id] as const
    await fake.addComment(...at, 'Looks good')
    const [comment] = await fake.listComments(...at)
    await fake.addReaction(...at, comment?.id ?? '', '👍')
    await fake.addReminder(...at, { at: '2099-01-01T09:00:00.000Z' })
    await fake.addReminder(...at, { beforeMinutes: 30, zone: 'Europe/Paris' })
    await fake.setDescription(...at, { markdown: 'Plan', version: 0 })
    await fake.invite(board.id, 'carol@example.com', 'editor')
    const { id: filterId } = await fake.createFilter({
      name: 'Urgent',
      criteria: { priority: [2] }
    })

    expect(
      drifts({
        settings: [wire.settingsResponse, await fake.settings()],
        agenda: [wire.agendaResponse, await fake.agenda('Europe/Paris', 60)],
        listFilters: [
          wire.filtersResponse,
          { filters: await fake.listFilters() }
        ],
        labelNames: [
          wire.labelNamesResponse,
          { labels: await fake.labelNames() }
        ],
        people: [wire.peopleResponse, { people: await fake.people() }],
        filteredTasks: [
          wire.tasksResponse,
          { tasks: await fake.filteredTasks(filterId, 'Europe/Paris') }
        ],
        search: [wire.searchResponse, { tasks: await fake.search('logo') }],
        myTasks: [wire.tasksResponse, { tasks: await fake.myTasks() }],
        listBoards: [wire.boardsResponse, { boards: await fake.listBoards() }],
        getBoard: [wire.boardResponse, await fake.getBoard(board.id)],
        checkKeyPrefix: [
          wire.keyPrefixResponse,
          await fake.checkKeyPrefix('DES')
        ],
        listProjects: [
          wire.projectsResponse,
          { projects: await fake.listProjects() }
        ],
        getSharing: [wire.sharingResponse, await fake.getSharing(board.id)],
        suggestPeople: [
          wire.peopleResponse,
          { people: await fake.suggestPeople(board.id, 'bob') }
        ],
        getDescription: [
          wire.descriptionResponse,
          await fake.getDescription(...at)
        ],
        listComments: [
          wire.commentsResponse,
          { comments: await fake.listComments(...at) }
        ],
        listReminders: [
          wire.remindersResponse,
          { reminders: await fake.listReminders(...at) }
        ],
        following: [
          wire.followingResponse,
          { following: await fake.following(...at) }
        ],
        listNotifications: [
          wire.notificationsResponse,
          { notifications: await fake.listNotifications() }
        ],
        unreadByProject: [
          wire.unreadResponse,
          { projects: await fake.unreadByProject() }
        ]
      })
    ).toEqual([])
  })

  it('answers writes in the shapes the backend answers', async () => {
    const { fake, board, target, task } = aSeededFake()
    const at = [board.id, task.id] as const
    const to = { boardId: target.id, sectionId: null }
    const answers: Answers = {
      createFilter: [
        wire.createdFilterResponse,
        await fake.createFilter({ name: 'Mine', criteria: { due: ['today'] } })
      ],
      createBoard: [
        wire.boardResponse,
        await fake.createBoard({
          name: 'Plan',
          keyPrefix: 'PLAN',
          language: 'en'
        })
      ],
      createTask: [
        wire.createdTaskResponse,
        await fake.createTask(board.id, { sectionId: null, title: 'Brief' })
      ],
      setDescription: [
        wire.descriptionVersionResponse,
        await fake.setDescription(...at, { markdown: 'Plan', version: 0 })
      ],
      createLabel: [
        wire.label,
        await fake.createLabel(board.id, { name: 'Ops', color: '#112233' })
      ],
      editLabel: [
        wire.label,
        await fake.editLabel(board.id, 'label-1', { name: 'Brand 2' })
      ],
      createSection: [
        wire.section,
        await fake.createSection(board.id, {
          name: 'Review',
          category: 'started'
        })
      ],
      previewTransfer: [
        wire.transferPreviewResponse,
        await fake.previewTransfer(...at, to)
      ]
    }
    await fake.archiveTask(...at)
    answers.hiddenTasks = [
      wire.hiddenTasksResponse,
      { tasks: await fake.hiddenTasks(board.id, 'archived') }
    ]
    await fake.restoreTask(...at)
    answers.transferTask = [
      wire.transferResponse,
      await fake.transferTask(...at, to)
    ]

    expect(drifts(answers)).toEqual([])
  })
})
