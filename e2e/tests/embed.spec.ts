import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { expect, test } from '@playwright/test'
import { unique } from './board.ts'
import { publishPlatformEvent } from './platform.ts'
import { signIn } from './signIn.ts'

const SPACE_ORIGIN = 'http://localhost:3301'

// A stand-in for TwakeSpace that frames the embed and records what it says.
// A real server: Chrome keeps pages it did not load off the network from
// framing localhost.
function twakeSpace(spaceId: string) {
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html')
    response.end(`<!doctype html>
      <script>
        window.paths = []
        addEventListener('message', event => {
          if (event.origin === 'http://localhost:3300') window.paths.push(event.data.path)
        })
      </script>
      <iframe title="Tasks" src="http://localhost:3300/embed/spaces/${spaceId}"></iframe>`)
  })
  return new Promise<{ close: () => void }>(resolve =>
    server.listen(3301, 'localhost', () => {
      resolve({ close: () => server.close() })
    })
  )
}

test("shows a space's boards inside TwakeSpace, signed in without a prompt", async ({
  page
}) => {
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

  const host = await twakeSpace(spaceId)
  try {
    await page.goto(SPACE_ORIGIN)
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
      .toMatch(new RegExp(`^/embed/spaces/${spaceId}/boards/`))
  } finally {
    host.close()
  }
})
