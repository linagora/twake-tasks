import { Button, MenuItem, MenuList, useTheme } from '@linagora/twake-mui'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '@/app/AppProviders'
import { makeQueryClient } from '@/app/queryClient'

const renderInApp = (ui: ReactElement) =>
  render(
    <AppProviders lang="en" queryClient={makeQueryClient()}>
      {ui}
    </AppProviders>
  )

const luminance = (rgb: number[]) => {
  const [r = 0, g = 0, b = 0] = rgb.map(value => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const hex = (color: string) =>
  [1, 3, 5].map(at => parseInt(color.slice(at, at + 2), 16))

// The text colour has an alpha: blended over the background first.
function contrastOn(background: string, text: string): number {
  const under = hex(background)
  const [r = 0, g = 0, b = 0, a = 1] = (text.match(/[\d.]+/g) ?? []).map(Number)
  const over = [r, g, b].map(
    (value, at) => a * value + (1 - a) * (under[at] ?? 0)
  )
  return (luminance(under) + 0.05) / (luminance(over) + 0.05)
}

function Palette(): ReactElement {
  const { palette } = useTheme()
  return (
    <ul>
      <li>{palette.text.secondary}</li>
      <li>{palette.background.default}</li>
    </ul>
  )
}

describe('AppProviders', () => {
  it('draws secondary text at 4.5:1 on a card and on the grey columns', () => {
    renderInApp(<Palette />)
    const [secondary = '', page = ''] = screen
      .getAllByRole('listitem')
      .map(item => item.textContent)

    expect(contrastOn('#FFFFFF', secondary)).toBeGreaterThanOrEqual(4.5)
    expect(contrastOn(page, secondary)).toBeGreaterThanOrEqual(4.5)
  })

  it('rings a button focused from the keyboard, with no focus ripple', async () => {
    renderInApp(<Button>Create task</Button>)
    const button = screen.getByRole('button', { name: 'Create task' })

    fireEvent.keyDown(document.body, { key: 'Tab' })
    button.focus()

    await waitFor(() => {
      expect(button).toHaveClass('Mui-focusVisible')
    })
    expect(getComputedStyle(button).outline).toMatch(/^2px solid/)
    await act(() => Promise.resolve())
    expect(button.querySelector('.MuiTouchRipple-ripplePulsate')).toBe(null)
  })

  it("rings a menu item inside its box, keeping twake-mui's own look", async () => {
    renderInApp(
      <MenuList>
        <MenuItem>Rename</MenuItem>
      </MenuList>
    )
    const item = screen.getByRole('menuitem', { name: 'Rename' })

    fireEvent.keyDown(document.body, { key: 'Tab' })
    act(() => {
      item.focus()
    })

    await waitFor(() => {
      expect(item).toHaveClass('Mui-focusVisible')
    })
    const style = getComputedStyle(item)
    expect(style.outline).toMatch(/^2px solid/)
    expect(style.outlineOffset).toBe('-2px')
    expect(style.paddingTop).toBe('4px')
  })
})
