import { onlineManager } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AppProviders } from '@/app/AppProviders'
import { makeQueryClient } from '@/app/queryClient'

const MESSAGE =
  'You are offline. Keep this page open: your changes will be sent when the connection is back.'

function setUp() {
  render(
    <AppProviders lang="en" queryClient={makeQueryClient()}>
      <p>App</p>
    </AppProviders>
  )
}

afterEach(() => {
  onlineManager.setOnline(true)
})

describe('the connection', () => {
  it('says nothing while online', () => {
    setUp()

    expect(screen.queryByText(MESSAGE)).toBeNull()
  })

  it('says the app is offline until the connection is back', async () => {
    setUp()

    act(() => {
      onlineManager.setOnline(false)
    })
    expect(await screen.findByText(MESSAGE)).toBeInTheDocument()

    act(() => {
      onlineManager.setOnline(true)
    })
    await waitFor(() => {
      expect(screen.queryByText(MESSAGE)).toBeNull()
    })
  })
})
