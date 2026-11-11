import { describe, expect, it } from 'vitest'
import { layoutCloud, type CloudWord, type PlacedWord } from './cloud-layout'

const EM_WIDTH = 0.6
const measure = (label: string) => label.length * EM_WIDTH

function words(count: number): CloudWord[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `topic-${index}`,
    label: `topic-${index}`,
    weight: Math.ceil(120 / (index + 1)),
  }))
}

function overlaps(a: PlacedWord, b: PlacedWord): boolean {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < (a.height + b.height) / 2
}

describe('layoutCloud', () => {
  it('places words without overlap', () => {
    // When
    const placed = layoutCloud(words(40), { width: 1200, height: 700, measure })

    // Then
    expect(placed).toHaveLength(40)
    for (const [index, word] of placed.entries()) {
      for (const other of placed.slice(index + 1)) {
        expect(overlaps(word, other), `${word.key} overlaps ${other.key}`).toBe(false)
      }
    }
  })

  it('keeps every word inside the area', () => {
    // Given
    const width = 900
    const height = 500

    // When
    const placed = layoutCloud(words(60), { width, height, measure })

    // Then
    for (const word of placed) {
      expect(Math.abs(word.x) + word.width / 2).toBeLessThanOrEqual(width / 2)
      expect(Math.abs(word.y) + word.height / 2).toBeLessThanOrEqual(height / 2)
    }
  })

  it('gives heavier words larger fonts', () => {
    // When
    const placed = layoutCloud(words(20), { width: 1000, height: 600, measure })

    // Then
    const sizes = placed.map((word) => word.fontSize)
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a))
    expect(sizes[0]).toBeGreaterThan(sizes[sizes.length - 1] ?? 0)
  })

  it('keeps close weights at close font sizes', () => {
    // Given
    const close = [
      { key: 'first', label: 'first', weight: 12 },
      { key: 'second', label: 'second', weight: 11 },
      { key: 'third', label: 'third', weight: 10 },
    ]

    // When
    const placed = layoutCloud(close, { width: 1000, height: 600, measure })

    // Then
    const sizes = placed.map((word) => word.fontSize)
    expect(Math.min(...sizes) / Math.max(...sizes)).toBeGreaterThanOrEqual(0.6)
  })

  it('gives equally weighted words the same font size', () => {
    // Given
    const equal = words(10).map((word) => ({ ...word, weight: 3 }))

    // When
    const placed = layoutCloud(equal, { width: 1000, height: 600, measure })

    // Then
    expect(new Set(placed.map((word) => word.fontSize)).size).toBe(1)
  })

  it('produces the same layout for the same input', () => {
    // Given
    const options = { width: 1000, height: 600, measure }

    // When
    const first = layoutCloud(words(40), options)
    const second = layoutCloud(words(40), options)

    // Then
    expect(second).toEqual(first)
  })

  it('shrinks a long heavy word so a narrow area still fits the others', () => {
    // Given
    const narrow = [
      { key: 'long', label: 'a-very-long-topic-name', weight: 200 },
      ...words(20),
    ]

    // When
    const placed = layoutCloud(narrow, { width: 340, height: 480, measure, minFontSize: 11 })

    // Then
    expect(placed.length).toBeGreaterThan(15)
    expect(Math.min(...placed.map((word) => word.fontSize))).toBeGreaterThanOrEqual(11)
  })

  it('never exceeds the largest font size', () => {
    // When
    const placed = layoutCloud(words(3), { width: 2000, height: 1200, measure, maxFontSize: 80 })

    // Then
    expect(Math.max(...placed.map((word) => word.fontSize))).toBeLessThanOrEqual(80)
  })

  it('drops the lightest words rather than rendering unreadable text', () => {
    // Given
    const many = words(150)

    // When
    const placed = layoutCloud(many, { width: 360, height: 420, measure, minFontSize: 11 })

    // Then
    expect(placed.length).toBeLessThan(many.length)
    expect(placed.map((word) => word.key)).toEqual(many.slice(0, placed.length).map((word) => word.key))
    expect(Math.min(...placed.map((word) => word.fontSize))).toBeGreaterThanOrEqual(11)
  })

  it('returns nothing without words', () => {
    expect(layoutCloud([], { width: 1000, height: 600, measure })).toEqual([])
  })

  it('returns nothing when the area has no room', () => {
    expect(layoutCloud(words(5), { width: 0, height: 0, measure })).toEqual([])
  })
})
