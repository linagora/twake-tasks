// `/intents?intent=<id>`: the service of the cozy-stack intent
// `CREATE io.cozy.tasks`, framed by another app of the Workplace (Twake Chat).
// What is faked is the outside only: cozy-interapp (what the client sends and
// gets), the client of the platform, the SSO session and the backend.
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '@/app/App'
import { ApiError } from '@/application/boards'
import type * as ClosableTitleModule from '@/ds/ClosableTitle'
import { aBoard, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { fakeSession, fakeUser } from '@/testing/fakeSession'
import { typeRichText } from '@/testing/richText'

// A fault in the render of the form, raised by its title bar when asked
const fault = vi.hoisted(() => ({ render: false }))

vi.mock('@/ds/ClosableTitle', async importOriginal => {
  const real = await importOriginal<typeof ClosableTitleModule>()
  return {
    ClosableTitle: (props: Parameters<typeof real.ClosableTitle>[0]) => {
      if (fault.render) throw new Error('The form crashed')
      return real.ClosableTitle(props)
    }
  }
})

const platform = vi.hoisted(() => ({
  options: [] as {
    fetch: (method: string, path: string, body?: unknown) => Promise<unknown>
  }[],
  createService:
    vi.fn<
      (intentId: string, win: Window, options?: unknown) => Promise<unknown>
    >(),
  sdk: {
    status: 'ready',
    onStatusChange: () => () => undefined,
    login: vi.fn(() => Promise.resolve()),
    fetchJSON: vi.fn(() => Promise.resolve({}))
  }
}))

vi.mock('cozy-interapp', () => {
  class Intents {
    createService = platform.createService
    constructor(options: (typeof platform.options)[number]) {
      platform.options.push(options)
    }
  }
  return { Intents, default: Intents }
})

vi.mock('@linagora/twake-sdk', async importOriginal => ({
  ...(await importOriginal<object>()),
  createSdk: () => platform.sdk
}))

/** As cozy-interapp's service: it takes one answer, and throws on a second */
function fakeService(
  data: unknown,
  attributes = { action: 'CREATE', type: 'io.cozy.tasks' }
) {
  let answered = false
  const answer = () => {
    if (answered) throw new Error('Intent service has already been terminated')
    answered = true
  }
  return {
    getIntent: () => ({ _id: 'intent-1', attributes }),
    getData: () => data,
    onData: () => () => undefined,
    terminate: vi.fn<(result: unknown) => void>(answer),
    cancel: vi.fn<() => void>(answer),
    throw: vi.fn<(error: Error) => void>(answer),
    notifyReadyToUse: vi.fn(),
    hideCross: vi.fn(),
    showCross: vi.fn(),
    resizeClient: vi.fn()
  }
}

type Service = ReturnType<typeof fakeService>

function expectNoAnswer(service: Service) {
  expect(service.terminate).not.toHaveBeenCalled()
  expect(service.cancel).not.toHaveBeenCalled()
  expect(service.throw).not.toHaveBeenCalled()
}

const TITLE = 'Fix the login page'
const DESCRIPTION = '> The login page is broken\n\nFrom Bob, in Design'
const PREFILL = { title: TITLE, description: DESCRIPTION }

const frame = () => {
  vi.stubGlobal('parent', { postMessage: vi.fn() })
}

interface Options {
  data?: unknown
  path?: string
  boards?: ReturnType<typeof aBoard>[]
  session?: ReturnType<typeof fakeSession>
}

function openIntent({
  data = PREFILL,
  path = '/intents?intent=intent-1',
  boards,
  session = fakeSession(() => Promise.resolve(fakeUser('id-token')))
}: Options = {}) {
  const inbox = aBoard({
    name: 'Inbox',
    keyPrefix: 'INB',
    inbox: true,
    sections: []
  })
  const boardsApi = fakeBoardsApi(boards ?? [inbox])
  const service = fakeService(data)
  platform.createService.mockResolvedValue(service)
  window.history.replaceState(null, '', path)
  const start = () => {
    render(<App session={session} boardsApi={boardsApi} />)
  }
  return { inbox, boardsApi, service, session, start }
}

async function findForm() {
  const dialog = within(
    await screen.findByRole('dialog', { name: 'Create a task' })
  )
  const title = () => dialog.getByRole('textbox', { name: 'Title' })
  const create = () => dialog.getByRole('button', { name: 'Create' })
  // Once the board it goes in is known
  await waitFor(() => {
    expect(create()).toBeEnabled()
  })
  return { dialog, title, create }
}

async function openForm(options?: Options) {
  const opened = openIntent(options)
  opened.start()
  return { ...opened, ...(await findForm()) }
}

/** The page says why, alone: never the app around, never the form */
async function expectMessage() {
  await waitFor(() => {
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).not.toHaveTextContent('Page not found')
    expect(screen.queryByRole('dialog')).toBe(null)
    expect(screen.queryByRole('navigation')).toBe(null)
  })
}

