import { expect, test, type Page } from '@playwright/test'
import { newBoard } from './board.ts'
import { signIn } from './signIn.ts'

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
    await expect(page.getByRole('searchbox')).toBeVisible()
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

test('shows the whole role in the share dialog on a phone', async ({
  page
}) => {
  await signIn(page, 'alice')
  const { name } = await newBoard(page)

  await page.getByRole('button', { name: 'Share' }).click()
  const share = page.getByRole('dialog', { name: `Share ${name}` })
  const roles = share.getByRole('button', { name: /^Role: / })
  await expect(roles).toHaveCount(2)
  for (const role of await roles.all()) {
    const clipped = await role.evaluate((button: HTMLElement) =>
      [button, ...button.querySelectorAll<HTMLElement>('*')].some(
        element => element.scrollWidth > element.clientWidth
      )
    )
    expect(clipped).toBe(false)
  }
})
