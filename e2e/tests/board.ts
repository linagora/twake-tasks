import { expect, type Page } from '@playwright/test'

// The stack keeps its database between runs: names and key prefixes are new each time.
export const unique = () => Math.random().toString(36).slice(2, 7).toUpperCase()

export async function newBoard(page: Page) {
  const prefix = `E${unique()}`
  const name = `Launch ${prefix}`
  await page.getByRole('button', { name: 'New' }).click()
  const dialog = page.getByRole('dialog', { name: 'New board' })
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Key prefix').fill(prefix)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('link', { name: 'Back to boards' })).toBeVisible()
  return { name, prefix }
}

export async function addTask(page: Page, title: string) {
  await page
    .getByRole('button', { name: /^Add a task to / })
    .first()
    .click()
  await page.getByLabel('Task title').fill(title)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
}

export async function invite(page: Page, board: string, email: string) {
  await page.getByRole('button', { name: 'Share' }).click()
  const share = page.getByRole('dialog', { name: `Share ${board}` })
  const form = share.getByRole('form', { name: 'Invite' })
  await form.getByLabel('Email').fill(email)
  await form.getByRole('button', { name: /^Role: / }).click()
  await page.getByRole('menuitem', { name: 'Editor' }).click()
  await form.getByRole('button', { name: 'Invite' }).click()
  await expect(share).toContainText(email)
  await share.getByRole('button', { name: 'Close' }).click()
}
