import { and, eq, isNull, lt, or } from 'drizzle-orm'
import { z } from 'zod'
import type { PlatformEvent } from '../../events/envelope.ts'
import {
  NotYetKnownError,
  parseOrDrop,
  type Handler
} from '../../events/router.ts'
import { asOrganization, type Tx } from '../../infra/db.ts'
import { spaces } from './schema.ts'

// cozy-stack ADR 009: the platform keeps a team drive for each space, named by
// the reference TwakeSpace gives it, and says on the activity exchange when
// one is ready or removed.
const SOURCE = 'twake-space'

const reply = z.looseObject({
  twakeorg: z.string().min(1),
  data: z.looseObject({
    reference: z.looseObject({ source: z.string(), id: z.string() }),
    revision: z.number().int().positive()
  })
})

const ready = reply.extend({
  data: reply.shape.data.extend({
    drive: z.looseObject({ id: z.string().min(1) })
  })
})

async function setDrive(
  tx: Tx,
  spaceId: string,
  revision: number,
  driveId: string | null
): Promise<void> {
  const [known] = await tx
    .select({ id: spaces.id })
    .from(spaces)
    .where(eq(spaces.id, spaceId))
  if (!known) throw new NotYetKnownError(spaceId)
  await tx
    .update(spaces)
    .set({ driveId, driveRevision: revision })
    .where(
      and(
        eq(spaces.id, spaceId),
        or(isNull(spaces.driveRevision), lt(spaces.driveRevision, revision))
      )
    )
}

function onReply<S extends typeof reply>(
  schema: S,
  driveOf: (event: z.output<S>) => string | null
): Handler<PlatformEvent> {
  return async (event, tx) => {
    const parsed = parseOrDrop(schema, event.body, event.routingKey)
    const { reference, revision } = parsed.data
    // Drives of other apps, and references that are no space id.
    if (
      reference.source !== SOURCE ||
      !z.uuid().safeParse(reference.id).success
    ) {
      return
    }
    await asOrganization(tx, parsed.twakeorg)
    await setDrive(tx, reference.id, revision, driveOf(parsed))
  }
}

export const driveRoutes: ReadonlyMap<string, Handler<PlatformEvent>> = new Map(
  [
    [
      'com.twake.drive.org_drive.ready.v1',
      onReply(ready, event => event.data.drive.id)
    ],
    ['com.twake.drive.org_drive.removed.v1', onReply(reply, () => null)]
  ]
)
