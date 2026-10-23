import type { Sdk, SdkStatus } from '@linagora/twake-sdk'
import { Intents } from 'cozy-interapp'
import { describe, expect, it, vi } from 'vitest'

import {
  isDrivePickerEnabled,
  relayIntentMessages,
  twakeDrivePicker
} from '@/adapters/drive/twakeDrivePicker'
import type { DrivePickOptions } from '@/application/drivePicker'

const options = (): DrivePickOptions => ({
  linkLabel: 'Insert the links',
  theme: 'light',
  onReady: vi.fn(),
  onCloseButton: vi.fn()
})

function fakeSdk(initial: SdkStatus = 'ready') {
  let status = initial
  const listeners = new Set<(next: SdkStatus) => void>()
  const setStatus = (next: SdkStatus) => {
    status = next
    listeners.forEach(listener => {
      listener(next)
    })
  }
  const sdk = {
    get status() {
      return status
    },
    onStatusChange: (listener: (next: SdkStatus) => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    login: vi.fn(() => {
      setStatus('ready')
      return Promise.resolve()
    }),
    fetchJSON: vi.fn(() => Promise.resolve({}))
  }
  return { sdk: sdk as Partial<Sdk> as Sdk, fake: sdk, setStatus }
}

// The intent resolves with `result`, or stays open when it is undefined
function fakeIntent(result?: unknown) {
  const stop = vi.fn()
  const started = Object.assign(
    result === undefined
      ? new Promise<unknown>(() => undefined)
      : Promise.resolve(result),
    { stop }
  )
  let startOptions: Parameters<ReturnType<Intents['create']>['start']>[1]
  const create = vi.spyOn(Intents.prototype, 'create').mockImplementation(() =>
    Object.assign(Promise.resolve(), {
      start: (_element: HTMLElement, given?: typeof startOptions) => {
        startOptions = given
        return started
      }
    })
  )
  return { create, stop, startOptions: () => startOptions }
}

describe('twakeDrivePicker', () => {
  it('asks Drive for sharing links only and gives back each link with its name', async () => {
    const { sdk, fake } = fakeSdk()
    const intent = fakeIntent([
      {
        name: 'Plan.pdf',
        mimeType: 'application/pdf',
        sharingLink: 'https://d/1'
      },
      { name: 'Specs', mimeType: null, sharingLink: 'https://d/2' }
    ])

    const links = await twakeDrivePicker(sdk, 'id-token').pick(
      document.createElement('div'),
      options()
    )

    expect(links).toEqual([
      { name: 'Plan.pdf', url: 'https://d/1' },
      { name: 'Specs', url: 'https://d/2' }
    ])
    expect(intent.create).toHaveBeenCalledWith(
      'PICK',
      'io.cozy.files',
      {
        theme: { type: 'light' },
        multiple: true,
        sharingLink: { label: 'Insert the links' }
      },
      ['GET']
    )
    expect(fake.login).not.toHaveBeenCalled()
  })

  it('creates the intent on the stack with the platform client', async () => {
    const { sdk, fake } = fakeSdk()
    fake.fetchJSON.mockRejectedValueOnce(new Error('offline'))

    await expect(
      twakeDrivePicker(sdk, 'id-token').pick(
        document.createElement('div'),
        options()
      )
    ).rejects.toThrow('offline')
    expect(fake.fetchJSON).toHaveBeenCalledWith('/intents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          type: 'io.cozy.intents',
          attributes: {
            action: 'PICK',
            type: 'io.cozy.files',
            permissions: ['GET']
          }
        }
      })
    })
  })

  it('passes the messages of the picker on to the dialog', async () => {
    const { sdk } = fakeSdk()
    const intent = fakeIntent([])
    const given = options()
    await twakeDrivePicker(sdk, 'id-token').pick(
      document.createElement('div'),
      given
    )

    intent.startOptions()?.onReadyToUse?.()
    intent.startOptions()?.onShowCross?.()
    intent.startOptions()?.onHideCross?.()

    expect(given.onReady).toHaveBeenCalledOnce()
    expect(vi.mocked(given.onCloseButton).mock.calls).toEqual([[true], [false]])
  })

  it('gives no link when the user cancels', async () => {
    const { sdk } = fakeSdk()
    fakeIntent(null)

    expect(
      await twakeDrivePicker(sdk, 'id-token').pick(
        document.createElement('div'),
        options()
      )
    ).toEqual([])
  })

  it('exchanges the id token again when the first exchange failed', async () => {
    const { sdk, fake } = fakeSdk('public')
    fakeIntent([])

    await twakeDrivePicker(sdk, 'id-token').pick(
      document.createElement('div'),
      options()
    )

    expect(fake.login).toHaveBeenCalledWith('id-token')
  })

  it('waits for the exchange in flight rather than starting another', async () => {
    const { sdk, fake, setStatus } = fakeSdk('waiting')
    const intent = fakeIntent([])

    const picked = twakeDrivePicker(sdk, 'id-token').pick(
      document.createElement('div'),
      options()
    )
    await Promise.resolve()
    expect(intent.create).not.toHaveBeenCalled()
    setStatus('ready')

    expect(await picked).toEqual([])
    expect(fake.login).not.toHaveBeenCalled()
  })

  it('rejects when the stack refuses the id token', async () => {
    const { sdk, fake } = fakeSdk('public')
    fake.login.mockRejectedValueOnce(new Error('token_exchange failed: 403'))
    const intent = fakeIntent([])

    await expect(
      twakeDrivePicker(sdk, 'id-token').pick(
        document.createElement('div'),
        options()
      )
    ).rejects.toThrow('403')
    expect(intent.create).not.toHaveBeenCalled()
  })

  it('stops the picker shown', async () => {
    const { sdk } = fakeSdk()
    const intent = fakeIntent()
    const picker = twakeDrivePicker(sdk, 'id-token')
    void picker.pick(document.createElement('div'), options())
    await vi.waitFor(() => {
      expect(intent.create).toHaveBeenCalled()
    })

    picker.stop()

    expect(intent.stop).toHaveBeenCalledOnce()
  })

  it('shows no picker once stopped during the exchange', async () => {
    const { sdk, setStatus } = fakeSdk('waiting')
    const intent = fakeIntent([])
    const picker = twakeDrivePicker(sdk, 'id-token')
    const picked = picker.pick(document.createElement('div'), options())

    picker.stop()
    setStatus('ready')

    expect(await picked).toEqual([])
    expect(intent.create).not.toHaveBeenCalled()
  })
})

