// A wide screen's worth: the board draws its picture to cover the page.
const MAX_WIDTH = 2560
const MAX_HEIGHT = 1600

/** The picture as a JPEG no larger than a screen, light enough to send. */
export async function shrinkPicture(picture: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(picture)
  const scale = Math.min(
    1,
    MAX_WIDTH / bitmap.width,
    MAX_HEIGHT / bitmap.height
  )
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('no 2d context')
  // A transparent picture shows on white, as the board would.
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) resolve(blob)
        else reject(new Error('the picture could not be encoded'))
      },
      'image/jpeg',
      0.85
    )
  })
}
