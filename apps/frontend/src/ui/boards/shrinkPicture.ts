// A wide screen's worth: the board draws its picture to cover the page.
const MAX_WIDTH = 2560
const MAX_HEIGHT = 1600

// The backend refuses larger covers.
export const MAX_PICTURE_BYTES = 500 * 1024

function encode(
  bitmap: ImageBitmap,
  scale: number,
  quality: number
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('no 2d context')
  // A transparent picture shows on white, as the board would.
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) resolve(blob)
        else reject(new Error('the picture could not be encoded'))
      },
      'image/jpeg',
      quality
    )
  })
}

/**
 * The picture as a JPEG no larger than a screen, made smaller until it fits
 * under the backend's cap, so that a detailed photo is not refused.
 */
export async function shrinkPicture(picture: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(picture)
  try {
    let scale = Math.min(
      1,
      MAX_WIDTH / bitmap.width,
      MAX_HEIGHT / bitmap.height
    )
    for (;;) {
      let size = 0
      for (const quality of [0.85, 0.7]) {
        const blob = await encode(bitmap, scale, quality)
        if (blob.size <= MAX_PICTURE_BYTES) return blob
        size = blob.size
      }
      // A JPEG's size goes about with its area.
      scale *= Math.min(0.9, Math.sqrt(MAX_PICTURE_BYTES / size))
    }
  } finally {
    bitmap.close()
  }
}
