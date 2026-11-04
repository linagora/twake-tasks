import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiError } from '@/application/boards'
import type { Role } from '@/domain/board'
import { aBoard, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { findEmptyState } from '@/testing/emptyState'
import { renderRoute } from '@/testing/renderWithProviders'

const NO_DETAILS = {
  description: '',
  priority: null,
  labelIds: [],
  assigneeIds: []
}

function aSetup(role: Role = 'editor') {
  const design = aBoard({
    name: 'Product Design',
    members: [{ userId: 'u-ana', email: 'ana@example.com', name: 'Ana Lopez' }],
    labels: [{ id: 'l1', name: 'ops', color: null }]
  })
  const boardsApi = fakeBoardsApi([design])
  boardsApi.projects.push({ ...design.project, role })
  return { design, boardsApi }
}

const templatesRegion = () =>
  within(screen.getByRole('region', { name: 'Templates' }))

describe('SettingsScreen', () => {
  it('says there are no templates yet', async () => {
    renderRoute('/settings', aSetup())

    expect(await findEmptyState('No templates yet')).toBeVisible()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Settings' })
    ).toBeVisible()
  })

  it('lists my own templates, then each project’s', async () => {
    const { design, boardsApi } = aSetup()
    await boardsApi.createTemplate(
      { projectId: design.project.id },
      { ...NO_DETAILS, title: 'Monthly report', priority: 2, labelIds: ['l1'] }
    )
    await boardsApi.createTemplate(
      { projectId: null },
      { ...NO_DETAILS, title: 'Weekly review' }
    )
    renderRoute('/settings', { boardsApi })

    const mine = await screen.findByRole('region', { name: 'My templates' })
    const project = screen.getByRole('region', { name: 'Design' })

    expect(within(mine).getByText('Weekly review')).toBeVisible()
    expect(within(mine).getByText('Title only')).toBeVisible()
    expect(within(project).getByText('Monthly report')).toBeVisible()
    expect(within(project).getByText('P2 · 1 label')).toBeVisible()
  })

  it('creates a template of mine', async () => {
    const { boardsApi } = aSetup()
    renderRoute('/settings', { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'New template' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'New template' })
    )
    fireEvent.change(dialog.getByRole('textbox', { name: 'Task title' }), {
      target: { value: 'Weekly review' }
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Create template' }))

    expect(
      await within(
        await screen.findByRole('region', { name: 'My templates' })
      ).findByText('Weekly review')
    ).toBeVisible()
    expect(await boardsApi.listTemplates()).toMatchObject([
      { projectId: null, title: 'Weekly review' }
    ])
  })

  it('creates a project template with an assignee', async () => {
    const { design, boardsApi } = aSetup()
    renderRoute('/settings', { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'New template' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'New template' })
    )
    fireEvent.change(dialog.getByRole('textbox', { name: 'Task title' }), {
      target: { value: 'Monthly report' }
    })
    fireEvent.mouseDown(dialog.getByRole('combobox', { name: 'Available in' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Design' }))
    fireEvent.click(
      await dialog.findByRole('button', { name: 'Add assignees' })
    )
    const assign = await screen.findByRole('dialog', {
      name: 'Assign the tasks made from it'
    })
    fireEvent.click(
      within(assign).getByRole('menuitemcheckbox', { name: /Ana Lopez/ })
    )
    fireEvent.keyDown(assign, { key: 'Escape' })
    expect(await dialog.findByText('Ana Lopez')).toBeVisible()
    fireEvent.click(dialog.getByRole('button', { name: 'Create template' }))

    await waitFor(async () => {
      expect(await boardsApi.listTemplates()).toMatchObject([
        { projectId: design.project.id, assigneeIds: ['u-ana'] }
      ])
    })
  })

  it('edits and deletes a template from its menu', async () => {
    const { boardsApi } = aSetup()
    await boardsApi.createTemplate(
      { projectId: null },
      { ...NO_DETAILS, title: 'Weekly review' }
    )
    renderRoute('/settings', { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Options for Weekly review' })
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Edit template' })
    )
    fireEvent.change(dialog.getByRole('textbox', { name: 'Task title' }), {
      target: { value: 'Sprint review' }
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Options for Sprint review' })
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(
      within(
        await screen.findByRole('dialog', { name: 'Delete Sprint review?' })
      ).getByRole('button', { name: 'Delete' })
    )

    expect(await findEmptyState('No templates yet')).toBeVisible()
  })

  it('shows a project’s templates to a viewer, without changing them', async () => {
    const { design, boardsApi } = aSetup('viewer')
    await boardsApi.createTemplate(
      { projectId: design.project.id },
      { ...NO_DETAILS, title: 'Monthly report' }
    )
    renderRoute('/settings', { boardsApi })

    const project = await screen.findByRole('region', { name: 'Design' })

    expect(within(project).getByText('View only')).toBeVisible()
    expect(
      templatesRegion().queryByRole('button', {
        name: 'Options for Monthly report'
      })
    ).toBe(null)
  })

  it('offers to try again when templates cannot load', async () => {
    const { boardsApi } = aSetup()
    // A refusal, which is not retried before the page shows it
    boardsApi.listTemplates.mockRejectedValueOnce(
      new ApiError(403, 'forbidden')
    )
    renderRoute('/settings', { boardsApi })

    const failed = await screen.findByRole('alert')
    fireEvent.click(within(failed).getByRole('button', { name: 'Try again' }))

    expect(await findEmptyState('No templates yet')).toBeVisible()
  })
})
