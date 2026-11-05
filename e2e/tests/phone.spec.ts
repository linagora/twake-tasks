import { expect, test, type Page } from '@playwright/test'
import { newBoard } from './board.ts'
import { signIn } from './signIn.ts'
import { aliceSpace } from './space.ts'

test.use({ viewport: { width: 390, height: 844 } })

const overflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  )

test('fits a phone screen, without scrolling sideways', async ({ page }) => {
  await signIn(page, 'alice')

  for (const path of ['/', '/today', '/notifications']) {
    await page.goto(path)
    await expect(page.getByRole('main')).toBeVisible()
    expect(await overflow(page), path).toBe(0)
    await expect(page.getByRole('combobox', { name: 'Search' })).toBeVisible()
    const search = await page.getByRole('search').boundingBox()
    expect(search?.width, 'search field').toBeGreaterThan(150)
  }
})

test('fits a board on a phone screen', async ({ page }) => {
  await signIn(page, 'alice')
  await newBoard(page)

  await expect(
    page.getByRole('button', { name: 'Board options' })
  ).toBeVisible()
  expect(await overflow(page)).toBe(0)
})

test("keeps a project board's actions at the right edge on a phone", async ({
  page
}) => {
  const { projectId, name } = await aliceSpace(page)
  await page.goto(`/embed/projects/${projectId}`)

  const right = (box: { x: number; width: number }) => box.x + box.width
  const middle = (box: { y: number; height: number }) => box.y + box.height / 2
  await expect(async () => {
    const title = await page.getByRole('heading', { name }).boundingBox()
    const menu = await page
      .getByRole('button', { name: 'Board options' })
      .boundingBox()
    const layouts = await page
      .getByRole('group', { name: 'Layout' })
      .boundingBox()
    if (!title || !menu || !layouts) throw new Error('header not shown')
    expect(Math.abs(right(menu) - right(title))).toBeLessThan(2)
    expect(Math.abs(middle(menu) - middle(layouts))).toBeLessThan(2)
  }).toPass()
})

test('shows the whole role in the share dialog on a phone', async ({
  page
}) => {
  await signIn(page, 'alice')
  const { name } = await newBoard(page)

  await page.getByRole('button', { name: 'Share' }).click()
  const share = page.getByRole('dialog', { name: `Share ${name}` })
  // The invite's: the person signed in has their role as text.
  const roles = share.getByRole('button', { name: /^Role\b/ })
  await expect(roles).toHaveCount(1)
  for (const role of await roles.all()) {
    const clipped = await role.evaluate((button: HTMLElement) =>
      [button, ...button.querySelectorAll<HTMLElement>('*')].some(
        element => element.scrollWidth > element.clientWidth
      )
    )
    expect(clipped).toBe(false)
  }
})
