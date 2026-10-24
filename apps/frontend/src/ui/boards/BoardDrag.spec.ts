import type { ClientRect } from '@dnd-kit/core'
import { describe, expect, it } from 'vitest'

import { atPointer } from '@/ui/boards/BoardDrag'

const rect = (left: number, width: number): ClientRect => ({
  left,
  top: 100,
  width,
  height: 32,
  right: left + width,
  bottom: 132
})

const move = (pointerX: number, previewWidth: number, windowWidth: number) => {
  const preview = rect(16, previewWidth)
  const transform = atPointer({
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
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1 }
  })
  return preview.left + transform.x
}

describe('atPointer', () => {
  it('puts the preview just right of the pointer', () => {
    expect(move(100, 200, 390)).toBe(108)
  })

  it('keeps the preview inside the window near its right edge', () => {
    expect(move(300, 200, 390)).toBe(182)
  })
})
