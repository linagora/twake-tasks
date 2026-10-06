import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { expect, test, type Page } from '@playwright/test'
import { unique } from './board.ts'
import { projectOfSpace, publishPlatformEvent } from './platform.ts'
import { signIn } from './signIn.ts'

// The SSO lets TwakeSpace frame it on the first port, not on the second
const TRUSTED_PORT = 3301
const UNTRUSTED_PORT = 3302

// A stand-in for TwakeSpace that frames the embed and records what it says.
// A real server: Chrome keeps pages it did not load off the network from
// framing localhost.
function twakeSpace(projectId: string, port: number) {
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html')
    response.end(`<!doctype html>
      <script>
        window.paths = []
        addEventListener('message', event => {
          if (event.origin === 'http://localhost:3300') window.paths.push(event.data.path)
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

async function aliceSpace(page: Page) {
  const spaceId = randomUUID()
  const name = `Roadmap ${unique()}`
  publishPlatformEvent('twake.space.created', {
    organizationId: 'acme.e2e.test',
    id: spaceId,
    name,
    members: [
      {
        uuid: '0a11ce00-0000-4000-8000-000000000001',
        email: 'alice@acme.e2e.test',
        role: 'admin'
      }
    ]
  })
  await signIn(page, 'alice')
  await expect(async () => {
    await page.goto('/')
    await expect(page.getByRole('link', { name })).toBeVisible({
      timeout: 1000
    })
  }).toPass()
  return { projectId: projectOfSpace(spaceId), name }
}

test("shows a space's boards inside TwakeSpace, signed in without a prompt", async ({
  page
}) => {
  const { projectId, name } = await aliceSpace(page)

  const host = await twakeSpace(projectId, TRUSTED_PORT)
  try {
    await page.goto(host.url)
    const frame = page.frameLocator('iframe[title="Tasks"]')

    await frame.getByRole('link', { name }).click()

    await expect(
      frame.getByRole('link', { name: 'Back to boards' })
    ).toBeVisible()
    await expect(frame.getByRole('navigation')).toHaveCount(0)
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { paths: string[] }).paths.at(-1)
        )
      )
      .toMatch(new RegExp(`^/embed/projects/${projectId}/boards/`))
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
    await frame.getByRole('button', { name: 'Try again' }).click()
    await (await popup).waitForEvent('close')

    await expect(frame.getByRole('link', { name })).toBeVisible()
  } finally {
    host.close()
  }
})
