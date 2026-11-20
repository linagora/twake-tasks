import {
  connectToTwakeSpace,
  type TwakeSpaceConnection
} from '@linagora/twake-embed'

export const EMBED_PREFIX = '/embed/projects/'

let connection: TwakeSpaceConnection | null = null

/** The TwakeSpace of this deployment, the one the embedded view talks to */
const hostOrigins = (): string[] =>
  window.TWAKE_SPACE_ORIGIN ? [window.TWAKE_SPACE_ORIGIN] : []

/**
 * Connects to TwakeSpace when the app is framed by it, at boot. Null without
 * a TwakeSpace to talk to. `parent` is the frame's parent, only given by
 * tests.
 */
export function connectTwakeSpace(
  parent?: Window
): TwakeSpaceConnection | null {
  connection?.disconnect()
  connection = connectToTwakeSpace({
    embedPrefix: EMBED_PREFIX,
    hostOrigins: hostOrigins(),
    isResourceId: id => /^[\w.-]+$/.test(id),
    parent
  })
  return connection
}

export function getTwakeSpace(): TwakeSpaceConnection | null {
  return connection
}

/** Forgets the connection, after a test */
export function disconnectTwakeSpace(): void {
  connection?.disconnect()
  connection = null
}
