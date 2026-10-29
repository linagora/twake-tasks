import { Button, MenuItem, MenuList, useTheme } from '@linagora/twake-mui'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
  const [r = 0, g = 0, b = 0, a = 1] = text.startsWith('#')
    ? hex(text)
    : (text.match(/[\d.]+/g) ?? []).map(Number)
  const over = [r, g, b].map(
    (value, at) => a * value + (1 - a) * (under[at] ?? 0)
  )
  const [light, dark] = [luminance(under), luminance(over)].sort(
    (x, y) => y - x
  )
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}

function Palette(): ReactElement {
  const { palette } = useTheme()
  return (
    <ul>
      <li>{palette.text.secondary}</li>
      <li>{palette.background.default}</li>
      <li>{palette.text.primary}</li>
      <li>{palette.primary.main}</li>
      <li>{palette.error.main}</li>
      <li>{palette.success.main}</li>
      <li>{palette.divider}</li>
    </ul>
  )
}

const shownPalette = () =>
  screen.getAllByRole('listitem').map(item => item.textContent)

function systemAsks(query: string): void {
  vi.stubGlobal('matchMedia', (media: string) => ({
    media,
    matches: media === query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    // MUI's colour scheme still listens the old way
    addListener: () => undefined,
    removeListener: () => undefined
  }))
}

describe('AppProviders in high contrast', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each(['(prefers-contrast: more)', '(forced-colors: active)'])(
    'turns on when the system asks for it with %s and nothing was chosen',
    query => {
      systemAsks(query)
      renderInApp(<Palette />)

      expect(shownPalette()[0]).toBe('#3D3D42')
      expect(document.documentElement).toHaveAttribute('data-contrast', 'high')
    }
  )

  it('follows the system when its setting changes', () => {
    const changes: (() => void)[] = []
    const query = {
      matches: false,
      addEventListener: (_type: string, listener: () => void) => {
        changes.push(listener)
      },
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined
    }
    vi.stubGlobal('matchMedia', () => query)
    renderInApp(<Palette />)
    expect(document.documentElement).not.toHaveAttribute('data-contrast')

    query.matches = true
    act(() => {
      changes.forEach(change => {
        change()
      })
    })

    expect(document.documentElement).toHaveAttribute('data-contrast', 'high')
  })

  it('stays off when standard was chosen on this device', () => {
    systemAsks('(prefers-contrast: more)')
    localStorage.setItem('twake-tasks:contrast', 'standard')
    renderInApp(<Palette />)

    expect(shownPalette()[0]).toBe('rgba(66, 66, 68, 0.75)')
    expect(document.documentElement).not.toHaveAttribute('data-contrast')
  })

  it('draws text at 4.5:1 and borders at 3:1 on a card and on the grey columns', () => {
    localStorage.setItem('twake-tasks:contrast', 'high')
    renderInApp(<Palette />)
    const [secondary = '', page = '', ...texts] = shownPalette()
    const border = texts.pop() ?? ''

    for (const ground of ['#FFFFFF', page]) {
      for (const text of [secondary, ...texts]) {
        expect(contrastOn(ground, text)).toBeGreaterThanOrEqual(4.5)
      }
      expect(contrastOn(ground, border)).toBeGreaterThanOrEqual(3)
    }
  })

  it('rings a focused button 3px wide in the text colour, with no ripple', async () => {
    localStorage.setItem('twake-tasks:contrast', 'high')
    renderInApp(<Button>Create task</Button>)
    const button = screen.getByRole('button', { name: 'Create task' })

    fireEvent.keyDown(document.body, { key: 'Tab' })
    button.focus()

    await waitFor(() => {
      expect(button).toHaveClass('Mui-focusVisible')
    })
    const style = getComputedStyle(button)
    expect(style.outlineWidth).toBe('3px')
    expect(style.outlineColor).toBe('var(--twake-palette-text-primary)')
    expect(button.querySelector('.MuiTouchRipple-root')).toBe(null)
  })
})

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
