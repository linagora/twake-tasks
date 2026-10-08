import { createServer } from 'node:http'
import { expect, test } from '@playwright/test'
import { aliceSpace } from './space.ts'

// The SSO lets TwakeSpace frame it on the first port, not on the second
const TRUSTED_PORT = 3301
const UNTRUSTED_PORT = 3302

// The stand-ins for TwakeSpace listen on the same trusted port: one at a time.
test.describe.configure({ mode: 'default' })

// A stand-in for TwakeSpace that frames the embed and records what it says.
// It greets the frame on each of its loads, as TwakeSpace does: the app posts
// nothing before.
// A real server: Chrome keeps pages it did not load off the network from
// framing localhost.
function twakeSpace(projectId: string, port: number) {
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html')
    response.end(`<!doctype html>
      <script>
        window.paths = []
        addEventListener('load', event => {
          if (event.target.tagName === 'IFRAME') event.target.contentWindow.postMessage({ type: 'twake-embed:hello' }, 'http://localhost:3300')
        }, true)
        addEventListener('message', event => {
          if (event.origin !== 'http://localhost:3300') return
          if (event.data?.type === 'twake-embed:ready') event.source.postMessage({ type: 'twake-embed:hello' }, 'http://localhost:3300')
          if (event.data?.type === 'twake-embed:path') window.paths.push(event.data.path)
        })
      </script>
      <iframe title="Tasks" src="http://localhost:3300/embed/projects/${projectId}"></iframe>`)
  })
  return new Promise<{ url: string; close: () => void }>(resolve =>
    server.listen(port, 'localhost', () => {
      resolve({
        url: `http://localhost:${String(port)}`,
        close: () => server.close()
      })
    })
  )
}

test("opens a space's only board inside TwakeSpace, signed in without a prompt", async ({
  page
}) => {
  const { projectId, name } = await aliceSpace(page)

  const host = await twakeSpace(projectId, TRUSTED_PORT)
  try {
    await page.goto(host.url)
    const frame = page.frameLocator('iframe[title="Tasks"]')

    await expect(frame.getByRole('heading', { name })).toBeVisible()
    await expect(
      frame.getByRole('link', { name: 'Back to boards' })
    ).toHaveCount(0)
    await expect(frame.getByRole('navigation')).toHaveCount(0)
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { paths: string[] }).paths.at(-1)
        )
      )
      .toMatch(/^\/boards\//)
  } finally {
    host.close()
  }
})

test('signs in through a popup when the SSO refuses to be framed by TwakeSpace', async ({
  page
}) => {
  test.slow()
  const { projectId, name } = await aliceSpace(page)

  const host = await twakeSpace(projectId, UNTRUSTED_PORT)
  try {
    await page.goto(host.url)
    const frame = page.frameLocator('iframe[title="Tasks"]')

    const popup = page.waitForEvent('popup')
    await frame.getByRole('button', { name: 'Back to sign-in' }).click()
    await (await popup).waitForEvent('close')

    await expect(frame.getByRole('heading', { name })).toBeVisible()
  } finally {
    host.close()
  }
})

const FRAME = 'twake-embed-tasks'

// A stand-in for TwakeSpace that frames the embed as it does: a named frame,
// and over the whole page an overlay frame on the app's origin, clipped to
// the region the app reports. It greets the tasks frame on each of its loads.
function twakeSpaceWithOverlay(projectId: string) {
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html')
    response.end(`<!doctype html>
      <style>
        body { margin: 0 }
        #tasks { position: fixed; top: 80px; left: 200px; width: 900px; height: 600px; border: 0 }
        #overlay { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; color-scheme: normal; clip-path: inset(0 0 100% 0) }
      </style>
      <iframe id="tasks" name="${FRAME}" title="Tasks" src="http://localhost:3300/embed/projects/${projectId}"></iframe>
      <iframe id="overlay" name="${FRAME}:overlay" title="Tasks windows" src="http://localhost:3300/embed/overlay.html"></iframe>
      <script>
        const tasks = document.getElementById('tasks')
        const overlay = document.getElementById('overlay')
        tasks.addEventListener('load', () => {
          tasks.contentWindow.postMessage({ type: 'twake-embed:hello' }, 'http://localhost:3300')
        })
        addEventListener('message', event => {
          if (event.origin !== 'http://localhost:3300' || event.source !== tasks.contentWindow) return
          if (event.data?.type === 'twake-embed:ready') {
            event.source.postMessage({ type: 'twake-embed:hello' }, 'http://localhost:3300')
            return
          }
          if (event.data?.type !== 'twake-embed:overlay-region') return
          const region = event.data.region
          overlay.style.clipPath = region === 'full' ? 'none' : region.length === 0 ? 'inset(0 0 100% 0)'
            : "path('" + region.map(b => 'M' + b.x + ' ' + b.y + 'h' + b.width + 'v' + b.height + 'h' + -b.width + 'Z').join(' ') + "')"
        })
      </script>`)
  })
  return new Promise<{ url: string; close: () => void }>(resolve =>
    server.listen(TRUSTED_PORT, 'localhost', () => {
      resolve({
        url: `http://localhost:${String(TRUSTED_PORT)}`,
        close: () => server.close()
      })
    })
  )
}

test("opens a task's panel on the page of TwakeSpace, not in its frame", async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const { projectId, name } = await aliceSpace(page)
  const host = await twakeSpaceWithOverlay(projectId)
  try {
    await page.goto(host.url)
    const frame = page.frameLocator(`iframe[name="${FRAME}"]`)
    const overlay = page.frameLocator(`iframe[name="${FRAME}:overlay"]`)
    const clipPath = () =>
      page.locator('#overlay').evaluate(element => element.style.clipPath)
    await expect(frame.getByRole('heading', { name })).toBeVisible()
    await frame
      .getByRole('button', { name: /^Add a task to / })
      .first()
      .click()
    await frame.getByLabel('Task title').fill('Plan the launch')
    await frame.getByRole('button', { name: 'Add', exact: true }).click()

    const card = frame.getByRole('button', { name: 'Plan the launch' })
    await card.click()
    const panel = overlay.getByRole('dialog', { name: /Plan the launch$/ })
    await expect(panel).toBeVisible()
    await expect(frame.getByRole('dialog')).toHaveCount(0)
    await expect.poll(clipPath).toBe('none')
    // Against the right end of TwakeSpace's window, its whole height
    // (polled: the panel slides in, and its URL change re-renders the page)
    const edges = async () => {
      const box = await panel.boundingBox()
      if (box === null) throw new Error('The panel is not laid out')
      return [Math.round(box.x + box.width), Math.round(box.height)]
    }
    await expect.poll(edges).toEqual([1440, 900])

    await panel.getByRole('textbox', { name: 'Comment' }).fill('On the page')
    await expect(panel.getByRole('textbox', { name: 'Comment' })).toContainText(
      'On the page'
    )

    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect.poll(clipPath).toMatch(/^inset/)
    await expect(card).toBeFocused()
  } finally {
    host.close()
  }
})
