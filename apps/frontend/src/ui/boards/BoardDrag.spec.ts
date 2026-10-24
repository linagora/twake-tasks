import type { ClientRect, Modifier } from '@dnd-kit/core'
import { describe, expect, it } from 'vitest'

import { atPointer, inWindow } from '@/ui/boards/BoardDrag'

const rect = (left: number, width: number): ClientRect => ({
  left,
  top: 100,
  width,
  height: 32,
  right: left + width,
  bottom: 132
})

const drag = (
  modifier: Modifier,
  {
    pointerX,
    previewLeft = 16,
    previewWidth,
    windowWidth,
    movedX = 0
  }: {
    pointerX: number
    previewLeft?: number
    previewWidth: number
    windowWidth: number
    movedX?: number
  }
) => {
  const preview = rect(previewLeft, previewWidth)
  const transform = modifier({
    activatorEvent: new MouseEvent('mousedown', {
      clientX: pointerX,
      clientY: 110
    }),
    active: null,
    activeNodeRect: null,
    containerNodeRect: null,
    draggingNodeRect: preview,
    over: null,
    overlayNodeRect: preview,
    scrollableAncestors: [],
    scrollableAncestorRects: [],
    windowRect: rect(0, windowWidth),
    transform: { x: movedX, y: 0, scaleX: 1, scaleY: 1 }
  })
  return preview.left + transform.x
}

describe('atPointer', () => {
  const move = (pointerX: number, previewWidth: number, windowWidth: number) =>
    drag(atPointer, { pointerX, previewWidth, windowWidth })

  it('puts the preview just right of the pointer', () => {
    expect(move(100, 200, 390)).toBe(108)
  })

  it('keeps the preview inside the window near its right edge', () => {
    expect(move(300, 200, 390)).toBe(182)
  })
})

describe('inWindow', () => {
  const card = { pointerX: 1000, previewLeft: 940, previewWidth: 264 }

  it('keeps the card where it was grabbed', () => {
    expect(drag(inWindow, { ...card, windowWidth: 1440, movedX: 100 })).toBe(
      1040
    )
  })

  it('keeps the card inside the window near its right edge', () => {
    expect(drag(inWindow, { ...card, windowWidth: 1440, movedX: 430 })).toBe(
      1176
    )
  })

  it('keeps the card inside the window near its left edge', () => {
    expect(drag(inWindow, { ...card, windowWidth: 1440, movedX: -1000 })).toBe(
      0
    )
  })

  it('does not move a card grabbed past the right edge of the window', () => {
    expect(drag(inWindow, { ...card, windowWidth: 1100 })).toBe(940)
  })

  it('does not move a card grabbed past the left edge of the window', () => {
    expect(
      drag(inWindow, { ...card, previewLeft: -40, windowWidth: 1440 })
    ).toBe(-40)
  })
})