/** Holds the next task creation until released */
function holdCreation(boardsApi: ReturnType<typeof fakeBoardsApi>) {
  const real = boardsApi.createTask.getMockImplementation()
  if (!real) throw new Error('The fake API creates tasks')
  const held = Promise.withResolvers<null>()
  boardsApi.createTask.mockImplementationOnce(async (...args) => {
    await held.promise
    return real(...args)
  })
  return () => {
    held.resolve(null)
  }
}

function resultOf(
  inbox: ReturnType<typeof aBoard>,
  title: string = TITLE
): unknown {
  return {
    id: inbox.tasks[0]?.id,
    key: 'INB-1',
    title,
    url: `${window.location.origin}/boards/${inbox.id}?task=INB-1`
  }
}

beforeEach(() => {
  fault.render = false
  platform.options.length = 0
  platform.createService.mockReset()
  platform.sdk.status = 'ready'
  platform.sdk.login.mockReset().mockResolvedValue(undefined)
  platform.sdk.fetchJSON.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  frame()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

describe('the intent CREATE io.cozy.tasks', () => {
  it('shows the new task form filled with the title and description asked for', async () => {
    const { dialog, title } = await openForm()

    expect(title()).toHaveValue(TITLE)
    const description = dialog.getByRole('textbox', { name: 'Description' })
    expect(description).toHaveTextContent('The login page is broken')
    expect(description).toHaveTextContent('From Bob, in Design')
  })

  it.each([
    ['empty data', {}],
    ['null data', null],
    ['no data', undefined]
  ])('shows an empty form for %s', async (_, data) => {
    // Not through the default of openIntent, which undefined would take
    const opened = openIntent()
    const service = fakeService(data)
    platform.createService.mockResolvedValue(service)
    opened.start()

    const { title } = await findForm()

    expect(title()).toHaveValue('')
    expect(service.throw).not.toHaveBeenCalled()
  })

  it('shows the form alone, without the Twake bar nor the app', async () => {
    await openForm()

    expect(
      screen.queryByRole('navigation', { hidden: true })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('banner', { hidden: true })).toBe(null)
    expect(
      screen.queryByRole('button', { name: 'Create task', hidden: true })
    ).toBe(null)
  })

  it('reads the intent on the platform of the user, refusing a frame it does not allow', async () => {
    await openForm()

    expect(platform.createService).toHaveBeenCalledTimes(1)
    expect(platform.createService).toHaveBeenCalledWith('intent-1', window, {
      requireFrameAncestors: true
    })
    await platform.options[0]?.fetch('GET', '/intents/intent-1')
    expect(platform.sdk.fetchJSON).toHaveBeenCalledWith(
      '/intents/intent-1',
      expect.anything()
    )
  })

  it('tells the client it is ready, and leaves the closing to the form', async () => {
    const { service } = await openForm()

    expect(service.notifyReadyToUse).toHaveBeenCalledTimes(1)
    expect(service.hideCross).toHaveBeenCalledTimes(1)
    expectNoAnswer(service)
  })

  it('gives the client the task saved: id, key, title and address', async () => {
    const { service, inbox, boardsApi, create } = await openForm()

    fireEvent.click(create())

    await waitFor(() => {
      expect(service.terminate).toHaveBeenCalled()
    })
    expect(service.terminate).toHaveBeenCalledTimes(1)
    expect(service.terminate.mock.calls[0]?.[0]).toStrictEqual(resultOf(inbox))
    expect(boardsApi.setDescription).toHaveBeenCalledWith(
      inbox.id,
      inbox.tasks[0]?.id,
      { markdown: DESCRIPTION, version: 0 }
    )
    expect(service.cancel).not.toHaveBeenCalled()
  })

  it('saves what the user completed, not what was asked for', async () => {
    const { service, inbox, dialog, title, create, boardsApi } = await openForm(
      { data: { title: TITLE } }
    )
    fireEvent.change(title(), { target: { value: '  Fix the sign-in  ' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Add details' }))
    await typeRichText(
      dialog.getByRole('textbox', { name: 'Description' }),
      'Since Monday'
    )

    fireEvent.click(create())

    await waitFor(() => {
      expect(service.terminate).toHaveBeenCalledWith(
        resultOf(inbox, 'Fix the sign-in')
      )
    })
    expect(boardsApi.setDescription).toHaveBeenCalledWith(
      inbox.id,
      inbox.tasks[0]?.id,
      { markdown: 'Since Monday', version: 0 }
    )
  })

  it('never adds a history entry, nor leaves the page', async () => {
    const entries = window.history.length
    const pushState = vi.spyOn(window.history, 'pushState')
    const { service, create } = await openForm()

    fireEvent.click(create())
    await waitFor(() => {
      expect(service.terminate).toHaveBeenCalled()
    })

    expect(pushState).not.toHaveBeenCalled()
    expect(window.history.length).toBe(entries)
    expect(window.location.pathname + window.location.search).toBe(
      '/intents?intent=intent-1'
    )
  })

  it('creates one task, whatever the choice to create another elsewhere', async () => {
    localStorage.setItem('twake-tasks.createAnother', 'true')
    const { service, inbox, dialog, create } = await openForm()

    expect(dialog.queryByRole('checkbox', { name: 'Create another' })).toBe(
      null
    )
    fireEvent.click(create())

    await waitFor(() => {
      expect(service.terminate).toHaveBeenCalledWith(resultOf(inbox))
    })
  })

  it('ignores a second submit while the first is saving', async () => {
    const { service, boardsApi, create } = await openForm()
    const release = holdCreation(boardsApi)

    fireEvent.click(create())
    await waitFor(() => {
      expect(create()).toBeDisabled()
    })
    // As a second Ctrl+Enter in the description does, past the button.
    fireEvent.submit(create())
    release()

    await waitFor(() => {
      expect(service.terminate).toHaveBeenCalled()
    })
    expect(boardsApi.createTask).toHaveBeenCalledTimes(1)
    expect(service.terminate).toHaveBeenCalledTimes(1)
  })

  it('waits for a save in flight when closed, then gives the task', async () => {
    const { service, inbox, boardsApi, dialog, title, create } =
      await openForm()
    const release = holdCreation(boardsApi)
    fireEvent.click(create())
    await waitFor(() => {
      expect(create()).toBeDisabled()
    })

    fireEvent.click(dialog.getByRole('button', { name: 'Close' }))
    fireEvent.keyDown(title(), { key: 'Escape' })
    expectNoAnswer(service)
    release()

    await waitFor(() => {
      expect(service.terminate).toHaveBeenCalledWith(resultOf(inbox))
    })
    expect(service.cancel).not.toHaveBeenCalled()
  })

  it('keeps the form and tells the client nothing when the save fails', async () => {
    const { service, inbox, boardsApi, dialog, title, create } =
      await openForm()
    boardsApi.createTask.mockRejectedValueOnce(new Error('offline'))

    fireEvent.click(create())

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'The task could not be created.'
    )
    expect(title()).toHaveValue(TITLE)
    expectNoAnswer(service)

    fireEvent.click(create())
    await waitFor(() => {
      expect(service.terminate).toHaveBeenCalledWith(resultOf(inbox))
    })
  })

  it('gives the task only once its details are saved too', async () => {
    const { service, inbox, boardsApi, dialog, create } = await openForm()
    boardsApi.setDescription.mockRejectedValueOnce(new Error('offline'))

    fireEvent.click(create())
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'some of its details were not saved'
    )
    expectNoAnswer(service)
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(service.terminate).toHaveBeenCalledWith(resultOf(inbox))
    })
    expect(boardsApi.createTask).toHaveBeenCalledTimes(1)
  })

  it('asks for a title, telling the client nothing', async () => {
    const { service, dialog, create, boardsApi } = await openForm({ data: {} })

    fireEvent.click(create())

    expect(await dialog.findByText("The title can't be empty.")).toBeVisible()
    expect(boardsApi.createTask).not.toHaveBeenCalled()
    expectNoAnswer(service)
  })

  it('gives null to the client when an empty form is closed', async () => {
    const { service, dialog } = await openForm({ data: {} })

    fireEvent.click(dialog.getByRole('button', { name: 'Close' }))

    await waitFor(() => {
      expect(service.cancel).toHaveBeenCalledTimes(1)
    })
    expect(service.terminate).not.toHaveBeenCalled()
  })

  it('asks before dropping the task, then gives null', async () => {
    const { service, dialog, title } = await openForm()
    const ask = async () =>
      within(
        await screen.findByRole('dialog', { name: 'Discard your changes?' })
      )

    fireEvent.keyDown(title(), { key: 'Escape' })
    fireEvent.click((await ask()).getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Discard your changes?' })
      ).toBe(null)
    })
    expect(title()).toHaveValue(TITLE)
    expectNoAnswer(service)

    fireEvent.click(dialog.getByRole('button', { name: 'Close' }))
    fireEvent.click((await ask()).getByRole('button', { name: 'Discard' }))

    await waitFor(() => {
      expect(service.cancel).toHaveBeenCalledTimes(1)
    })
    expect(service.terminate).not.toHaveBeenCalled()
  })

  it.each([
    [
      'cuts a title and a description over the limits of the API',
      { title: 't'.repeat(501), description: 'd'.repeat(50_001) },
      { title: 't'.repeat(500), description: 'd'.repeat(50_000) }
    ],
    [
      'never cuts an emoji in two',
      {
        title: `${'t'.repeat(499)}😀`,
        description: `${'d'.repeat(49_999)}😀`
      },
      { title: 't'.repeat(499), description: 'd'.repeat(49_999) }
    ],
    [
      'keeps texts that just fit, their last emoji included',
      {
        title: `${'t'.repeat(498)}😀`,
        description: `${'d'.repeat(49_998)}😀`
      },
      {
        title: `${'t'.repeat(498)}😀`,
        description: `${'d'.repeat(49_998)}😀`
      }
    ]
  ])('%s', async (_, data, saved) => {
    const { service, inbox, boardsApi, title, create } = await openForm({
      data
    })
    expect(title()).toHaveValue(saved.title)

    fireEvent.click(create())

    await waitFor(() => {
      expect(service.terminate).toHaveBeenCalledWith(
        resultOf(inbox, saved.title)
      )
    })
    expect(boardsApi.setDescription.mock.calls[0]?.[2].markdown).toBe(
      saved.description
    )
  })

  it('gives the task saved without its details when the form is then closed', async () => {
    const { service, inbox, boardsApi, dialog, create } = await openForm()
    boardsApi.setDescription.mockRejectedValueOnce(new Error('offline'))
    fireEvent.click(create())
    await dialog.findByRole('alert')

    fireEvent.click(dialog.getByRole('button', { name: 'Close' }))
    const ask = within(
      await screen.findByRole('dialog', { name: 'Discard your changes?' })
    )
    expectNoAnswer(service)
    fireEvent.click(ask.getByRole('button', { name: 'Discard' }))

    await waitFor(() => {
      expect(service.terminate).toHaveBeenCalledWith(resultOf(inbox))
    })
    expect(service.terminate).toHaveBeenCalledTimes(1)
    expect(service.cancel).not.toHaveBeenCalled()
    expect(service.throw).not.toHaveBeenCalled()
  })

  it('gives the task saved without its details when the session then ends', async () => {
    const { service, session, inbox, boardsApi, dialog, create } =
      await openForm()
    boardsApi.setDescription.mockRejectedValueOnce(new Error('offline'))
    fireEvent.click(create())
    await dialog.findByRole('alert')

    act(() => {
      session.endElsewhere()
    })

    await waitFor(() => {
      expect(service.terminate).toHaveBeenCalledWith(resultOf(inbox))
    })
    expect(service.throw).not.toHaveBeenCalled()
    expect(service.cancel).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBe(null)
    expect(session.signIn).not.toHaveBeenCalled()
  })

  it.each([
    ['saved', 'Create', 'terminate'],
    ['closed', 'Close', 'cancel']
  ] as const)(
    'removes the form once the task is %s and the client answered',
    async (_, button, answer) => {
      const { service, dialog } = await openForm({ data: { title: '' } })
      if (button === 'Create') {
        fireEvent.change(dialog.getByRole('textbox', { name: 'Title' }), {
          target: { value: TITLE }
        })
      }

      fireEvent.click(dialog.getByRole('button', { name: button }))

      await waitFor(() => {
        expect(service[answer]).toHaveBeenCalledTimes(1)
      })
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBe(null)
      })
      // Nor a message of failure in its place
      expect(screen.queryByRole('heading', { level: 1 })).toBe(null)
    }
  )

  it('fills its frame with the form', async () => {
    const { title } = await openForm()

    // jsdom lays nothing out: the full screen dialog of MUI is the evidence
    expect(title().closest('.MuiDialog-paperFullScreen')).not.toBe(null)
  })

  // jsdom lays nothing out, so this reads the styles that make a browser keep
  // Create in the frame: either its bar sticks to the bottom, or the fields
  // scroll in a box that every wrapper up to the dialog lets shrink. It cannot
  // tell that the button is on screen: only a real browser can (390x844).
  it('keeps Create in the frame while a long description scrolls', async () => {
    const { title, create } = await openForm({
      data: { title: TITLE, description: 'A long line\n\n'.repeat(200) }
    })
    const paper = title().closest('.MuiDialog-paper')
    if (!paper) throw new Error('The form is in no dialog')
    const chain = (from: Element) => {
      const found: Element[] = []
      for (
        let element: Element | null = from;
        element && element !== paper;
        element = element.parentElement
      ) {
        found.push(element)
      }
      return found
    }

    const sticks = chain(create()).some(element => {
      const style = getComputedStyle(element)
      return style.position === 'sticky' && parseFloat(style.bottom) === 0
    })
    if (sticks) return

    const scroller = chain(title()).find(element =>
      ['auto', 'scroll'].includes(getComputedStyle(element).overflowY)
    )
    expect(scroller, 'the fields scroll in a box of their own').toBeDefined()
    if (!scroller) return
    expect(scroller).not.toContainElement(create())
    // A wrapper that grows with its content makes the whole dialog scroll,
    // Create with it
    const rigid = chain(scroller)
      .slice(1)
      .filter(element => {
        const style = getComputedStyle(element)
        if (style.display === 'contents') return false
        const column =
          style.display === 'flex' && style.flexDirection === 'column'
        const shrinks =
          parseFloat(style.minHeight) === 0 ||
          !['', 'visible'].includes(style.overflowY)
        return !column || !shrinks
      })
      .map(element => element.tagName.toLowerCase())
    expect(rigid, 'wrappers that let the dialog scroll as a whole').toEqual([])
  })

  it('offers the templates, without a link to manage them', async () => {
    const opened = openIntent()
    await opened.boardsApi.createTemplate(opened.inbox.project.id, {
      title: 'Monthly report',
      description: '',
      priority: null,
      labelIds: [],
      assigneeIds: []
    })
    opened.start()
    const { dialog } = await findForm()

    fireEvent.click(await dialog.findByRole('button', { name: 'Template' }))

    expect(
      await screen.findByRole('menuitem', { name: /Monthly report/ })
    ).toBeVisible()
    expect(screen.queryByText('Manage templates')).toBe(null)
  })

  it('says there is nowhere to add a task, and gives null when closed', async () => {
    const { service, start } = openIntent({
      data: {},
      boards: [aBoard({ name: 'Shared', role: 'viewer' })]
    })
    start()
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Create a task' })
    )
    expect(await dialog.findByText("You can't add tasks here.")).toBeVisible()

    fireEvent.click(dialog.getByRole('button', { name: 'Close' }))

    await waitFor(() => {
      expect(service.cancel).toHaveBeenCalledTimes(1)
    })
  })
})

