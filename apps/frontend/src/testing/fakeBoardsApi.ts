import { vi } from 'vitest'

import {
  ApiError,
  type AgendaTask,
  type BoardsApi,
  type Comment,
  type Description,
  type HistoryEntry,
  type Notification,
  type Reminder,
  type SavedFilter,
  type Sharing,
  type Project,
  type Shelf
} from '@/application/boards'
import type {
  Board,
  BoardSummary,
  Label,
  Person,
  ProjectSummary,
  Section,
  Task
} from '@/domain/board'

let counter = 0
const nextId = () => {
  counter += 1
  return `00000000-0000-7000-8000-${String(counter).padStart(12, '0')}`
}

export function aProject(
  overrides: Partial<ProjectSummary> = {}
): ProjectSummary {
  return {
    id: nextId(),
    name: 'Design',
    personal: false,
    managed: false,
    ...overrides
  }
}

export function aBoard(overrides: Partial<Board> = {}): Board {
  return {
    id: nextId(),
    name: 'Design',
    keyPrefix: 'DES',
    project: aProject(),
    inbox: false,
    archived: false,
    version: 1,
    role: 'admin',
    layout: 'board',
    defaultLayout: 'board',
    members: [],
    invited: [],
    labels: [],
    sections: [
      { id: nextId(), name: 'To do', category: 'unstarted' },
      { id: nextId(), name: 'In progress', category: 'started' },
      { id: nextId(), name: 'Done', category: 'completed' }
    ],
    tasks: [],
    ...overrides
  }
}

export function aTask(section: Section | null, overrides: Partial<Task> = {}) {
  return {
    id: nextId(),
    key: 'DES-1',
    sectionId: section?.id ?? null,
    parentId: null,
    title: 'Logo',
    priority: null,
    dueDate: null,
    dueTime: null,
    dueZone: null,
    deadline: null,
    duration: null,
    recurrence: null,
    completedAt: null,
    canceledAt: null,
    assignees: [],
    labels: [],
    commentCount: 0,
    ...overrides
  } satisfies Task
}

export function aNotification(
  overrides: Partial<Notification> = {}
): Notification {
  return {
    id: nextId(),
    reason: 'following',
    boardId: 'board-1',
    boardName: 'Design',
    taskId: 'task-1',
    key: 'DES-1',
    title: 'Logo',
    createdAt: '2026-10-05T10:00:00Z',
    readAt: null,
    actor: null,
    change: null,
    commentExcerpt: null,
    ...overrides
  }
}

function summaryOf(
  board: Board,
  favorite: boolean,
  share: Pick<BoardSummary, 'sharedBy' | 'joinedAt'> = {
    sharedBy: null,
    joinedAt: '2026-01-01T00:00:00Z'
  }
): BoardSummary {
  const counted = board.tasks.filter(
    task => task.parentId === null && task.canceledAt === null
  )
  return {
    id: board.id,
    name: board.name,
    keyPrefix: board.keyPrefix,
    project: board.project,
    inbox: board.inbox,
    role: board.role,
    archived: board.archived,
    favorite,
    openTasks: counted.filter(task => task.completedAt === null).length,
    doneTasks: counted.filter(task => task.completedAt !== null).length,
    totalTasks: counted.length,
    members: board.members.slice(0, 3),
    memberCount: board.members.length,
    ...share
  }
}

function sectionOf(board: Board, sectionId: string) {
  const section = board.sections.find(candidate => candidate.id === sectionId)
  if (!section) throw new ApiError(404, 'not_found')
  return section
}

