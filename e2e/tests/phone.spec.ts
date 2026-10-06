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
    const search = await page.getByRole('searchbox').boundingBox()
    expect(search?.width, 'search field').toBeGreaterThan(150)
  }
})

test('fits a board on a phone screen', async ({ page }) => {
  await signIn(page, 'alice')
  await newBoard(page)

  await expect(
    page.getByRole('button', { name: 'Archive board' })
  ).toBeVisible()
  expect(await overflow(page)).toBe(0)
})
