import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { DrivePicker } from '@/application/drivePicker'
import { RichTextEditor } from '@/ds/RichText'
import { fakeSession, fakeUser } from '@/testing/fakeSession'
import { renderWithProviders } from '@/testing/renderWithProviders'
import { useRichTextLabels } from '@/ui/boards/useRichTextLabels'
import { useDrivePicker } from '@/ui/drive/useDrivePicker'

const DRIVE = 'Link a file from Twake Drive'

function Editor({ onChange }: { onChange: (markdown: string) => void }) {
  const labels = useRichTextLabels()
  const drive = useDrivePicker()
  return (
    <>
      <RichTextEditor
        label="Description"
        initial="Files"
        labels={labels}
        onChange={onChange}
        linkPicker={drive.linkPicker}
      />
      {drive.dialog}
    </>
  )
}

const signedIn = () => fakeSession(() => Promise.resolve(fakeUser('id-token')))

function renderEditor(
  picker: DrivePicker | null,
  session = signedIn()
): { onChange: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn> } {
  const onChange = vi.fn()
  const connect = vi.fn(() => picker)
  renderWithProviders(<Editor onChange={onChange} />, {
    session,
    drivePicker: picker ? (connect as () => DrivePicker) : null
  })
  return { onChange, connect }
}

const fakePicker = (pick: DrivePicker['pick']): DrivePicker => ({
  pick: vi.fn(pick),
  stop: vi.fn()
})

describe('the Drive button', () => {
  it('is not offered when the picker is turned off', async () => {
    renderEditor(null)

    await screen.findByRole('textbox', { name: 'Description' })
    expect(screen.queryByRole('button', { name: DRIVE })).toBeNull()
  })

  it('is not offered when the SSO gave no id token', async () => {
    renderEditor(
      fakePicker(() => Promise.resolve([])),
      fakeSession()
    )

    await screen.findByRole('textbox', { name: 'Description' })
    expect(screen.queryByRole('button', { name: DRIVE })).toBeNull()
  })

  it('opens the picker on the platform with the id token, and inserts the links picked', async () => {
    const picker = fakePicker(() =>
      Promise.resolve([{ name: 'Plan.pdf', url: 'https://d/public/1' }])
    )
    const { onChange, connect } = renderEditor(picker)

    await screen.findByRole('textbox', { name: 'Description' })
    fireEvent.click(screen.getByRole('button', { name: DRIVE }))

    expect(
      await screen.findByRole('link', { name: 'Plan.pdf' })
    ).toHaveAttribute('href', 'https://d/public/1')
    expect(onChange).toHaveBeenLastCalledWith(
      expect.stringContaining('[Plan.pdf](https://d/public/1)')
    )
    expect(connect).toHaveBeenCalledWith(expect.anything(), 'id-token')
    expect(picker.pick).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ linkLabel: 'Insert links', theme: 'light' })
    )
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('names the frame of the picker', async () => {
    renderEditor(
      fakePicker(container => {
        container.append(document.createElement('iframe'))
        return new Promise(() => undefined)
      })
    )

    await screen.findByRole('textbox', { name: 'Description' })
    fireEvent.click(screen.getByRole('button', { name: DRIVE }))

    await waitFor(() => {
      expect(
        screen.getByTestId('intent-container').querySelector('iframe')
      ).toHaveAttribute('title', 'Twake Drive')
    })
  })

  it('tells the user when Drive cannot be opened, and closes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { onChange } = renderEditor(
      fakePicker(() => Promise.reject(new Error('token_exchange failed: 403')))
    )

    await screen.findByRole('textbox', { name: 'Description' })
    fireEvent.click(screen.getByRole('button', { name: DRIVE }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Twake Drive could not be opened'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(onChange).not.toHaveBeenCalled()
  })
})
