import { expect, test } from '@playwright/test'
import { addTask, invite, newBoard } from './board.ts'
import { asPerson, signIn } from './signIn.ts'

test('plans a board: a task and its comment survive a reload', async ({
  page
}) => {
  await signIn(page, 'alice')
  const { prefix } = await newBoard(page)

  await addTask(page, 'Write the press release')
  const task = `${prefix}-1 Write the press release`
  const comment = () =>
    page
      .getByRole('dialog', { name: task })
      .getByRole('article', { name: 'Alice Martin' })
  await page.getByRole('button', { name: 'Write the press release' }).click()
  const panel = page.getByRole('dialog', { name: task })
  await panel
    .getByRole('textbox', { name: 'Comment' })
    .fill('First draft by Friday')
  await panel.getByRole('button', { name: 'Send' }).click()
  await expect(comment()).toContainText('First draft by Friday')

  // The task is in the URL: the reload brings its panel back
  await page.reload()

  await expect(comment()).toContainText('First draft by Friday')
})

test('changing the view does not reopen a closed task', async ({ page }) => {
  await signIn(page, 'alice')
  const { prefix } = await newBoard(page)
  await addTask(page, 'Write the press release')
  const task = `${prefix}-1 Write the press release`

  await page.getByRole('button', { name: 'Write the press release' }).click()
  const panel = page.getByRole('dialog', { name: task })
  await expect(panel).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`\\?task=${prefix}-1$`))

  await panel.getByRole('button', { name: 'Close' }).click()
  await expect(panel).toBeHidden()
  await expect(page).not.toHaveURL(/task=/)

  const layout = page.getByRole('group', { name: 'Layout' })
  await layout.getByRole('button', { name: 'List' }).click()
  await expect(layout.getByRole('button', { name: 'List' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(panel).toBeHidden()
  await layout.getByRole('button', { name: 'Calendar' }).click()
  await expect(
    layout.getByRole('button', { name: 'Calendar' })
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(panel).toBeHidden()
})

test('shares a board: the invitee works on it, and the owner sees it live', async ({
  page,
  browser
}) => {
  await signIn(page, 'alice')
  const { name } = await newBoard(page)
  await invite(page, name, 'bob@acme.e2e.test')

  const bob = await asPerson(browser, 'bob')
  await bob.getByRole('link', { name }).click()
  await addTask(bob, 'Book the venue')

  await expect(
    page.getByRole('button', { name: 'Book the venue' })
  ).toBeVisible()
})

test('drags a card to another section and it stays there', async ({ page }) => {
  await signIn(page, 'alice')
  const { prefix } = await newBoard(page)
  await addTask(page, 'Print the posters')
  const card = page.getByRole('article', {
    name: `${prefix}-1 Print the posters`
  })
  const column = (name: string) =>
    page.locator('section').filter({
      has: page.getByRole('heading', { name, exact: true })
    })

  const from = await card.boundingBox()
  const to = await column('In progress').boundingBox()
  if (!from || !to) throw new Error('The board is not laid out')
  await page.mouse.move(from.x + 40, from.y + 20)
  await page.mouse.down()
  await page.mouse.move(from.x + 60, from.y + 30, { steps: 4 })
  await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 15 })
  await page.mouse.up()
  await expect(column('In progress').getByRole('article')).toHaveAccessibleName(
    `${prefix}-1 Print the posters`
  )

  await page.reload()
  await expect(column('In progress').getByRole('article')).toHaveAccessibleName(
    `${prefix}-1 Print the posters`
  )
})

test('notifies the person a task is assigned to', async ({ page, browser }) => {
  const bob = await asPerson(browser, 'bob')
  await signIn(page, 'alice')
  const { name, prefix } = await newBoard(page)
  await invite(page, name, 'bob@acme.e2e.test')
  // An invite turns into a membership when the invitee next uses Tasks
  await bob.reload()
  await page.reload()
  await addTask(page, 'Order the badges')

  await page.getByRole('button', { name: `Options for ${prefix}-1` }).click()
  await page.getByRole('menuitem', { name: 'Assign' }).click()
  const assign = page.getByRole('dialog', { name: `Assign ${prefix}-1` })
  const bobOption = assign.getByRole('menuitemcheckbox', {
    name: 'Bob Durand bob@acme.e2e.test'
  })
  await bobOption.click()
  await expect(bobOption).toBeChecked()
  await page.keyboard.press('Escape')

  await bob.getByRole('link', { name: /^Notifications/ }).click()
  const notification = bob.getByRole('listitem').filter({
    has: bob.getByRole('link', { name: `${prefix}-1 Order the badges` })
  })
  await expect(notification).toContainText('You were assigned')
})
