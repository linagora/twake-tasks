import { expect, test } from '@playwright/test'

test('signing out ends the session: its access token is refused', async ({
  page
}) => {
  const apiCall = page.waitForRequest(
    request =>
      request.url().includes('/api/') && !!request.headers().authorization
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign in as alice' }).click()
  const authorization = (await apiCall).headers().authorization ?? ''
  await expect(page.getByRole('navigation')).toBeVisible()
  const boards = () =>
    page.request.get('/api/boards', { headers: { authorization } })
  expect((await boards()).status()).toBe(200)

  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Alice Martin' })
    .click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(
    page.getByRole('button', { name: 'Sign in as alice' })
  ).toBeVisible()

  expect((await boards()).status()).toBe(401)
})
