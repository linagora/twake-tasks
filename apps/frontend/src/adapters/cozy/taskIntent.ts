import type { Sdk } from '@linagora/twake-sdk'

import { intentsOf, signedIn } from '@/adapters/cozy/intents'
import type { IntentService } from '@/application/taskIntent'

// A client on another origin than the one the stack knows never answers
const CLIENT_TIMEOUT_MS = 30_000

/**
 * Starts the service side of an intent: signs the platform client in, reads
 * the intent on the stack, then waits for the client (the app framing the
 * page). cozy-interapp refuses a frame the intent does not allow. A client
 * silent for 30 s is given up on, and told so should it answer later.
 * Used by: `IntentsApp`.
 */
export async function connectTaskIntent(
  sdk: Sdk,
  idToken: string,
  intentId: string
): Promise<IntentService> {
  await signedIn(sdk, idToken)
  const pending = intentsOf(sdk).createService(intentId, window, {
    requireFrameAncestors: true
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const silence = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('The client of the intent did not answer'))
      void pending.then(
        late => {
          late.throw(new Error('Twake Project stopped waiting'))
        },
        // It failed after all: there is nobody to tell
        () => undefined
      )
    }, CLIENT_TIMEOUT_MS)
  })
  try {
    return await Promise.race([pending, silence])
  } finally {
    clearTimeout(timer)
  }
}
