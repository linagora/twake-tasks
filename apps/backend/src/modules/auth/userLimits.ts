import type { Budget, UserBudget } from '../../config.ts'
import type { HttpServer } from '../../infra/http.ts'
import type { Identity } from './oidc.ts'
import { tooManyRequests, type RequireIdentity } from './routes.ts'

// The budgets a route draws on besides `requests`, which every route does.
// The path is the route's, under the prefix of the scope.
export type BudgetsOf = (
  method: string,
  path: string,
  identity: Identity
) => readonly UserBudget[]

// Counted per user, not per token or address: one person is one budget
// across their tabs, devices and organizations.
export function limitUsers(
  app: HttpServer,
  budgets: Record<UserBudget, Budget>,
  budgetsOf: BudgetsOf
): RequireIdentity {
  const limits = new Map(
    Object.entries(budgets)
      .filter(([, budget]) => budget.max > 0)
      .map(([name, budget]) => [
        name,
        app.createRateLimit({
          max: budget.max,
          timeWindow: budget.windowSeconds * 1000,
          keyGenerator: request => `${name}:${request.identity?.userId ?? ''}`
        })
      ])
  )
  return async (request, reply) => {
    const identity = request.identity
    if (!identity) return
    // A HEAD request runs the handler of its GET.
    const method = request.method === 'HEAD' ? 'GET' : request.method
    const path = request.routeOptions.url?.slice(app.prefix.length) ?? ''
    for (const name of ['requests', ...budgetsOf(method, path, identity)]) {
      const limit = limits.get(name)
      if (!limit) continue
      const result = await limit(request)
      if (!result.isAllowed && result.isExceeded) {
        return tooManyRequests(reply, Math.max(1, result.ttlInSeconds))
      }
    }
  }
}
