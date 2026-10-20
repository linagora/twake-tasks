import { COLORS } from '@linagora/twake-mui'
import { fireEvent, screen, within } from '@testing-library/react'
import { useState, type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { ColorField, leastUsedColor } from '@/ds/ColorPicker'
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

// Hidden from screen readers while the popover is open, as a modal's back.
const picked = () =>
  screen.getByRole('status', { name: 'Picked', hidden: true })

function Field({ initial }: { initial: string | null }): ReactElement {
  const [color, setColor] = useState(initial)
  return (
    <>
      <ColorField
        label="Choose the color"
        customLabel="Custom color"
        cancelLabel="Cancel"
        saveLabel="Save"
        value={color}
        onChange={setColor}
      />
      <output aria-label="Picked">{color}</output>
    </>
  )
}

describe('ColorField', () => {
  it('picks a swatch and closes', async () => {
    renderWithProviders(<Field initial={first} />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Choose the color' })
    )
    const swatches = within(
      screen.getByRole('dialog', { name: 'Choose the color' })
    ).getAllByRole('button')
    const swatch = swatches[1]
    if (!swatch) throw new Error('No second swatch')
    fireEvent.click(swatch)

    expect(picked()).toHaveTextContent(second)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('picks any color by its hex code, from the palette after the swatches', async () => {
    renderWithProviders(<Field initial={null} />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Choose the color' })
    )
    const swatches = within(
      screen.getByRole('dialog', { name: 'Choose the color' })
    ).getAllByRole('button')
    expect(swatches).toHaveLength(COLORS.length + 1)
    const palette = swatches.at(-1)
    if (!palette) throw new Error('No palette')
    fireEvent.click(palette)
    const custom = within(screen.getByRole('dialog', { name: 'Custom color' }))
    fireEvent.change(custom.getByRole('textbox', { name: 'Hex' }), {
      target: { value: 'abcdef' }
    })
    fireEvent.click(custom.getByRole('button', { name: 'Save' }))

    expect(picked()).toHaveTextContent('#ABCDEF')
  })

  it('goes back to the swatches when the custom color is cancelled', async () => {
    renderWithProviders(<Field initial={first} />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Choose the color' })
    )
    const palette = within(
      screen.getByRole('dialog', { name: 'Choose the color' })
    )
      .getAllByRole('button')
      .at(-1)
    if (!palette) throw new Error('No palette')
    fireEvent.click(palette)
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
