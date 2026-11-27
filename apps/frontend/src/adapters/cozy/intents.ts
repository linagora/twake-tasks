import type { Sdk } from '@linagora/twake-sdk'
import { Intents } from 'cozy-interapp'

/**
 * Waits until the platform client is signed in. The client exchanges the id
 * token as soon as it is made: this waits for that exchange, and tries again
 * only once it failed. Used by: the Drive picker, the task intent.
 */
export async function signedIn(sdk: Sdk, idToken: string): Promise<void> {
  if (sdk.status === 'waiting') {
    await new Promise<void>(resolve => {
      const stop = sdk.onStatusChange(() => {
        stop()
        resolve()
      })
    })
  }
  if (sdk.status !== 'ready') await sdk.login(idToken)
}

/**
 * cozy-interapp calling the stack with the platform client's token.
 * Used by: the Drive picker, the task intent.
 */
export const intentsOf = (sdk: Sdk): Intents =>
  new Intents({
    fetch: (method, path, body) =>
      sdk.fetchJSON(`/${path.replace(/^\/+/, '')}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? null : JSON.stringify(body)
      })
  })
