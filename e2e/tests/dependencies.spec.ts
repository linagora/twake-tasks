import { expect, test, type Page } from '@playwright/test'
import { addTask, newBoard } from './board.ts'
import { signIn } from './signIn.ts'

async function blockedTask(page: Page, blocker: string) {
  await signIn(page, 'alice')
  const { prefix } = await newBoard(page)
  await addTask(page, blocker)
  await addTask(page, 'Print the badges')

  await page.getByRole('button', { name: `Options for ${prefix}-2` }).click()
  await page.getByRole('menuitem', { name: 'Assign' }).click()
  await page
    .getByRole('dialog', { name: `Assign ${prefix}-2` })
    .getByRole('menuitemcheckbox', { name: /^Alice Martin/ })
    .click()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Print the badges' }).click()
  const panel = page.getByRole('dialog', {
    name: `${prefix}-2 Print the badges`
  })
  await panel.getByRole('button', { name: 'Add dependency' }).click()
  await page.getByRole('menuitem', { name: 'Blocked by…' }).click()
  const picker = page.getByRole('dialog', { name: 'Blocked by…' })
  await picker
    .getByRole('textbox', { name: 'Search by key or title' })
    .fill(`${prefix}-1`)
  await picker
    .getByRole('menuitem', { name: new RegExp(`${prefix}-1`) })
    .click()
  await expect(
    panel.getByRole('list', { name: 'Blocked by' }).getByText(blocker)
  ).toBeVisible()
  return { prefix }
}

test('opens from My tasks a blocker that is not assigned to me', async ({
  page
}) => {
  const { prefix } = await blockedTask(page, 'Book the venue')

  await page.goto('/mine')
  await page
    .getByRole('listitem', { name: `${prefix}-2 Print the badges` })
    .getByRole('button', { name: 'Print the badges' })
    .click()
  await page
    .getByRole('dialog', { name: `${prefix}-2 Print the badges` })
    .getByRole('list', { name: 'Blocked by' })
    .getByRole('link', { name: 'Book the venue' })
    .click()

  await expect(
    page.getByRole('dialog', { name: `${prefix}-1 Book the venue` })
  ).toBeVisible()
})

test('keeps a long blocker title inside the task panel', async ({ page }) => {
  const title =
    'Book the venue for the whole team, with catering, parking and a room large enough for the workshops'
  const { prefix } = await blockedTask(page, title)

  const panel = page.getByRole('dialog', {
    name: `${prefix}-2 Print the badges`
  })
  const overflow = await panel.evaluate(element =>
    [element, ...element.querySelectorAll('*')].some(
      each =>
        ['auto', 'scroll'].includes(getComputedStyle(each).overflowX) &&
        each.scrollWidth > each.clientWidth + 1
    )
  )
  expect(overflow).toBe(false)
})
