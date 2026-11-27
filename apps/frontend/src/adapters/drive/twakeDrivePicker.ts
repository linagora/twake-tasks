import type { Sdk } from '@linagora/twake-sdk'
import type { StartedCozyIntent } from 'cozy-interapp'

import { intentsOf, signedIn } from '@/adapters/cozy/intents'
import type { DriveLink, DrivePicker } from '@/application/drivePicker'

interface PickedEntry {
  name: string
  sharingLink?: string
}

export const isDrivePickerEnabled = (
  win: Pick<Window, 'DRIVE_PICKER_ENABLED'>
): boolean => win.DRIVE_PICKER_ENABLED === 'true'

/** The PICK io.cozy.files intent of Twake Drive, asking for sharing links. */
export function twakeDrivePicker(sdk: Sdk, idToken: string): DrivePicker {
  let started: StartedCozyIntent | null = null
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
          sharingLink: { label: options.linkLabel },
          downloadLink: false
        },
        ['GET']
      )
      // cozy-interapp cannot stop an intent still being created: it would put
      // the frame in the container after the stop
      await intent
      if (current !== run) return []
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
      let result: unknown
      try {
        result = await mine
      } finally {
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
      started?.stop()
      started = null
    }
  }
}
