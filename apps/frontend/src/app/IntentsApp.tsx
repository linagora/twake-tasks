import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'

import { connectTaskIntent } from '@/adapters/cozy/taskIntent'
import type { SessionService } from '@/application/session'
import { IntentPage } from '@/ui/intents/IntentPage'

/**
 * The `/intents` page, wired to cozy-interapp. Its router lives in memory, as
 * the new task form navigates but the frame must never add a history entry.
 * Loaded lazily by `App`.
 */
export function IntentsApp({
  onSessionEnded
}: {
  onSessionEnded: SessionService['onEndedElsewhere']
}): ReactElement {
  return (
    <MemoryRouter>
      <IntentPage connect={connectTaskIntent} onSessionEnded={onSessionEnded} />
    </MemoryRouter>
  )
}
