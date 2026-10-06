import { cleanup, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { fakeReporting } from '@/testing/fakeReporting'
import { renderRoute } from '@/testing/renderWithProviders'

describe('AppFeedback', () => {
  it('shows the button in the shell, attached with the labels of the language', async () => {
    const reporting = fakeReporting()
    renderRoute('/', { reporting, lang: 'fr', boardsApi: fakeBoardsApi() })

    expect(
      await screen.findByTestId('twake-feedback-button')
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(reporting.attach).toHaveBeenLastCalledWith(
        screen.getByTestId('twake-feedback-button'),
        expect.objectContaining<Record<string, string>>({
          formTitle: 'Donner un avis'
        })
      )
    })
  })

  it('does not attach again when the page changes', async () => {
    const reporting = fakeReporting()
    const { router } = renderRoute('/', { reporting })
    await screen.findByTestId('twake-feedback-button')
    await waitFor(() => {
      expect(reporting.attach).toHaveBeenCalled()
    })
    const attaches = reporting.attach.mock.calls.length

    await router.navigate('/today')
    await screen.findByRole('heading', { name: 'Today' })

    expect(reporting.attach).toHaveBeenCalledTimes(attaches)
  })

  it('detaches the form when the shell goes away', async () => {
    const reporting = fakeReporting()
    renderRoute('/', { reporting })
    await screen.findByTestId('twake-feedback-button')
    await waitFor(() => {
      expect(reporting.attach).toHaveBeenCalled()
    })

    cleanup()

    // StrictMode attaches twice: every attach has been detached.
    expect(reporting.detach).toHaveBeenCalledTimes(
      reporting.attach.mock.calls.length
    )
  })

  it('gives the color scheme of the app to the form', async () => {
    const reporting = fakeReporting()
    renderRoute('/', { reporting })
    await screen.findByTestId('twake-feedback-button')

    expect(reporting.setColorScheme).toHaveBeenCalledWith(
      expect.stringMatching(/^(light|dark|system)$/)
    )
  })

  it('shows no button when feedback is off', async () => {
    const reporting = fakeReporting({ feedback: false })
    renderRoute('/', { reporting })
    await screen.findByRole('banner')

    expect(screen.queryByTestId('twake-feedback-button')).toBeNull()
    expect(reporting.attach).not.toHaveBeenCalled()
  })

  it.each(['/embed/projects/board-1', '/embed/projects/board-1/boards/b1'])(
    'never shows the button on the embedded view %s',
    async path => {
      const reporting = fakeReporting()
      renderRoute(path, { reporting })
      await screen.findByRole('main')

      expect(screen.queryByTestId('twake-feedback-button')).toBeNull()
      expect(reporting.attach).not.toHaveBeenCalled()
    }
  )
})
