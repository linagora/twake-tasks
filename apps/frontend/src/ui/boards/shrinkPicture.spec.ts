import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_PICTURE_BYTES, shrinkPicture } from '@/ui/boards/shrinkPicture'

const encoded: { width: number; height: number; quality: number }[] = []

// Bytes per pixel at full quality, which sets how detailed the photo is.
function picturesOf(detail: number, width: number, height: number) {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(() => Promise.resolve({ width, height, close: vi.fn() }))
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    _type?: string,
    quality = 1
  ) {
    encoded.push({ width: this.width, height: this.height, quality })
    const size = Math.round(this.width * this.height * detail * quality)
    callback(new Blob([new Uint8Array(size)], { type: 'image/jpeg' }))
  })
}

beforeEach(() => {
  encoded.length = 0
  const context: Partial<CanvasRenderingContext2D> = {
    fillRect: vi.fn(),
    drawImage: vi.fn()
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as CanvasRenderingContext2D
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('shrinkPicture', () => {
  it('keeps a light picture at its size', async () => {
    picturesOf(0.05, 1200, 800)

    const shrunk = await shrinkPicture(new Blob())

    expect(shrunk.size).toBeLessThanOrEqual(MAX_PICTURE_BYTES)
    expect(encoded).toHaveLength(1)
    expect(encoded[0]).toMatchObject({ width: 1200, height: 800 })
  })

  it('brings a detailed photo under the cap rather than refusing it', async () => {
    picturesOf(0.3, 4000, 3000)

    const shrunk = await shrinkPicture(new Blob())

    expect(shrunk.size).toBeLessThanOrEqual(MAX_PICTURE_BYTES)
    const last = encoded.at(-1)
    expect(last?.height).toBeLessThan(1600)
  })
})
