import type { UserBudget } from '../../config.ts'
import type { BudgetsOf } from '../auth/userLimits.ts'

const task = '/boards/:boardId/tasks/:taskId'
const reaction = `${task}/comments/:commentId/reactions/:emoji`

const ROUTES: Record<string, readonly UserBudget[]> = {
  'POST /boards': ['boardCreates'],
  'POST /boards/:boardId/tasks': ['taskCreates'],
  [`POST ${task}/comments`]: ['comments'],
  [`PUT ${reaction}`]: ['reactions'],
  [`DELETE ${reaction}`]: ['reactions'],
  [`POST ${task}/reminders`]: ['reminders'],
  // A label belongs to the project: changing one changes every board of it.
  'POST /boards/:boardId/labels': ['labelEdits'],
  'PATCH /boards/:boardId/labels/:labelId': ['labelEdits'],
  'POST /boards/:boardId/invites': ['invites', 'invitesDaily'],
  'GET /boards/:boardId/sharing/people': ['peopleSearch'],
  'GET /boards/:boardId/events': ['streamConnects'],
  'GET /boards/:boardId': ['heavyReads'],
  'GET /my-tasks': ['heavyReads'],
  'GET /agenda': ['heavyReads'],
  'GET /filters/:filterId/tasks': ['heavyReads'],
  [`GET ${task}/history`]: ['heavyReads'],
  [`GET ${task}/comments`]: ['heavyReads'],
  'GET /boards/:boardId/archived': ['heavyReads'],
  'GET /boards/:boardId/trash': ['heavyReads']
}

export const BUDGETED_ROUTES = Object.keys(ROUTES)

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export const boardBudgets: BudgetsOf = (method, path, identity) => {
  const route = `${method} ${path}`
  if (route === 'GET /search') {
    return [identity.searchOnly ? 'otherAppSearch' : 'search']
  }
  const budgets = ROUTES[route] ?? []
  return WRITES.has(method) ? ['writes', ...budgets] : budgets
}
