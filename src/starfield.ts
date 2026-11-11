interface Star {
  x: number
  y: number
  radius: number
  alpha: number
  speed: number
  phase: number
  depth: number
  color: string
}

interface Meteor {
  x: number
  y: number
  directionX: number
  directionY: number
  speed: number
  length: number
  bornAt: number
  lifetime: number
}

const STAR_COLORS = ['#ffffff', '#ffffff', '#cdd6ff', '#c4b5fd', '#ffe9c9']
const AREA_PER_STAR = 5200
const MAX_STARS = 320
const MAX_PIXEL_RATIO = 2
const DRIFT_SPEED = 0.002
const PARALLAX_RANGE = 28
const METEOR_ANGLE = Math.PI * 0.82
const TAU = Math.PI * 2

export function startStarfield(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d')
  if (!context) return

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  let stars: Star[] = []
  let meteor: Meteor | null = null
  let nextMeteorAt = performance.now() + 2500
  let width = 0
  let height = 0
  let pointerX = 0
  let pointerY = 0
  let offsetX = 0
  let offsetY = 0
  let frame = 0

  const draw = (time: number) => {
    context.clearRect(0, 0, width, height)
    offsetX += (pointerX - offsetX) * 0.04
    offsetY += (pointerY - offsetY) * 0.04
    for (const star of stars) {
      const twinkle = 0.6 + 0.4 * Math.sin(time * star.speed + star.phase)
      context.globalAlpha = star.alpha * twinkle
      context.fillStyle = star.color
      context.beginPath()
      context.arc(
        wrap(star.x + (offsetX + time * DRIFT_SPEED) * star.depth, width),
        wrap(star.y + offsetY * star.depth, height),
        star.radius,
        0,
        TAU,
      )
      context.fill()
    }
    context.globalAlpha = 1
  }

  const drawMeteor = (time: number) => {
    if (!meteor && time >= nextMeteorAt) meteor = createMeteor(width, height, time)
    if (!meteor) return
    const elapsed = time - meteor.bornAt
    if (elapsed >= meteor.lifetime) {
      meteor = null
      nextMeteorAt = time + 5000 + Math.random() * 9000
      return
    }
    const travelled = (meteor.speed * elapsed) / 1000
    const headX = meteor.x + meteor.directionX * travelled
    const headY = meteor.y + meteor.directionY * travelled
    const tailX = headX - meteor.directionX * meteor.length
    const tailY = headY - meteor.directionY * meteor.length
    const gradient = context.createLinearGradient(tailX, tailY, headX, headY)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0)')
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.9)')
    context.globalAlpha = Math.sin((Math.PI * elapsed) / meteor.lifetime)
    context.strokeStyle = gradient
    context.lineWidth = 1.6
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(tailX, tailY)
    context.lineTo(headX, headY)
    context.stroke()
    context.globalAlpha = 1
  }

  const tick = (time: number) => {
    draw(time)
    drawMeteor(time)
    frame = requestAnimationFrame(tick)
  }

  const start = () => {
    cancelAnimationFrame(frame)
    if (reducedMotion.matches || document.hidden) draw(0)
    else frame = requestAnimationFrame(tick)
  }

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
    width = window.innerWidth
    height = window.innerHeight
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    stars = createStars(width, height)
    start()
  }

  window.addEventListener('resize', resize)
  window.addEventListener('pointermove', (event) => {
    pointerX = (0.5 - event.clientX / width) * PARALLAX_RANGE
    pointerY = (0.5 - event.clientY / height) * PARALLAX_RANGE
  })
  document.addEventListener('visibilitychange', start)
  reducedMotion.addEventListener('change', start)
  resize()
}

function createStars(width: number, height: number): Star[] {
  const count = Math.min(MAX_STARS, Math.round((width * height) / AREA_PER_STAR))
  return Array.from({ length: count }, () => {
    const depth = 0.2 + Math.random() * 0.8
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 0.3 + depth * depth * 1.2,
      alpha: 0.25 + Math.random() * 0.65,
      speed: 0.0004 + Math.random() * 0.0016,
      phase: Math.random() * TAU,
      depth,
      color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)] ?? '#ffffff',
    }
  })
}

function createMeteor(width: number, height: number, time: number): Meteor {
  return {
    x: width * (0.3 + Math.random() * 0.7),
    y: height * Math.random() * 0.35,
    directionX: Math.cos(METEOR_ANGLE),
    directionY: Math.sin(METEOR_ANGLE),
    speed: 700 + Math.random() * 500,
    length: 140 + Math.random() * 100,
    bornAt: time,
    lifetime: 700 + Math.random() * 500,
  }
}

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size
}