describe('the intents page when it cannot serve', () => {
  it('shows a loader until the client answers', async () => {
    const { start } = openIntent()
    platform.createService.mockReturnValue(new Promise(() => undefined))
    start()
    await waitFor(() => {
      expect(platform.createService).toHaveBeenCalled()
    })
    // Past the fade of the sign-in screen
    await act(() => new Promise(resolve => setTimeout(resolve, 500)))

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBe(null)
    expect(screen.queryByRole('navigation')).toBe(null)
  })

  it('gives up on a client silent for 30 s, and tells it should it answer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { service, start } = openIntent()
    const late = Promise.withResolvers<Service>()
    platform.createService.mockReturnValue(late.promise)
    start()
    await waitFor(() => {
      expect(platform.createService).toHaveBeenCalled()
    })

    await act(() => vi.advanceTimersByTimeAsync(25_000))
    expect(screen.queryByRole('heading', { level: 1 })).toBe(null)
    await act(() => vi.advanceTimersByTimeAsync(6000))
    await expectMessage()
    await act(async () => {
      late.resolve(service)
      await late.promise
    })

    await waitFor(() => {
      expect(service.throw).toHaveBeenCalledWith(expect.any(Error))
    })
    expect(screen.queryByRole('dialog')).toBe(null)
  })

  it.each([
    ['no intent id', '/intents'],
    ['an id that is no cozy-stack id', '/intents?intent=..%2Fsettings']
  ])('says why for %s, without calling the stack', async (_, path) => {
    const { start } = openIntent({ path })
    start()

    await expectMessage()
    expect(platform.createService).not.toHaveBeenCalled()
  })

  it('says why out of a frame', async () => {
    vi.unstubAllGlobals()
    const { start } = openIntent()
    start()

    await expectMessage()
    expect(platform.createService).not.toHaveBeenCalled()
  })

  it('says why to a user without a platform', async () => {
    const { start } = openIntent({
      session: fakeSession(() =>
        Promise.resolve({ ...fakeUser('id-token'), workplaceFqdn: null })
      )
    })
    start()

    await expectMessage()
    expect(platform.createService).not.toHaveBeenCalled()
  })

  it('says why when the platform refuses the id token', async () => {
    platform.sdk.status = 'public'
    platform.sdk.login.mockRejectedValue(new Error('token_exchange: 403'))
    const { start } = openIntent()
    start()

    await expectMessage()
    expect(platform.createService).not.toHaveBeenCalled()
  })

  it.each([
    [
      'a frame the intent does not allow',
      'Intent service is framed by a page the intent does not allow'
    ],
    ['an intent the stack refuses', 'token_exchange: 403']
  ])('says why for %s', async (_, message) => {
    const { start } = openIntent()
    platform.createService.mockRejectedValue(new Error(message))
    start()

    await expectMessage()
    expect(platform.createService).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['another action', { action: 'PICK', type: 'io.cozy.tasks' }],
    ['another type', { action: 'CREATE', type: 'io.cozy.files' }]
  ])('fails %s, for the client and the user', async (_, attributes) => {
    const { start } = openIntent()
    const service = fakeService(PREFILL, attributes)
    platform.createService.mockResolvedValue(service)
    start()

    await expectMessage()
    await waitFor(() => {
      expect(service.throw).toHaveBeenCalledTimes(1)
    })
    expect(service.throw).toHaveBeenCalledWith(expect.any(Error))
  })

  it.each([
    ['a text', 'Fix the login page'],
    ['a number', 42],
    ['zero', 0],
    ['false', false],
    ['an empty text', ''],
    ['a list', [PREFILL]],
    ['a title that is no text', { title: 42 }],
    ['a description that is no text', { description: ['a'] }]
  ])('fails data of another shape: %s', async (_, data) => {
    const { service, start } = openIntent({ data })
    start()

    await expectMessage()
    await waitFor(() => {
      expect(service.throw).toHaveBeenCalledTimes(1)
    })
    expect(service.throw).toHaveBeenCalledWith(expect.any(Error))
    expect(service.terminate).not.toHaveBeenCalled()
  })

  it('fails the intent when the boards cannot be loaded', async () => {
    const { service, boardsApi, start } = openIntent()
    boardsApi.listBoards.mockRejectedValue(new ApiError(403, 'forbidden'))
    start()

    await expectMessage()
    await waitFor(() => {
      expect(service.throw).toHaveBeenCalledTimes(1)
    })
  })

  it('fails the intent when the session ends elsewhere', async () => {
    const { service, session } = await openForm()

    act(() => {
      session.endElsewhere()
    })

    await expectMessage()
    await waitFor(() => {
      expect(service.throw).toHaveBeenCalledTimes(1)
    })
    // No popup nor page of the SSO: the frame stays
    expect(session.signIn).not.toHaveBeenCalled()
  })

  it('gives the client the error when the form crashes', async () => {
    fault.render = true
    const { service, start } = openIntent()
    start()

    await waitFor(() => {
      expect(service.throw).toHaveBeenCalledTimes(1)
    })
    expect(service.throw).toHaveBeenCalledWith(expect.any(Error))
    expect(service.terminate).not.toHaveBeenCalled()
    expect(service.cancel).not.toHaveBeenCalled()
  })

  it('fails the intent when the session ends during a save that then fails', async () => {
    const { service, session, boardsApi, create } = await openForm()
    const held = Promise.withResolvers<never>()
    boardsApi.createTask.mockReturnValueOnce(held.promise)
    fireEvent.click(create())
    await waitFor(() => {
      expect(create()).toBeDisabled()
    })
    act(() => {
      session.endElsewhere()
    })
    expectNoAnswer(service)

    held.reject(new Error('offline'))

    await waitFor(() => {
      expect(service.throw).toHaveBeenCalledTimes(1)
    })
    expect(service.terminate).not.toHaveBeenCalled()
  })

  it('waits for a save in flight when the session ends, then gives the task', async () => {
    const { service, session, inbox, boardsApi, create } = await openForm()
    const release = holdCreation(boardsApi)
    fireEvent.click(create())
    await waitFor(() => {
      expect(create()).toBeDisabled()
    })

    act(() => {
      session.endElsewhere()
    })
    expectNoAnswer(service)
    release()

    await waitFor(() => {
      expect(service.terminate).toHaveBeenCalledWith(resultOf(inbox))
    })
    expect(service.throw).not.toHaveBeenCalled()
  })
})
