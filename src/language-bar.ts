import { create } from './dom'
import { languageColor } from './language-colors'
import type { Count } from './model'

const MAX_LANGUAGES = 7
const OTHER_KEY = '\u0000other'
const OTHER_COLOR = '#4b5275'
const REMOVE_AFTER_MS = 600

export class LanguageBar {
  private readonly segments = new Map<string, HTMLElement>()
  private readonly root: HTMLElement
  private readonly bar: HTMLElement
  private readonly legend: HTMLElement

  constructor(root: HTMLElement, bar: HTMLElement, legend: HTMLElement, onSelect: (language: string) => void) {
    this.root = root
    this.bar = bar
    this.legend = legend
    root.addEventListener('click', (event) => {
      const language = (event.target as Element).closest<HTMLElement>('[data-language]')?.dataset.language
      if (language !== undefined) onSelect(language)
    })
  }

  show(counts: Count[], active: string | null): void {
    this.root.hidden = counts.length === 0
    const top = counts.slice(0, MAX_LANGUAGES)
    const activeCount = counts.find(({ key }) => key === active)
    if (activeCount && !top.includes(activeCount)) top[top.length - 1] = activeCount
    const otherCount = counts.filter((count) => !top.includes(count)).reduce((sum, { count }) => sum + count, 0)

    this.showSegments(top, otherCount, active)
    this.showLegend(top, otherCount, active)
  }

  private showSegments(top: Count[], otherCount: number, active: string | null): void {
    const wanted = new Map(top.map(({ key, count }) => [key, count]))
    if (otherCount > 0) wanted.set(OTHER_KEY, otherCount)

    let order = 0
    for (const [key, count] of wanted) {
      const segment = this.segments.get(key) ?? this.createSegment(key)
      segment.style.order = String(order++)
      segment.classList.toggle('dimmed', active !== null && active !== key)
      segment.title = key === OTHER_KEY ? `Other · ${count}` : `${key} · ${count}`
      segment.style.flexGrow = String(count)
    }

    for (const [key, segment] of this.segments) {
      if (wanted.has(key)) continue
      this.segments.delete(key)
      segment.style.flexGrow = '0'
      window.setTimeout(() => segment.remove(), REMOVE_AFTER_MS)
    }
  }

  private createSegment(key: string): HTMLElement {
    const isOther = key === OTHER_KEY
    const segment = create(isOther ? 'span' : 'button', 'language-segment')
    segment.style.background = isOther ? OTHER_COLOR : languageColor(key)
    segment.style.flexGrow = '0'
    if (!isOther) {
      segment.dataset.language = key
      segment.setAttribute('aria-label', `Filter by ${key}`)
    }
    this.segments.set(key, segment)
    this.bar.append(segment)
    void segment.offsetWidth
    return segment
  }

  private showLegend(top: Count[], otherCount: number, active: string | null): void {
    const chips = top.map(({ key, count }) => {
      const chip = create('button', 'language-chip')
      chip.type = 'button'
      chip.dataset.language = key
      chip.setAttribute('aria-pressed', String(active === key))
      const dot = create('i', 'language-dot')
      dot.style.background = languageColor(key)
      chip.append(dot, key, create('span', 'language-count', String(count)))
      return chip
    })
    if (otherCount > 0) {
      const other = create('span', 'language-chip static')
      const dot = create('i', 'language-dot')
      dot.style.background = OTHER_COLOR
      other.append(dot, 'Other', create('span', 'language-count', String(otherCount)))
      this.legend.replaceChildren(...chips, other)
    } else {
      this.legend.replaceChildren(...chips)
    }
  }
}
