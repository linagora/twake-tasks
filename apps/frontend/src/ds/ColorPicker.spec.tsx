import { COLORS } from '@linagora/twake-mui'
import { fireEvent, screen, within } from '@testing-library/react'
import { useState, type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { ColorField, leastUsedColor, swatchName } from '@/ds/ColorPicker'
import { renderWithProviders } from '@/testing/renderWithProviders'

const [first = '', second = '', third = ''] = COLORS

describe('leastUsedColor', () => {
  it('starts with the first swatch', () => {
    expect(leastUsedColor([])).toBe(first)
    expect(leastUsedColor([null, '#123456'])).toBe(first)
  })

  it('skips the swatches already used, whatever their case', () => {
    expect(leastUsedColor([first.toLowerCase()])).toBe(second)
    expect(leastUsedColor([first, second])).toBe(third)
  })

  it('takes the least used once every swatch is', () => {
    expect(leastUsedColor([...COLORS, ...COLORS, first])).toBe(second)
  })
})

describe('swatchName', () => {
  it('names every swatch, whatever its case', () => {
    expect(COLORS.map(swatchName)).not.toContain(undefined)
    expect(swatchName('#2d83ff')).toBe('blue')
  })

  it('names no other color', () => {
    expect(swatchName('#123456')).toBeUndefined()
  })
})

// Hidden from screen readers while the popover is open, as a modal's back.
const picked = () =>
  screen.getByRole('status', { name: 'Picked', hidden: true })

const nameOf = (color: string) => swatchName(color) ?? `custom ${color}`

function Field({ initial }: { initial: string | null }): ReactElement {
  const [color, setColor] = useState(initial)
  return (
    <>
      <ColorField
        label="Choose the color"
        buttonLabel={
          color ? `Choose the color, ${nameOf(color)}` : 'Choose the color'
        }
        customLabel="Custom color"
        cancelLabel="Cancel"
        saveLabel="Save"
        colorName={nameOf}
        value={color}
        onChange={setColor}
      />
      <output aria-label="Picked">{color}</output>
    </>
  )
}

async function openSwatches(name: string) {
  fireEvent.click(await screen.findByRole('button', { name }))
  return within(screen.getByRole('dialog', { name: 'Choose the color' }))
}

async function openCustom() {
  fireEvent.click(
    (await openSwatches('Choose the color')).getByRole('button', {
      name: 'Custom color'
    })
  )
  return within(screen.getByRole('dialog', { name: 'Custom color' }))
}

describe('ColorField', () => {
  it('names the chosen color on the square', async () => {
    renderWithProviders(<Field initial="#abcdef" />)

    expect(
      await screen.findByRole('button', {
        name: 'Choose the color, custom #abcdef'
      })
    ).toHaveAttribute('aria-haspopup', 'dialog')
  })

  it('lists the swatches as named radios, the chosen one checked', async () => {
    renderWithProviders(<Field initial={second.toLowerCase()} />)

    const colors = await openSwatches('Choose the color, violet')
    const group = colors.getByRole('radiogroup', { name: 'Choose the color' })
    const swatches = within(group).getAllByRole('radio')

    expect(swatches.map(swatch => swatch.getAttribute('aria-label'))).toEqual(
      COLORS.map(swatchName)
    )
    expect(
      within(group).getByRole('radio', { checked: true })
    ).toHaveAccessibleName('violet')
    expect(swatches.filter(swatch => swatch.tabIndex === 0)).toEqual([
      swatches[1]
    ])
    expect(swatches[1]).toHaveFocus()
    expect(within(group).queryByRole('button')).toBeNull()
    expect(colors.getByRole('button', { name: 'Custom color' })).toBeVisible()
  })

  it('makes the first swatch the tab stop when none is chosen', async () => {
    renderWithProviders(<Field initial="#123456" />)

    const colors = await openSwatches('Choose the color, custom #123456')

    expect(colors.queryByRole('radio', { checked: true })).toBeNull()
    expect(colors.getByRole('radio', { name: 'navy' })).toHaveFocus()
  })

  it('picks a swatch and closes', async () => {
    renderWithProviders(<Field initial={first} />)

    fireEvent.click(
      (await openSwatches('Choose the color, navy')).getByRole('radio', {
        name: 'violet'
      })
    )

    expect(picked()).toHaveTextContent(second)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('moves the choice with the arrows and closes on Enter', async () => {
    renderWithProviders(<Field initial={first} />)
    const colors = await openSwatches('Choose the color, navy')
    const navy = colors.getByRole('radio', { name: 'navy' })

    fireEvent.keyDown(navy, { key: 'ArrowRight' })
    expect(colors.getByRole('radio', { name: 'violet' })).toHaveFocus()
    expect(colors.getByRole('radio', { name: 'violet' })).toBeChecked()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(colors.getByRole('radio', { name: 'violet' }), {
      key: 'ArrowDown'
    })
    expect(colors.getByRole('radio', { name: 'lavender' })).toBeChecked()

    fireEvent.keyDown(colors.getByRole('radio', { name: 'lavender' }), {
      key: 'ArrowUp'
    })
    expect(colors.getByRole('radio', { name: 'violet' })).toBeChecked()

    fireEvent.keyDown(colors.getByRole('radio', { name: 'violet' }), {
      key: 'Enter'
    })
    expect(picked()).toHaveTextContent(second)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('goes to the ends with Home and End, and wraps around', async () => {
    renderWithProviders(<Field initial={second} />)
    const colors = await openSwatches('Choose the color, violet')

    fireEvent.keyDown(colors.getByRole('radio', { name: 'violet' }), {
      key: 'End'
    })
    expect(colors.getByRole('radio', { name: 'grey' })).toHaveFocus()
    expect(colors.getByRole('radio', { name: 'grey' })).toBeChecked()

    fireEvent.keyDown(colors.getByRole('radio', { name: 'grey' }), {
      key: 'ArrowRight'
    })
    expect(colors.getByRole('radio', { name: 'navy' })).toBeChecked()

    fireEvent.keyDown(colors.getByRole('radio', { name: 'navy' }), {
      key: 'ArrowLeft'
    })
    expect(colors.getByRole('radio', { name: 'grey' })).toBeChecked()

    fireEvent.keyDown(colors.getByRole('radio', { name: 'grey' }), {
      key: 'Home'
    })
    expect(colors.getByRole('radio', { name: 'navy' })).toHaveFocus()
    expect(picked()).toHaveTextContent(first)
  })

  it('picks any color by its hex code, from the palette after the swatches', async () => {
    renderWithProviders(<Field initial={null} />)

    const custom = await openCustom()
    fireEvent.change(custom.getByRole('textbox', { name: 'Hex' }), {
      target: { value: 'abcdef' }
    })
    fireEvent.click(custom.getByRole('button', { name: 'Save' }))

    expect(picked()).toHaveTextContent('#ABCDEF')
  })

  it('saves no shorthand hex code', async () => {
    renderWithProviders(<Field initial={null} />)

    const custom = await openCustom()
    fireEvent.change(custom.getByRole('textbox', { name: 'Hex' }), {
      target: { value: 'abc' }
    })

    expect(custom.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('saves only the six digits the hex field shows', async () => {
    renderWithProviders(<Field initial={null} />)

    const custom = await openCustom()
    const hex = custom.getByRole('textbox', { name: 'Hex' })
    const save = custom.getByRole('button', { name: 'Save' })

    fireEvent.change(hex, { target: { value: '12ab34' } })
    expect(save).toBeEnabled()
    for (const partial of ['12ab', '', '12ab3', 'zzzzzz']) {
      fireEvent.change(hex, { target: { value: partial } })
      expect(save).toBeDisabled()
    }
    fireEvent.change(hex, { target: { value: '#56cd78' } })
    expect(hex).toHaveValue('#56cd78')
    fireEvent.click(save)

    expect(picked()).toHaveTextContent('#56CD78')
  })

  it('goes back to the swatches when the custom color is cancelled', async () => {
    renderWithProviders(<Field initial={first} />)

    fireEvent.click(
      (await openSwatches('Choose the color, navy')).getByRole('button', {
        name: 'Custom color'
      })
    )
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Custom color' })).getByRole(
        'button',
        { name: 'Cancel' }
      )
    )

    expect(
      screen.getByRole('dialog', { name: 'Choose the color' })
    ).toBeVisible()
    expect(picked()).toHaveTextContent(first)
  })
})
