import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiError } from '@/application/boards'
import type { Role } from '@/domain/board'
import { aBoard, aProject, fakeBoardsApi } from '@/testing/fakeBoardsApi'
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

  it('lists each project’s templates', async () => {
    const { design, boardsApi } = aSetup()
    await boardsApi.createTemplate(design.project.id, {
      ...NO_DETAILS,
      title: 'Monthly report',
      priority: 2,
      labelIds: ['l1']
    })
    await boardsApi.createTemplate(design.project.id, {
      ...NO_DETAILS,
      title: 'Weekly review'
    })
    renderRoute('/settings', { boardsApi })

    const project = await screen.findByRole('region', { name: 'Design' })

    expect(within(project).getByText('Monthly report')).toBeVisible()
    expect(within(project).getByText('P2 · 1 label')).toBeVisible()
    expect(within(project).getByText('Weekly review')).toBeVisible()
    expect(within(project).getByText('Title only')).toBeVisible()
  })

  it('creates a template in the only project the person edits', async () => {
    const { design, boardsApi } = aSetup()
    renderRoute('/settings', { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'New template' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'New template' })
    )
    fireEvent.change(dialog.getByRole('textbox', { name: 'Task title' }), {
      target: { value: 'Weekly review' }
    })
    expect(dialog.queryByRole('combobox', { name: 'Available in' })).toBe(null)
    fireEvent.click(dialog.getByRole('button', { name: 'Create template' }))

    expect(
      await within(
        await screen.findByRole('region', { name: 'Design' })
      ).findByText('Weekly review')
    ).toBeVisible()
    expect(await boardsApi.listTemplates()).toMatchObject([
      { projectId: design.project.id, title: 'Weekly review' }
    ])
  })

  it('creates a template from its project’s card, in that project', async () => {
    const { design, boardsApi } = aSetup()
    const ops = aBoard({ name: 'Ops', project: aProject({ name: 'Ops' }) })
    boardsApi.projects.unshift({ ...ops.project, role: 'editor' })
    await boardsApi.createTemplate(design.project.id, {
      ...NO_DETAILS,
      title: 'Monthly report'
    })
    renderRoute('/settings', { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: 'New template in Design' })
    )
    const dialog = within(
      await screen.findByRole('dialog', { name: 'New template' })
    )
    fireEvent.change(dialog.getByRole('textbox', { name: 'Task title' }), {
      target: { value: 'Weekly review' }
    })
    expect(dialog.queryByRole('combobox', { name: 'Available in' })).toBe(null)
    fireEvent.click(dialog.getByRole('button', { name: 'Create template' }))

    expect(
      await within(
        await screen.findByRole('region', { name: 'Design' })
      ).findByText('Weekly review')
    ).toBeVisible()
  })

  it('jumps to a section from the menu of sections', async () => {
    renderRoute('/settings', aSetup())
    const menu = within(
      await screen.findByRole('navigation', { name: 'Settings sections' })
    )

    expect(menu.getByRole('link', { name: 'Notifications' })).toHaveAttribute(
      'aria-current',
      'true'
    )
    fireEvent.click(menu.getByRole('link', { name: 'Templates' }))

    expect(menu.getByRole('link', { name: 'Templates' })).toHaveAttribute(
      'aria-current',
      'true'
    )
    expect(
      menu.getByRole('link', { name: 'Notifications' })
    ).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('region', { name: 'Templates' })).toHaveFocus()
  })

  it('offers no new template to someone who edits no project', async () => {
    renderRoute('/settings', aSetup('viewer'))

    expect(await findEmptyState('No templates yet')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'New template' })).toBe(null)
  })

  it('creates a template in the project picked, with an assignee', async () => {
    const { design, boardsApi } = aSetup()
    const ops = aBoard({ name: 'Ops', project: aProject({ name: 'Ops' }) })
    boardsApi.projects.unshift({ ...ops.project, role: 'editor' })
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
    const { design, boardsApi } = aSetup()
    await boardsApi.createTemplate(design.project.id, {
      ...NO_DETAILS,
      title: 'Weekly review'
    })
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
    await boardsApi.createTemplate(design.project.id, {
      ...NO_DETAILS,
      title: 'Monthly report'
    })
    renderRoute('/settings', { boardsApi })

    const project = await screen.findByRole('region', { name: 'Design' })

    expect(within(project).getByText('View only')).toBeVisible()
    expect(
      templatesRegion().queryByRole('button', {
        name: 'Options for Monthly report'
      })
    ).toBe(null)
  })

  it('creates a template on a schedule and sums the schedule up', async () => {
    const { design, boardsApi } = aSetup()
    renderRoute('/settings', { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'New template' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'New template' })
    )
    fireEvent.change(dialog.getByRole('textbox', { name: 'Task title' }), {
      target: { value: 'Standup notes' }
    })
    fireEvent.click(dialog.getByLabelText('Create on a schedule'))
    fireEvent.click(dialog.getByRole('button', { name: 'Monday' }))
    fireEvent.click(dialog.getByRole('button', { name: 'Create template' }))
    expect(await dialog.findByText('Pick at least one day.')).toBeVisible()
    fireEvent.click(dialog.getByRole('button', { name: 'Friday' }))
    fireEvent.click(dialog.getByRole('button', { name: 'Create template' }))

    expect(
      await screen.findByText('Every week on Friday at 09:00')
    ).toBeVisible()
    expect(boardsApi.createTemplate).toHaveBeenLastCalledWith(
      design.project.id,
      expect.objectContaining({
        schedule: {
          boardId: design.id,
          rule: { kind: 'weekly', every: 1, weekdays: [5] },
          time: '09:00',
          zone: expect.any(String) as string,
          workingDays: false,
          endsOn: null,
          paused: false
        }
      })
    )
  })

  it('keeps the schedule out of an edit that leaves it as it is', async () => {
    const { design, boardsApi } = aSetup()
    await boardsApi.createTemplate(design.project.id, {
      ...NO_DETAILS,
      title: 'Monthly report',
      schedule: {
        boardId: design.id,
        rule: { kind: 'monthly', every: 1, day: 25 },
        time: '08:00',
        zone: 'Europe/Paris',
        workingDays: false,
        endsOn: null,
        paused: false
      }
    })
    renderRoute('/settings', { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Options for Monthly report' })
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Edit template' })
    )
    fireEvent.change(dialog.getByRole('textbox', { name: 'Task title' }), {
      target: { value: 'Month report' }
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Month report')).toBeVisible()
    expect(boardsApi.editTemplate.mock.lastCall?.[1]).not.toHaveProperty(
      'schedule'
    )
  })

  it('shows a schedule its author stopped, and resumes it on save', async () => {
    const { design, boardsApi } = aSetup()
    const template = await boardsApi.createTemplate(design.project.id, {
      ...NO_DETAILS,
      title: 'Monthly report',
      schedule: {
        boardId: design.id,
        rule: { kind: 'daily', every: 1 },
        time: '08:00',
        zone: 'Europe/Paris',
        workingDays: true,
        endsOn: null,
        paused: false
      }
    })
    boardsApi.listTemplates.mockResolvedValue([
      {
        ...template,
        schedule: template.schedule && {
          ...template.schedule,
          paused: true,
          pausedBy: 'author',
          nextRunAt: null
        }
      }
    ])
    renderRoute('/settings', { boardsApi })

    expect(
      await screen.findByText(/^Paused · Every working day at 08:00/)
    ).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'Options for Monthly report' })
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Edit template' })
    )
    expect(dialog.getByText(/its author can no longer add tasks/)).toBeVisible()
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(boardsApi.editTemplate.mock.lastCall?.[1]).toMatchObject({
        schedule: { boardId: design.id, paused: false }
      })
    })
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
