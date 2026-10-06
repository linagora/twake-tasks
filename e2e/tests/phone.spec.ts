import { expect, test } from '@playwright/test'
import { signIn } from './signIn.ts'

test.use({ viewport: { width: 390, height: 844 } })

test('fits a phone screen, without scrolling sideways', async ({ page }) => {
  await signIn(page, 'alice')

  for (const path of ['/', '/today', '/notifications']) {
    await page.goto(path)
    await expect(page.getByRole('main')).toBeVisible()
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
    expect(overflow, path).toBe(0)
    const search = await page.getByRole('searchbox').boundingBox()
    expect(search?.width, 'search field').toBeGreaterThan(150)
  }
})