describe('isDrivePickerEnabled', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['1', false],
    ['false', false],
    ['true', true]
  ])('reads %s as %s', (value, enabled) => {
    expect(
      isDrivePickerEnabled(
        value === undefined ? {} : { DRIVE_PICKER_ENABLED: value }
      )
    ).toBe(enabled)
  })
})

describe('relayIntentMessages', () => {
  it('passes the messages of the picker, posted to the Twake Space overlay, on to the app until stopped', () => {
    const overlay = document.createElement('iframe')
    document.body.append(overlay)
    const host = overlay.contentWindow
    if (!host) throw new Error('no window')
    const container = host.document.createElement('div')
    host.document.body.append(container)
    const frame = host.document.createElement('iframe')
    container.append(frame)
    const service = frame.contentWindow
    if (!service) throw new Error('no window')
    const heard: unknown[] = []
    const listen = (event: MessageEvent<{ type: unknown }>) => {
      heard.push([event.data.type, event.origin, event.source === service])
    }
    window.addEventListener('message', listen)
    const post = (type: string, source: Window) => {
      host.dispatchEvent(
        new MessageEvent('message', {
          data: { type },
          origin: 'https://alice-drive.test',
          source
        })
      )
    }

    const stop = relayIntentMessages(container)
    post('intent-1:ready', service)
    post('intent-1:done', host)
    stop()
    post('intent-1:done', service)

    expect(heard).toEqual([
      ['intent-1:ready', 'https://alice-drive.test', true]
    ])
    window.removeEventListener('message', listen)
    overlay.remove()
  })

  it('does nothing for a container in the window of the app', () => {
    const add = vi.spyOn(window, 'addEventListener')

    relayIntentMessages(document.createElement('div'))()

    expect(add).not.toHaveBeenCalled()
  })
})
