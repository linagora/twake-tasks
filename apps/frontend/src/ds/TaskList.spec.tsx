import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TaskRow } from '@/ds/TaskList'
import { renderWithProviders } from '@/testing/renderWithProviders'

describe('TaskRow', () => {
  it('keeps a fact with a tooltip above the row link', async () => {
    renderWithProviders(
      <ul>
        <TaskRow
          label="DES-1 Logo"
          title={<a href="/boards/b?task=DES-1">Logo</a>}
          context="DES-1 · Design"
          facts={<time title="Oct 24, 2026, 19:21">16 min ago</time>}
        />
      </ul>
    )

    const time = await screen.findByTitle('Oct 24, 2026, 19:21')
    expect(getComputedStyle(time).position).toBe('relative')
    expect(getComputedStyle(time).zIndex).toBe('1')
  })
})
