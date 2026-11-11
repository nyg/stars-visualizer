export interface CloudWord {
  key: string
  label: string
  weight: number
}

export interface PlacedWord extends CloudWord {
  x: number
  y: number
  fontSize: number
  width: number
  height: number
}

export interface LayoutOptions {
  width: number
  height: number
  measure: (label: string) => number
  minFontSize?: number
  maxFontSize?: number
}

interface Box {
  word: CloudWord
  x: number
  y: number
  fontSize: number
  textWidth: number
  halfWidth: number
  halfHeight: number
}

const REFERENCE_MAX = 100
const REFERENCE_UNIFORM = 40
const SMALLEST_FLOOR_RATIO = 0.15
const LARGEST_FLOOR_RATIO = 0.6
const LINE_HEIGHT = 0.92
const MARGIN = 10
const WIDTH_FILL = 0.9
const MIN_WORDS = 8
const SHRINK_FACTOR = 0.85
const SPIRAL_GAP = 9
const ARC_STEP = 7
const MAX_SPIRAL_STEPS = 60_000

export function layoutCloud(words: CloudWord[], options: LayoutOptions): PlacedWord[] {
  const { width, height } = options
  const minFontSize = options.minFontSize ?? 11
  const maxFontSize = options.maxFontSize ?? 120
  if (width <= 2 * MARGIN || height <= 2 * MARGIN) return []

  let candidates = [...words].sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label))
  while (candidates.length > 0) {
    const boxes = placeOnSpiral(candidates, options, minFontSize)
    const scale = fittingScale(boxes, width, height, maxFontSize)
    const smallest = Math.min(...boxes.map((box) => box.fontSize)) * scale
    if (smallest >= minFontSize || candidates.length <= MIN_WORDS) return toPlacedWords(boxes, scale)
    candidates = candidates.slice(0, Math.max(MIN_WORDS, Math.floor(candidates.length * SHRINK_FACTOR)))
  }
  return []
}

function referenceSizes(sorted: CloudWord[]): number[] {
  const weights = sorted.map((word) => Math.max(word.weight, 0))
  const max = Math.max(...weights)
  const min = Math.min(...weights)
  if (max === min) return sorted.map(() => REFERENCE_UNIFORM)
  const smallest = REFERENCE_MAX * Math.min(LARGEST_FLOOR_RATIO, Math.max(SMALLEST_FLOOR_RATIO, min / max))
  const rootMin = Math.sqrt(min)
  const rootSpan = Math.sqrt(max) - rootMin
  return weights.map((weight) => smallest + ((Math.sqrt(weight) - rootMin) / rootSpan) * (REFERENCE_MAX - smallest))
}

function placeOnSpiral(sorted: CloudWord[], options: LayoutOptions, minFontSize: number): Box[] {
  const { width, height, measure } = options
  const aspect = width / height
  const sizes = referenceSizes(sorted)
  const smallest = Math.min(...sizes)
  const widestText = (WIDTH_FILL * (width - 2 * MARGIN) * smallest) / minFontSize
  const boxes: Box[] = []
  sorted.forEach((word, index) => {
    const emWidth = measure(word.label)
    const fontSize = Math.max(smallest, Math.min(sizes[index] ?? smallest, widestText / emWidth))
    const textWidth = emWidth * fontSize
    const halfWidth = textWidth / 2 + fontSize * 0.16 + 3
    const halfHeight = (fontSize * LINE_HEIGHT) / 2 + fontSize * 0.03 + 1.5
    const [x, y] = findFreeSpot(boxes, halfWidth, halfHeight, aspect, startAngle(word.key))
    boxes.push({ word, x, y, fontSize, textWidth, halfWidth, halfHeight })
  })
  return boxes
}

function findFreeSpot(
  boxes: Box[],
  halfWidth: number,
  halfHeight: number,
  aspect: number,
  angleOffset: number,
): [number, number] {
  let theta = 0
  let x = 0
  let y = 0
  for (let step = 0; step < MAX_SPIRAL_STEPS; step++) {
    const radius = (SPIRAL_GAP * theta) / (2 * Math.PI)
    x = radius * Math.cos(theta + angleOffset) * aspect
    y = radius * Math.sin(theta + angleOffset)
    if (!collides(boxes, x, y, halfWidth, halfHeight)) break
    theta += ARC_STEP / Math.max(radius, ARC_STEP)
  }
  return [x, y]
}

function collides(boxes: Box[], x: number, y: number, halfWidth: number, halfHeight: number): boolean {
  for (const box of boxes) {
    if (Math.abs(x - box.x) < halfWidth + box.halfWidth && Math.abs(y - box.y) < halfHeight + box.halfHeight) {
      return true
    }
  }
  return false
}

function startAngle(key: string): number {
  return (hashString(key) % 360) * (Math.PI / 180)
}

export function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function bounds(boxes: Box[]): { left: number; right: number; top: number; bottom: number } {
  return {
    left: Math.min(...boxes.map((box) => box.x - box.textWidth / 2)),
    right: Math.max(...boxes.map((box) => box.x + box.textWidth / 2)),
    top: Math.min(...boxes.map((box) => box.y - (box.fontSize * LINE_HEIGHT) / 2)),
    bottom: Math.max(...boxes.map((box) => box.y + (box.fontSize * LINE_HEIGHT) / 2)),
  }
}

function fittingScale(boxes: Box[], width: number, height: number, maxFontSize: number): number {
  const { left, right, top, bottom } = bounds(boxes)
  const largest = Math.max(...boxes.map((box) => box.fontSize))
  return Math.min(
    (width - 2 * MARGIN) / Math.max(right - left, 1),
    (height - 2 * MARGIN) / Math.max(bottom - top, 1),
    maxFontSize / largest,
  )
}

function toPlacedWords(boxes: Box[], scale: number): PlacedWord[] {
  const { left, right, top, bottom } = bounds(boxes)
  const centerX = (left + right) / 2
  const centerY = (top + bottom) / 2
  return boxes.map((box) => ({
    ...box.word,
    x: round((box.x - centerX) * scale),
    y: round((box.y - centerY) * scale),
    fontSize: round(box.fontSize * scale),
    width: round(box.textWidth * scale),
    height: round(box.fontSize * LINE_HEIGHT * scale),
  }))
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
