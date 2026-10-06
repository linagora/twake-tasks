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
      .getByRole('article', { name: 'alice@acme.e2e.test' })
  await page.getByRole('button', { name: 'Write the press release' }).click()
  const panel = page.getByRole('dialog', { name: task })
  await panel
    .getByRole('textbox', { name: 'Comment' })
    .fill('First draft by Friday')
  await panel.getByRole('button', { name: 'Send' }).click()
  await expect(comment()).toContainText('First draft by Friday')

  await page.reload()
  await page.getByRole('button', { name: 'Write the press release' }).click()

  await expect(comment()).toContainText('First draft by Friday')
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
  await assign.getByLabel('bob@acme.e2e.test').check()
  await assign.getByRole('button', { name: 'Save' }).click()

  await bob.getByRole('link', { name: 'Notifications' }).click()
  const notification = bob.getByRole('listitem').filter({
    has: bob.getByRole('link', { name: `${prefix}-1 Order the badges` })
  })
  await expect(notification).toContainText('You were assigned')
})
