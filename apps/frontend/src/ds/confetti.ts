const COLORS = [
  '#297EF2',
  '#F52D2D',
  '#FFC107',
  '#2EB872',
  '#9C27B0',
  '#FF9800'
]
const PIECES = 150
const DURATION = 3000

function aPiece(width: number, height: number) {
  return {
    x: Math.random() * width,
    y: -Math.random() * height * 0.5,
    size: 6 + Math.random() * 6,
    color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? '#297EF2',
    speed: 2 + Math.random() * 3,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: 0.05 + Math.random() * 0.1,
    tilt: Math.random() * Math.PI,
    tiltSpeed: 0.05 + Math.random() * 0.15
  }
}

export function throwConfetti(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return
  const width = window.innerWidth
  const height = window.innerHeight
  canvas.width = width
  canvas.height = height
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '2147483647'
  })
  document.body.append(canvas)

  const pieces = Array.from({ length: PIECES }, () => aPiece(width, height))
  const start = performance.now()
  const frame = (now: number) => {
    // New pieces stop falling in after the duration; the others land.
    const raining = now - start < DURATION
    context.clearRect(0, 0, width, height)
    let falling = false
    for (const piece of pieces) {
      piece.wobble += piece.wobbleSpeed
      piece.tilt += piece.tiltSpeed
      piece.y += piece.speed
      piece.x += Math.sin(piece.wobble)
      if (piece.y > height && raining) Object.assign(piece, aPiece(width, 0))
      if (piece.y <= height) falling = true
      context.save()
      context.translate(piece.x, piece.y)
      context.rotate(piece.tilt)
      context.fillStyle = piece.color
      context.fillRect(
        -piece.size / 2,
        -piece.size / 4,
        piece.size,
        piece.size / 2
      )
      context.restore()
    }
    if (falling) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}
