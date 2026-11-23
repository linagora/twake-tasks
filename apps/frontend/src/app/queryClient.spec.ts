import { describe, expect, it } from 'vitest'

import { shouldRetryQuery } from '@/app/queryClient'
import { ApiError } from '@/application/boards'

describe('shouldRetryQuery', () => {
  it.each([400, 401, 403, 404])('never retries a %i', status => {
    expect(shouldRetryQuery(0, { status })).toBe(false)
  })

  it('retries a server or network error twice', () => {
    expect(shouldRetryQuery(0, { status: 503 })).toBe(true)
    expect(shouldRetryQuery(1, new TypeError('Failed to fetch'))).toBe(true)
    expect(shouldRetryQuery(2, { status: 503 })).toBe(false)
  })

  it('shows a read that timed out at once, rather than waiting out the deadline again', () => {
    expect(shouldRetryQuery(0, new ApiError(504, 'timeout'))).toBe(false)
  })
})
