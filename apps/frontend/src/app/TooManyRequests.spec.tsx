import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '@/app/AppProviders'
import { makeQueryClient } from '@/app/queryClient'
import { ApiError } from '@/application/boards'

const MESSAGE = 'Too many requests. Wait a moment, then try again.'

function setUp() {
  const queryClient = makeQueryClient()
  render(
    <AppProviders lang="en" queryClient={queryClient}>
      <p>App</p>
    </AppProviders>
  )
  const refuse = (status: number) => () =>
    Promise.reject(new ApiError(status, null))
  return {
    query: (key: string, status = 429) =>
      queryClient
        .query({ queryKey: [key], queryFn: refuse(status) })
        .catch(() => undefined),
    mutate: (status = 429) =>
      queryClient
        .getMutationCache()
        .build(queryClient, { mutationFn: refuse(status) })
        .execute(undefined)
        .catch(() => undefined)
  }
}

describe('a request refused for too many requests', () => {
  it('says so once, however many are refused together', async () => {
    const { query, mutate } = setUp()

    await Promise.all([query('a'), query('b'), mutate(), mutate()])

    expect(await screen.findAllByText(MESSAGE)).toHaveLength(1)
  })

  it('says nothing of other refusals', async () => {
    const { query, mutate } = setUp()

    await Promise.all([query('a', 403), mutate(409)])

    expect(screen.queryByText(MESSAGE)).toBeNull()
  })
})
