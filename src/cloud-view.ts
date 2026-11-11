import { hashString, layoutCloud, type CloudWord, type PlacedWord } from './cloud-layout'

export const CLOUD_FONT = '"Outfit Variable"'

const FONT_STACK = `${CLOUD_FONT}, system-ui, sans-serif`
const FONT_WEIGHT = 700
const MEASURE_SIZE = 100
const FALLBACK_EM_WIDTH = 0.56
const AREA_PER_WORD = 5200
const MIN_CAPACITY = 30
const MAX_CAPACITY = 160
const ENTER_STAGGER_MS = 7
const MAX_ENTER_DELAY_MS = 700
const EXIT_DURATION_MS = 260
const RESIZE_DEBOUNCE_MS = 150
const PALETTE = [
  '#c4b5fd',
  '#f9a8d4',
  '#fb923c',
  '#f87171',
  '#60a5fa',
  '#6ee7b7',
  '#fde68a',
  '#e2e8f0',
  '#a78bfa',
  '#38bdf8',
]

export interface CloudViewOptions {
  onSelect: (key: string) => void
  onRender: (shown: number) => void
}

export class CloudView {
  private readonly elements = new Map<string, HTMLButtonElement>()
  private readonly widths = new Map<string, number>()
  private readonly context = document.createElement('canvas').getContext('2d')
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  private readonly container: HTMLElement
  private readonly options: CloudViewOptions
  private words: CloudWord[] = []
  private renderedSize = ''
  private resizeTimer = 0

  constructor(container: HTMLElement, options: CloudViewOptions) {
    this.container = container
    this.options = options
    container.addEventListener('click', (event) => {
      const key = (event.target as Element).closest<HTMLElement>('.word')?.dataset.key
      if (key !== undefined) options.onSelect(key)
    })
    new ResizeObserver(() => this.scheduleResize()).observe(container)
  }

  setWords(words: CloudWord[]): void {
    this.words = words
    this.render()
  }

  clear(): void {
    this.words = []
    this.elements.clear()
    this.container.replaceChildren()
  }

  private scheduleResize(): void {
    clearTimeout(this.resizeTimer)
    this.resizeTimer = window.setTimeout(() => {
      const hidden = this.container.clientWidth === 0 || this.container.clientHeight === 0
      if (!hidden && this.sizeKey() !== this.renderedSize) this.render()
    }, RESIZE_DEBOUNCE_MS)
  }

  private sizeKey(): string {
    return `${this.container.clientWidth}x${this.container.clientHeight}`
  }

  private render(): void {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    this.renderedSize = this.sizeKey()

    const capacity = Math.min(MAX_CAPACITY, Math.max(MIN_CAPACITY, Math.round((width * height) / AREA_PER_WORD)))
    const placed = layoutCloud(this.words.slice(0, capacity), {
      width,
      height,
      measure: (label) => this.measure(label),
    })

    const visible = new Set<string>()
    placed.forEach((word, index) => {
      visible.add(word.key)
      const existing = this.elements.get(word.key)
      const element = existing ?? this.createWord(word)
      this.position(element, word, width, height)
      if (!existing) {
        this.elements.set(word.key, element)
        this.container.append(element)
        this.animateIn(element, index)
      }
    })

    for (const [key, element] of this.elements) {
      if (visible.has(key)) continue
      this.elements.delete(key)
      this.animateOut(element)
    }

    this.options.onRender(placed.length)
  }

  private measure(label: string): number {
    const cached = this.widths.get(label)
    if (cached !== undefined) return cached
    if (!this.context) return label.length * FALLBACK_EM_WIDTH
    this.context.font = `${FONT_WEIGHT} ${MEASURE_SIZE}px ${FONT_STACK}`
    const width = this.context.measureText(label).width / MEASURE_SIZE
    this.widths.set(label, width)
    return width
  }

  private createWord(word: PlacedWord): HTMLButtonElement {
    const element = document.createElement('button')
    const seed = hashString(word.key)
    element.type = 'button'
    element.className = 'word'
    element.dataset.key = word.key
    element.textContent = word.label
    element.style.color = PALETTE[seed % PALETTE.length] ?? ''
    element.style.setProperty('--drift-x', `${1 + (seed % 5) * 0.5}px`)
    element.style.setProperty('--drift-y', `${1.5 + ((seed >>> 3) % 5) * 0.5}px`)
    element.style.setProperty('--drift-duration', `${5 + ((seed >>> 6) % 50) / 10}s`)
    element.style.setProperty('--drift-delay', `${-((seed >>> 9) % 80) / 10}s`)
    return element
  }

  private position(element: HTMLButtonElement, word: PlacedWord, width: number, height: number): void {
    const x = Math.round((width / 2 + word.x) * 10) / 10
    const y = Math.round((height / 2 + word.y) * 10) / 10
    const count = `${word.weight} ${word.weight === 1 ? 'repo' : 'repos'}`
    element.style.translate = `calc(-50% + ${x}px) calc(-50% + ${y}px)`
    element.style.fontSize = `${word.fontSize}px`
    element.dataset.count = count
    element.setAttribute('aria-label', `${word.label}, ${count}`)
  }

  private animateIn(element: HTMLElement, index: number): void {
    if (this.reducedMotion.matches) return
    element.animate(
      [
        { opacity: 0, scale: 0.3 },
        { opacity: 1, scale: 1 },
      ],
      {
        duration: 700,
        delay: Math.min(index * ENTER_STAGGER_MS, MAX_ENTER_DELAY_MS),
        easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.25)',
        fill: 'backwards',
      },
    )
  }

  private animateOut(element: HTMLElement): void {
    element.classList.add('leaving')
    if (this.reducedMotion.matches) {
      element.remove()
      return
    }
    element.animate(
      [
        { opacity: 1, scale: 1 },
        { opacity: 0, scale: 0.3 },
      ],
      { duration: EXIT_DURATION_MS, easing: 'ease-in', fill: 'forwards' },
    )
    window.setTimeout(() => element.remove(), EXIT_DURATION_MS)
  }
}