export function fakeBoardsApi(boards: Board[] = []) {
  const store = new Map(boards.map(board => [board.id, board]))
  const find = (boardId: string) => {
    const board = store.get(boardId)
    if (!board) throw new ApiError(404, 'not_found')
    return board
  }

  const watchers = new Map<string, Set<(version: number) => void>>()
  const favorites = new Set<string>()
  const shares = new Map<string, Pick<BoardSummary, 'sharedBy' | 'joinedAt'>>()
  const descriptions = new Map<string, Description>()
  const comments = new Map<string, Comment[]>()
  const history = new Map<string, HistoryEntry[]>()
  const reminders = new Map<string, Reminder[]>()
  const followed = new Set<string>()
  const notifications: Notification[] = []
  const findTask = (boardId: string, taskId: string) => {
    const task = find(boardId).tasks.find(candidate => candidate.id === taskId)
    if (!task) throw new ApiError(404, 'not_found')
    return task
  }

  // The person of fakeUser, who the screens take to be signed in.
  const me: Person = {
    userId: 'alice',
    email: 'alice@example.com',
    name: 'Alice Martin',
    avatar: null
  }

  const findComment = (boardId: string, taskId: string, commentId: string) => {
    findTask(boardId, taskId)
    const comment = comments
      .get(taskId)
      ?.find(candidate => candidate.id === commentId)
    if (!comment) throw new ApiError(404, 'not_found')
    return comment
  }

  const agendaTask = (
    board: Board,
    task: Task
  ): AgendaTask & { projectId: string } => ({
    ...structuredClone(task),
    projectId: board.project.id,
    category:
      board.sections.find(section => section.id === task.sectionId)?.category ??
      null,
    boardId: board.id,
    boardName: board.name,
    parentTitle:
      board.tasks.find(candidate => candidate.id === task.parentId)?.title ??
      null
  })

  const filters: SavedFilter[] = []
  const openTasks = () =>
    [...store.values()].flatMap(board =>
      board.tasks
        .filter(
          task => !board.archived && !task.completedAt && !task.canceledAt
        )
        .map(task => agendaTask(board, task))
    )

  const sharings = new Map<string, Sharing>()
  const sharingOf = (boardId: string) => {
    find(boardId)
    const sharing = sharings.get(boardId) ?? { members: [], invites: [] }
    sharings.set(boardId, sharing)
    return sharing
  }

  const projects: Project[] = []
  const directory: Person[] = []

  const hidden = new Map<string, { shelf: Shelf; task: Task; at: string }>()
  const hide = (shelf: Shelf) => (boardId: string, taskId: string) =>
    Promise.resolve().then(() => {
      const board = find(boardId)
      if (board.archived) throw new ApiError(409, 'archived')
      const task = findTask(boardId, taskId)
      board.tasks = board.tasks.filter(candidate => candidate !== task)
      hidden.set(taskId, { shelf, task, at: new Date().toISOString() })
    })

  const api = {
    transferTask: vi.fn<BoardsApi['transferTask']>((boardId, taskId, to) =>
      Promise.resolve().then(() => {
        const source = find(boardId)
        const target = find(to.boardId)
        const task = findTask(boardId, taskId)
        source.tasks = source.tasks.filter(candidate => candidate !== task)
        task.key = `${target.keyPrefix}-${String(target.tasks.length + 1)}`
        task.sectionId = to.sectionId
        target.tasks.push(task)
        return { key: task.key, droppedAssignees: [], createdLabels: [] }
      })
    ),
    previewTransfer: vi.fn<BoardsApi['previewTransfer']>(() =>
      Promise.resolve({ droppedAssignees: [], createdLabels: [] })
    ),
    archiveTask: vi.fn<BoardsApi['archiveTask']>(hide('archived')),
    trashTask: vi.fn<BoardsApi['trashTask']>(hide('trash')),
    restoreTask: vi.fn<BoardsApi['restoreTask']>((boardId, taskId) =>
      Promise.resolve().then(() => {
        const entry = hidden.get(taskId)
        if (!entry) throw new ApiError(404, 'not_found')
        find(boardId).tasks.push(entry.task)
        hidden.delete(taskId)
      })
    ),
    hiddenTasks: vi.fn<BoardsApi['hiddenTasks']>((boardId, shelf) =>
      Promise.resolve().then(() => {
        find(boardId)
        return [...hidden.values()]
          .filter(entry => entry.shelf === shelf)
          .map(({ task, at }) => ({ ...task, at }))
      })
    ),
    renameBoard: vi.fn<BoardsApi['renameBoard']>((boardId, name) =>
      Promise.resolve().then(() => {
        find(boardId).name = name
      })
    ),
    setBoardArchived: vi.fn<BoardsApi['setBoardArchived']>(
      (boardId, archived) =>
        Promise.resolve().then(() => {
          find(boardId).archived = archived
        })
    ),
    listProjects: vi.fn<BoardsApi['listProjects']>(() =>
      Promise.resolve(structuredClone(projects))
    ),
    moveToProject: vi.fn<BoardsApi['moveToProject']>((boardId, projectId) =>
      Promise.resolve().then(() => {
        const board = find(boardId)
        const project = projects.find(({ id }) => id === projectId)
        if (!project) throw new ApiError(404, 'not_found')
        const { role, ...summary } = project
        board.project = summary
        board.role = role
        sharings.delete(boardId)
      })
    ),
    getSharing: vi.fn<BoardsApi['getSharing']>(boardId =>
      Promise.resolve().then(() => structuredClone(sharingOf(boardId)))
    ),
    suggestPeople: vi.fn<BoardsApi['suggestPeople']>((boardId, query) =>
      Promise.resolve().then(() => {
        const sharing = sharingOf(boardId)
        const taken = new Set([
          ...sharing.members.map(member => member.email.toLowerCase()),
          ...sharing.invites.map(pending => pending.email.toLowerCase())
        ])
        const q = query.toLowerCase()
        return directory.filter(
          person =>
            !taken.has(person.email.toLowerCase()) &&
            `${person.name ?? ''} ${person.email}`.toLowerCase().includes(q)
        )
      })
    ),
    invite: vi.fn<BoardsApi['invite']>((boardId, email, role) =>
      Promise.resolve().then(() => {
        const { invites } = sharingOf(boardId)
        const existing = invites.find(pending => pending.email === email)
        if (existing) existing.role = role
        else invites.push({ id: nextId(), email, role })
      })
    ),
    cancelInvite: vi.fn<BoardsApi['cancelInvite']>((boardId, inviteId) =>
      Promise.resolve().then(() => {
        const sharing = sharingOf(boardId)
        sharing.invites = sharing.invites.filter(each => each.id !== inviteId)
      })
    ),
    setMemberRole: vi.fn<BoardsApi['setMemberRole']>((boardId, userId, role) =>
      Promise.resolve().then(() => {
        const member = sharingOf(boardId).members.find(
          each => each.userId === userId
        )
        if (!member) throw new ApiError(404, 'not_found')
        member.role = role
      })
    ),
    removeMember: vi.fn<BoardsApi['removeMember']>((boardId, userId) =>
      Promise.resolve().then(() => {
        const sharing = sharingOf(boardId)
        sharing.members = sharing.members.filter(each => each.userId !== userId)
      })
    ),
    listFilters: vi.fn<BoardsApi['listFilters']>(() =>
      Promise.resolve(structuredClone(filters))
    ),
    createFilter: vi.fn<BoardsApi['createFilter']>(filter =>
      Promise.resolve().then(() => {
        const id = nextId()
        filters.push({ id, ...structuredClone(filter), favorite: false })
        return { id }
      })
    ),
    updateFilter: vi.fn<BoardsApi['updateFilter']>((filterId, filter) =>
      Promise.resolve().then(() => {
        const saved = filters.find(each => each.id === filterId)
        if (!saved) throw new ApiError(404, 'not_found')
        Object.assign(saved, structuredClone(filter))
      })
    ),
    setFilterFavorite: vi.fn<BoardsApi['setFilterFavorite']>(
      (filterId, favorite) =>
        Promise.resolve().then(() => {
          const filter = filters.find(each => each.id === filterId)
          if (!filter) throw new ApiError(404, 'not_found')
          filter.favorite = favorite
        })
    ),
    deleteFilter: vi.fn<BoardsApi['deleteFilter']>(filterId =>
      Promise.resolve().then(() => {
        const index = filters.findIndex(filter => filter.id === filterId)
        if (index < 0) throw new ApiError(404, 'not_found')
        filters.splice(index, 1)
      })
    ),
    labelNames: vi.fn<BoardsApi['labelNames']>(() =>
      Promise.resolve(
        [
          ...new Set(
            [...store.values()].flatMap(board =>
              board.labels.map(label => label.name.toLowerCase())
            )
          )
        ].sort()
      )
    ),
    people: vi.fn<BoardsApi['people']>(() =>
      Promise.resolve([
        ...new Map(
          [...store.values()].flatMap(board =>
            board.members.map(member => [member.userId, member])
          )
        ).values()
      ])
    ),
    filteredTasks: vi.fn<BoardsApi['filteredTasks']>(filterId =>
      Promise.resolve().then(() => {
        const filter = filters.find(candidate => candidate.id === filterId)
        if (!filter) throw new ApiError(404, 'not_found')
        const { board, priority, label } = filter.criteria
        const labels = label?.map(name => name.toLowerCase())
        return openTasks().filter(
          task =>
            (board === undefined || board.includes(task.boardId)) &&
            (priority === undefined ||
              (task.priority !== null && priority.includes(task.priority))) &&
            (labels === undefined ||
              task.labels.some(each =>
                labels.includes(each.name.toLowerCase())
              ))
        )
      })
    ),
    search: vi.fn<BoardsApi['search']>(text =>
      Promise.resolve(
        [...store.values()].flatMap(board =>
          board.tasks
            .filter(
              task =>
                task.key.toLowerCase().startsWith(text.toLowerCase()) ||
                task.title.toLowerCase().includes(text.toLowerCase())
            )
            .map(task => ({
              ...agendaTask(board, task),
              excerpt: null,
              match: task.key.toLowerCase().startsWith(text.toLowerCase())
                ? { field: 'key' as const, text: task.key }
                : { field: 'title' as const, text: task.title }
            }))
        )
      )
    ),
    settings: vi.fn<BoardsApi['settings']>(() =>
      Promise.resolve({
        language: null,
        timezone: null,
        theme: 'auto',
        avatar: null,
        name: null
      })
    ),
    agenda: vi.fn<BoardsApi['agenda']>((_zone, days) =>
      Promise.resolve().then(() => {
        const today = new Intl.DateTimeFormat('en-CA').format(new Date())
        const until = new Date(`${today}T00:00:00Z`)
        until.setUTCDate(until.getUTCDate() + days)
        const end = until.toISOString().slice(0, 10)
        const tasks = [...store.values()].flatMap(board =>
          board.tasks
            .filter(
              task =>
                task.dueDate !== null &&
                task.dueDate < end &&
                !task.completedAt &&
                !task.canceledAt
            )
            .map(task => agendaTask(board, task))
        )
        tasks.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
        return { today, tasks }
      })
    ),
    myTasks: vi.fn<BoardsApi['myTasks']>(() =>
      Promise.resolve(
        [...store.values()]
          .flatMap(board =>
            board.tasks
              .filter(
                task =>
                  task.assignees.some(person => person.userId === 'me') &&
                  !task.completedAt &&
                  !task.canceledAt
              )
              .map(task => agendaTask(board, task))
          )
          .sort((a, b) =>
            (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
          )
      )
    ),
    listBoards: vi.fn(() =>
      Promise.resolve(
        [...store.values()]
          .map(board =>
            summaryOf(board, favorites.has(board.id), shares.get(board.id))
          )
          .sort((a, b) => Number(b.favorite) - Number(a.favorite))
      )
    ),
    setFavorite: vi.fn<BoardsApi['setFavorite']>((boardId, favorite) =>
      Promise.resolve().then(() => {
        find(boardId)
        if (favorite) favorites.add(boardId)
        else favorites.delete(boardId)
      })
    ),
    setLayout: vi.fn<BoardsApi['setLayout']>((boardId, layout) =>
      Promise.resolve().then(() => {
        find(boardId).layout = layout
      })
    ),
    setDefaultLayout: vi.fn<BoardsApi['setDefaultLayout']>((boardId, layout) =>
      Promise.resolve().then(() => {
        const board = find(boardId)
        board.defaultLayout = layout
        board.version += 1
      })
    ),
    getBoard: vi.fn((boardId: string) =>
      Promise.resolve().then(() => structuredClone(find(boardId)))
    ),
    watchBoard: vi.fn<BoardsApi['watchBoard']>((boardId, onVersion) => {
      const listeners = watchers.get(boardId) ?? new Set()
      watchers.set(boardId, listeners.add(onVersion))
      const board = store.get(boardId)
      if (board) onVersion(board.version)
      return () => {
        listeners.delete(onVersion)
      }
    }),
    checkKeyPrefix: vi.fn<BoardsApi['checkKeyPrefix']>(keyPrefix => {
      const taken = new Set(
        [...store.values()].map(board => board.keyPrefix).concat('INBOX')
      )
      let suggestion = keyPrefix
      for (let number = 2; taken.has(suggestion); number++) {
        suggestion =
          keyPrefix.slice(0, 10 - String(number).length) + String(number)
      }
      return Promise.resolve({
        available: suggestion === keyPrefix,
        suggestion
      })
    }),
    createBoard: vi.fn<BoardsApi['createBoard']>(({ name, keyPrefix }) => {
      const taken = [...store.values()].some(
        board => board.keyPrefix === keyPrefix
      )
      if (taken) return Promise.reject(new ApiError(409, 'key_prefix_taken'))
      const board = aBoard({ name, keyPrefix })
      store.set(board.id, board)
      return Promise.resolve(structuredClone(board))
    }),
    createTask: vi.fn<BoardsApi['createTask']>((boardId, input) =>
      Promise.resolve().then(() => {
        const board = find(boardId)
        const task = aTask(null, {
          sectionId: 'sectionId' in input ? input.sectionId : null,
          parentId: 'parentId' in input ? input.parentId : null,
          title: input.title,
          key: `${board.keyPrefix}-${String(board.tasks.length + 1)}`
        })
        board.tasks.push(task)
        board.version += 1
        return {
          id: task.id,
          key: task.key,
          title: task.title,
          sectionId: task.sectionId
        }
      })
    ),
    completeTask: vi.fn<BoardsApi['completeTask']>((boardId, taskId, state) =>
      Promise.resolve().then(() => {
        const task = findTask(boardId, taskId)
        const now = new Date().toISOString()
        task.completedAt = state === 'completed' ? now : null
        task.canceledAt = state === 'canceled' ? now : null
      })
    ),
    moveTask: vi.fn<BoardsApi['moveTask']>((boardId, taskId, move) =>
      Promise.resolve().then(() => {
        const board = find(boardId)
        const task = board.tasks.find(candidate => candidate.id === taskId)
        if (!task) throw new ApiError(404, 'not_found')
        board.tasks = board.tasks.filter(candidate => candidate !== task)
        task.sectionId = move.sectionId
        const anchor = move.beforeId ?? null
        const index = anchor
          ? board.tasks.findIndex(candidate => candidate.id === anchor)
          : -1
        if (index < 0) board.tasks.push(task)
        else board.tasks.splice(index, 0, task)
        board.version += 1
      })
    ),
    editTask: vi.fn<BoardsApi['editTask']>((boardId, taskId, changes) =>
      Promise.resolve().then(() => {
        Object.assign(findTask(boardId, taskId), changes)
      })
    ),
    getDescription: vi.fn<BoardsApi['getDescription']>((boardId, taskId) =>
      Promise.resolve().then(() => {
        findTask(boardId, taskId)
        return descriptions.get(taskId) ?? { markdown: '', version: 0 }
      })
    ),
    setDescription: vi.fn<BoardsApi['setDescription']>(
      (boardId, taskId, { markdown, version }) =>
        Promise.resolve().then(() => {
          findTask(boardId, taskId)
          if ((descriptions.get(taskId)?.version ?? 0) !== version) {
            throw new ApiError(409, 'stale_version')
          }
          descriptions.set(taskId, { markdown, version: version + 1 })
          return { version: version + 1 }
        })
    ),
    listHistory: vi.fn<BoardsApi['listHistory']>((boardId, taskId) =>
      Promise.resolve().then(() => {
        findTask(boardId, taskId)
        return structuredClone(history.get(taskId) ?? [])
      })
    ),
    listReminders: vi.fn<BoardsApi['listReminders']>((boardId, taskId) =>
      Promise.resolve().then(() => {
        findTask(boardId, taskId)
        return structuredClone(reminders.get(taskId) ?? [])
      })
    ),
    addReminder: vi.fn<BoardsApi['addReminder']>((boardId, taskId, reminder) =>
      Promise.resolve().then(() => {
        findTask(boardId, taskId)
        const at = 'at' in reminder ? reminder.at : null
        reminders.set(taskId, [
          ...(reminders.get(taskId) ?? []),
          {
            id: nextId(),
            at,
            beforeMinutes:
              'beforeMinutes' in reminder ? reminder.beforeMinutes : null,
            firesAt: at
          }
        ])
      })
    ),
    deleteReminder: vi.fn<BoardsApi['deleteReminder']>(
      (boardId, taskId, reminderId) =>
        Promise.resolve().then(() => {
          findTask(boardId, taskId)
          reminders.set(
            taskId,
            (reminders.get(taskId) ?? []).filter(
              reminder => reminder.id !== reminderId
            )
          )
        })
    ),
    following: vi.fn<BoardsApi['following']>((boardId, taskId) =>
      Promise.resolve().then(() => {
        findTask(boardId, taskId)
        return followed.has(taskId)
      })
    ),
    setFollowing: vi.fn<BoardsApi['setFollowing']>(
      (boardId, taskId, following) =>
        Promise.resolve().then(() => {
          findTask(boardId, taskId)
          if (following) followed.add(taskId)
          else followed.delete(taskId)
        })
    ),
    listNotifications: vi.fn<BoardsApi['listNotifications']>(() =>
      Promise.resolve(structuredClone(notifications))
    ),
    unreadByProject: vi.fn<BoardsApi['unreadByProject']>(() =>
      Promise.resolve().then(() => {
        const counts = new Map<string, number>()
        for (const notification of notifications) {
          if (notification.readAt !== null) continue
          const { id } = find(notification.boardId).project
          counts.set(id, (counts.get(id) ?? 0) + 1)
        }
        return [...counts].map(([projectId, count]) => ({ projectId, count }))
      })
    ),
    markNotificationsRead: vi.fn<BoardsApi['markNotificationsRead']>(ids =>
      Promise.resolve().then(() => {
        for (const notification of notifications) {
          if (!ids.includes(notification.id)) continue
          notification.readAt ??= new Date().toISOString()
        }
      })
    ),
    markNotificationRead: vi.fn<BoardsApi['markNotificationRead']>(
      notificationId =>
        Promise.resolve().then(() => {
          const opened = notifications.find(({ id }) => id === notificationId)
          if (!opened) throw new Error('not_found')
          opened.readAt ??= new Date().toISOString()
        })
    ),
    listComments: vi.fn<BoardsApi['listComments']>((boardId, taskId) =>
      Promise.resolve().then(() => {
        findTask(boardId, taskId)
        return structuredClone(comments.get(taskId) ?? [])
      })
    ),
    addComment: vi.fn<BoardsApi['addComment']>((boardId, taskId, body) =>
      Promise.resolve().then(() => {
        findTask(boardId, taskId).commentCount += 1
        comments.set(taskId, [
          ...(comments.get(taskId) ?? []),
          {
            id: nextId(),
            author: {
              userId: 'me',
              email: 'me@example.com',
              name: null,
              avatar: null
            },
            body,
            createdAt: new Date().toISOString(),
            reactions: []
          }
        ])
      })
    ),
    addReaction: vi.fn<BoardsApi['addReaction']>(
      (boardId, taskId, commentId, emoji) =>
        Promise.resolve().then(() => {
          const comment = findComment(boardId, taskId, commentId)
          let reaction = comment.reactions.find(each => each.emoji === emoji)
          if (!reaction) {
            reaction = { emoji, people: [] }
            comment.reactions.push(reaction)
          }
          if (!reaction.people.some(person => person.userId === me.userId)) {
            reaction.people.push({ ...me })
          }
        })
    ),
    removeReaction: vi.fn<BoardsApi['removeReaction']>(
      (boardId, taskId, commentId, emoji) =>
        Promise.resolve().then(() => {
          const comment = findComment(boardId, taskId, commentId)
          comment.reactions = comment.reactions.flatMap(reaction => {
            if (reaction.emoji !== emoji) return [reaction]
            const people = reaction.people.filter(
              person => person.userId !== me.userId
            )
            return people.length === 0 ? [] : [{ ...reaction, people }]
          })
        })
    ),
    setAssignees: vi.fn<BoardsApi['setAssignees']>((boardId, taskId, userIds) =>
      Promise.resolve().then(() => {
        const board = find(boardId)
        const task = board.tasks.find(candidate => candidate.id === taskId)
        if (!task) throw new ApiError(404, 'not_found')
        task.assignees = board.members.filter(member =>
          userIds.includes(member.userId)
        )
      })
    ),
    createLabel: vi.fn<BoardsApi['createLabel']>((boardId, { name, color }) =>
      Promise.resolve().then(() => {
        const board = find(boardId)
        if (
          board.labels.some(
            label => label.name.toLowerCase() === name.toLowerCase()
          )
        ) {
          throw new ApiError(409, 'label_taken')
        }
        const label = { id: nextId(), name, color: color ?? null }
        board.labels.push(label)
        return label
      })
    ),
    editLabel: vi.fn<BoardsApi['editLabel']>((boardId, labelId, changes) =>
      Promise.resolve().then(() => {
        const board = find(boardId)
        const { name } = changes
        if (
          name !== undefined &&
          board.labels.some(
            label =>
              label.id !== labelId &&
              label.name.toLowerCase() === name.toLowerCase()
          )
        ) {
          throw new ApiError(409, 'label_taken')
        }
        const old = board.labels.find(each => each.id === labelId)
        if (!old) throw new ApiError(404, 'not_found')
        const label = { ...old, ...changes }
        const swap = (labels: Label[]) =>
          labels.map(each => (each.id === labelId ? label : each))
        board.labels = swap(board.labels)
        for (const task of board.tasks) task.labels = swap(task.labels)
        return label
      })
    ),
    setLabels: vi.fn<BoardsApi['setLabels']>((boardId, taskId, labelIds) =>
      Promise.resolve().then(() => {
        const board = find(boardId)
        findTask(boardId, taskId).labels = board.labels.filter(label =>
          labelIds.includes(label.id)
        )
      })
    ),
    createSection: vi.fn<BoardsApi['createSection']>(
      (boardId, { name, category, afterId }) =>
        Promise.resolve().then(() => {
          const board = find(boardId)
          if (
            board.sections.some(
              other => other.name.toLowerCase() === name.toLowerCase()
            )
          ) {
            throw new ApiError(409, 'section_name_taken')
          }
          const section = { id: nextId(), name, category }
          const after = board.sections.findIndex(
            candidate => candidate.id === afterId
          )
          board.sections.splice(
            after < 0 ? board.sections.length : after + 1,
            0,
            section
          )
          return section
        })
    ),
    editSection: vi.fn<BoardsApi['editSection']>(
      (boardId, sectionId, changes) =>
        Promise.resolve().then(() => {
          const board = find(boardId)
          const section = sectionOf(board, sectionId)
          if (
            changes.name !== undefined &&
            board.sections.some(
              other =>
                other.id !== sectionId &&
                other.name.toLowerCase() === changes.name?.toLowerCase()
            )
          ) {
            throw new ApiError(409, 'section_name_taken')
          }
          Object.assign(section, changes)
        })
    ),
    moveSection: vi.fn<BoardsApi['moveSection']>((boardId, sectionId, move) =>
      Promise.resolve().then(() => {
        const board = find(boardId)
        const section = sectionOf(board, sectionId)
        board.sections = board.sections.filter(other => other !== section)
        const at = move.beforeId
          ? board.sections.findIndex(other => other.id === move.beforeId)
          : board.sections.findIndex(other => other.id === move.afterId) + 1
        board.sections.splice(at, 0, section)
      })
    ),
    deleteSection: vi.fn<BoardsApi['deleteSection']>(
      (boardId, sectionId, tasksTo) =>
        Promise.resolve().then(() => {
          const board = find(boardId)
          const tasks = board.tasks.filter(task => task.sectionId === sectionId)
          if (tasksTo === undefined && tasks.length > 0) {
            throw new ApiError(409, 'section_not_empty')
          }
          for (const task of tasks) task.sectionId = tasksTo ?? null
          board.sections = board.sections.filter(
            section => section.id !== sectionId
          )
        })
    )
  } satisfies BoardsApi

  return Object.assign(api, {
    changeElsewhere(boardId: string, change: (board: Board) => void) {
      const board = find(boardId)
      change(board)
      board.version += 1
      for (const listener of watchers.get(boardId) ?? []) {
        listener(board.version)
      }
    },
    shares,
    descriptions,
    notifications,
    comments,
    history,
    sharings,
    projects,
    directory
  })
}
