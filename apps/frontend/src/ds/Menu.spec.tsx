import { MenuItem } from '@linagora/twake-mui'
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Menu } from '@/ds/Menu'
import { phoneScreen } from '@/testing/phoneScreen'
import { renderWithProviders } from '@/testing/renderWithProviders'

function paperOf(menu: HTMLElement): HTMLElement {
  const paper = menu.closest<HTMLElement>('.MuiPaper-root')
  if (!paper) throw new Error('No paper around the menu')
  return paper
}

function renderMenu(): void {
  const anchor = document.createElement('button')
  document.body.append(anchor)
  renderWithProviders(
    <Menu anchorEl={anchor} open slotProps={{ list: { 'aria-label': 'Do' } }}>
      <MenuItem>Rename</MenuItem>
    </Menu>
  )
}

describe('Menu', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens beside its anchor on a wide screen', async () => {
    renderMenu()

    const menu = await screen.findByRole('menu', { name: 'Do' })
    expect(paperOf(menu).style.top).not.toBe('')
  })

  it('rises from the bottom of a phone screen instead', async () => {
    phoneScreen()
    renderMenu()

    const menu = await screen.findByRole('menu', { name: 'Do' })
    expect(paperOf(menu).style.top).toBe('')
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeVisible()
  })
})
