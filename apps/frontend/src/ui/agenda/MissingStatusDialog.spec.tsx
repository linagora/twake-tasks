import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { MissingStatusDialog } from '@/ui/agenda/MissingStatusDialog'
import { useAddStatusAndMove } from '@/ui/boards/queries'
import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderWithProviders } from '@/testing/renderWithProviders'

// The dialog as a view shows it for a task dropped in a status its board lacks.
function Dropped({ boardId, taskId }: { boardId: string; taskId: string }) {
  const add = useAddStatusAndMove()
  const [open, setOpen] = useState(true)
  if (!open) return <p>closed</p>
  return (
    <MissingStatusDialog
      board="Design"
      status="Review"
      busy={add.isPending}
      failed={add.isError}
      onCancel={() => {
        setOpen(false)
      }}
      onAdd={() => {
        add.mutate(
          {
            boardId,
            taskId,
            status: { name: 'Review', category: 'started' },
            neighbours: {}
          },
          {
            onSuccess: () => {
              setOpen(false)
            }
          }
        )
      }}
    />
  )
}

describe('MissingStatusDialog', () => {
  async function setup() {
    const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
    const logo = aTask(design.sections[0] ?? null, { title: 'Logo' })
    design.tasks = [logo]
    const boardsApi = fakeBoardsApi([design])
    renderWithProviders(<Dropped boardId={design.id} taskId={logo.id} />, {
      boardsApi
    })
    const dialog = within(
      await screen.findByRole('dialog', {
        name: '“Design” has no “Review” section'
      })
    )
    return { design, logo, boardsApi, dialog }
  }

  it('says why the task cannot go there, and leaves it on Cancel', async () => {
    const { boardsApi, dialog } = await setup()

    expect(
      dialog.getByText(/A task can only be in a section of its own board/)
    ).toBeVisible()
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByText('closed')).toBeVisible()
    expect(boardsApi.createSection).not.toHaveBeenCalled()
    expect(boardsApi.moveTask).not.toHaveBeenCalled()
  })

  it('adds the section to the board, then moves the task into it', async () => {
    const { design, logo, boardsApi, dialog } = await setup()

    fireEvent.click(
      dialog.getByRole('button', { name: 'Add “Review” to “Design”' })
    )

    await waitFor(() => {
      expect(screen.getByText('closed')).toBeVisible()
    })
    const review = design.sections.find(each => each.name === 'Review')
    expect(review?.category).toBe('started')
    expect(boardsApi.moveTask).toHaveBeenCalledWith(design.id, logo.id, {
      sectionId: review?.id
    })
  })
})
