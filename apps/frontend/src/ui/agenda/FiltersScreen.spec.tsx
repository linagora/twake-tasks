import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'
import { localZone } from '@/ui/boards/dueLabel'

function boards() {
  const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
  design.labels = [{ id: 'l1', name: 'client' }]
  design.tasks = [
    aTask(null, {
      key: 'DES-1',
      title: 'Logo',
      priority: 1,
      labels: [{ id: 'l1', name: 'client' }]
    }),
    aTask(null, { key: 'DES-2', title: 'Poster', priority: 1 }),
    aTask(null, { key: 'DES-3', title: 'Flyer' })
  ]
  return fakeBoardsApi([design])
}

describe('FiltersScreen', () => {
  it('saves a filter and opens its tasks', async () => {
    const boardsApi = boards()
    renderRoute('/filters', { boardsApi })

    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Client fires' }
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Priority' }), {
      target: { value: '1' }
    })
    fireEvent.change(screen.getByLabelText('Label'), {
      target: { value: 'Client' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save filter' }))
    fireEvent.click(await screen.findByRole('link', { name: 'Client fires' }))

    expect(
      await screen.findByRole('heading', { name: 'Client fires' })
    ).toBeVisible()
    expect(await screen.findByText('Logo')).toBeVisible()
    expect(screen.queryByText('Poster')).not.toBeInTheDocument()
    expect(boardsApi.createFilter).toHaveBeenCalledWith({
      name: 'Client fires',
      criteria: { priority: 1, label: 'Client' }
    })
    expect(boardsApi.filteredTasks).toHaveBeenCalledWith(
      expect.any(String),
      localZone()
    )
  })

  it('deletes a filter', async () => {
    const boardsApi = boards()
    await boardsApi.createFilter({ name: 'Urgent', criteria: { priority: 1 } })
    renderRoute('/filters', { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete Urgent' })
    )

    expect(await screen.findByText('No saved filters.')).toBeVisible()
    expect(
      screen.getByRole('navigation').querySelector('a[href="/filters"]')
    ).not.toBeNull()
  })
})
