import { AsyncLocalStorage } from 'node:async_hooks'

// Lets asTenant tag its transaction with the request, without passing the id
// through every store.
const requests = new AsyncLocalStorage<string>()

export const runInRequest = <T>(requestId: string, work: () => T): T =>
  requests.run(requestId, work)

export const currentRequestId = (): string | undefined => requests.getStore()
