import type { Shelf } from '@/application/boards'

export type AgendaView = 'today' | 'upcoming' | 'mine' | { filterId: string }

// Invalidating a key also invalidates every key it is a prefix of, so a board
// and everything under it starts with `boards()`.
const boards = () => ['boards'] as const
const board = (boardId: string) => [...boards(), boardId] as const
const task = (boardId: string, taskId: string) =>
  [...board(boardId), 'tasks', taskId] as const
const sharing = (boardId: string) => [...board(boardId), 'sharing'] as const
const agendas = () => ['agenda'] as const
const searches = () => ['search'] as const

export const keys = {
  boards,
  board,
  sharing,
  peopleSuggestions: (boardId: string, term: string) =>
    [...sharing(boardId), 'people', term] as const,
  shelf: (boardId: string, shelf: Shelf) => [...board(boardId), shelf] as const,
  description: (boardId: string, taskId: string) =>
    [...task(boardId, taskId), 'description'] as const,
  history: (boardId: string, taskId: string) =>
    [...task(boardId, taskId), 'history'] as const,
  comments: (boardId: string, taskId: string) =>
    [...task(boardId, taskId), 'comments'] as const,
  reminders: (boardId: string, taskId: string) =>
    [...task(boardId, taskId), 'reminders'] as const,
  following: (boardId: string, taskId: string) =>
    [...task(boardId, taskId), 'following'] as const,
  agendas,
  agenda: (view: AgendaView) => [...agendas(), view] as const,
  searches,
  search: (text: string) => [...searches(), text] as const,
  filters: () => ['filters'] as const,
  labels: () => ['labels'] as const,
  statuses: () => ['statuses'] as const,
  people: () => ['people'] as const,
  projects: () => ['projects'] as const,
  notifications: () => ['notifications'] as const,
  unreadNotifications: () => ['unreadNotifications'] as const,
  unreadByProject: () => ['unreadByProject'] as const,
  settings: () => ['settings'] as const,
  emojis: (lang: string) => ['emojis', lang] as const
}
