import { randomUUID } from 'node:crypto'
import { expect, type Page } from '@playwright/test'
import { unique } from './board.ts'
import { projectOfSpace, publishPlatformEvent } from './platform.ts'
import { signIn } from './signIn.ts'

// A space with alice as its admin, whose project she sees once signed in.
export async function aliceSpace(page: Page) {
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
