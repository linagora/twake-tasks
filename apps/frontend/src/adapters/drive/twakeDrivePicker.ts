import type { Sdk } from '@linagora/twake-sdk'
import { Intents, type StartedCozyIntent } from 'cozy-interapp'

import type { DriveLink, DrivePicker } from '@/application/drivePicker'

interface PickedEntry {
  name: string
  sharingLink?: string
}

export const isDrivePickerEnabled = (
  win: Pick<Window, 'DRIVE_PICKER_ENABLED'>
): boolean => win.DRIVE_PICKER_ENABLED === 'true'

// The client exchanges the id token as soon as it is made: wait for that
// exchange, and try again only once it failed.
async function signedIn(sdk: Sdk, idToken: string): Promise<void> {
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

const intentsOf = (sdk: Sdk): Intents =>
  new Intents({
    fetch: (method, path, body) =>
      sdk.fetchJSON(`/${path.replace(/^\/+/, '')}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? null : JSON.stringify(body)
      })
  })

/**
 * Inside Twake Space the dialog shows on its overlay, so the picker posts to
 * that window. cozy-interapp listens on the app's window only: pass the
 * messages of the frames in `container` on to it, until the returned function
 * is called.
 */
export function relayIntentMessages(container: HTMLElement): () => void {
  const host = container.ownerDocument.defaultView
  if (host === null || host === window) return () => undefined
  const relay = (event: MessageEvent<unknown>) => {
    const fromPicker = Array.from(container.querySelectorAll('iframe')).some(
      frame => frame.contentWindow === event.source
    )
    if (!fromPicker) return
    window.dispatchEvent(
      new MessageEvent('message', {
        data: event.data,
        origin: event.origin,
        source: event.source
      })
    )
  }
  host.addEventListener('message', relay)
  return () => {
    host.removeEventListener('message', relay)
  }
}

/** The PICK io.cozy.files intent of Twake Drive, asking for sharing links. */
export function twakeDrivePicker(sdk: Sdk, idToken: string): DrivePicker {
  let started: StartedCozyIntent | null = null
  let unrelay: () => void = () => undefined
  // Each pick and each stop starts a new run: a stopped run gives up
  let run = 0

  return {
    async pick(container, options) {
      run += 1
      const current = run
      await signedIn(sdk, idToken)
      if (current !== run) return []
      const intent = intentsOf(sdk).create(
        'PICK',
        'io.cozy.files',
        {
          theme: { type: options.theme },
          multiple: true,
          sharingLink: { label: options.linkLabel }
        },
        ['GET']
      )
      const mine = intent.start(container, {
        onReadyToUse: options.onReady,
        onShowCross: () => {
          options.onCloseButton(true)
        },
        onHideCross: () => {
          options.onCloseButton(false)
        }
      })
      started = mine
      const stopRelay = relayIntentMessages(container)
      unrelay = stopRelay
      let result: unknown
      try {
        result = await mine
      } finally {
        stopRelay()
        if (started === mine) started = null
      }
      if (!Array.isArray(result)) return []
      return (result as PickedEntry[]).map((entry): DriveLink => {
        if (!entry.sharingLink) throw new Error('Drive gave no sharing link')
        return { name: entry.name, url: entry.sharingLink }
      })
    },
    stop() {
      run += 1
      unrelay()
      started?.stop()
      started = null
    }
  }
}
