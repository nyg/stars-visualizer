import { create, sizedAvatar } from './dom'
import { languageColor } from './language-colors'
import { formatCount, type StarredRepo } from './model'

const BATCH_SIZE = 30
const MAX_TOPICS = 8
const EMOJI_SHORTCODE = /(^|\s):[a-z_][a-z0-9_+-]*:(?=\s|$)/g
const STAR_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.6 6.1 20.7l1.2-6.6L2.5 9.5l6.6-.9z"/></svg>'

const starredDate = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' })

export class RepoList {
  private readonly list: HTMLElement
  private readonly sentinel = create('li', 'repo-sentinel')
  private readonly observer: IntersectionObserver
  private repos: StarredRepo[] = []
  private selectedTopics: string[] = []
  private rendered = 0

  constructor(list: HTMLElement, onTopic: (topic: string) => void) {
    this.list = list
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) this.appendBatch()
      },
      { rootMargin: '400px' },
    )
    list.addEventListener('click', (event) => {
      const topic = (event.target as Element).closest<HTMLElement>('[data-topic]')?.dataset.topic
      if (topic !== undefined) onTopic(topic)
    })
  }

  show(repos: StarredRepo[], selectedTopics: string[]): void {
    this.repos = repos
    this.selectedTopics = selectedTopics
    this.rendered = 0
    this.list.replaceChildren()
    this.appendBatch()
  }

  private appendBatch(): void {
    this.observer.unobserve(this.sentinel)
    this.sentinel.remove()
    const batch = this.repos.slice(this.rendered, this.rendered + BATCH_SIZE)
    this.list.append(...batch.map((repo, index) => this.createCard(repo, index)))
    this.rendered += batch.length
    if (this.rendered < this.repos.length) {
      this.list.append(this.sentinel)
      this.observer.observe(this.sentinel)
    }
  }

  private createCard(repo: StarredRepo, index: number): HTMLLIElement {
    const card = create('li', 'repo')
    card.style.setProperty('--index', String(index))
    card.append(this.createHeader(repo))
    const description = repo.description?.replace(EMOJI_SHORTCODE, '$1').trim()
    if (description) card.append(create('p', 'repo-description', description))
    card.append(this.createMeta(repo))
    if (repo.topics.length > 0) card.append(this.createTopics(repo))
    return card
  }

  private createHeader(repo: StarredRepo): HTMLAnchorElement {
    const link = create('a', 'repo-link')
    link.href = repo.url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'

    const avatar = create('img', 'repo-avatar')
    avatar.src = sizedAvatar(repo.avatarUrl, 56)
    avatar.alt = ''
    avatar.width = 28
    avatar.height = 28
    avatar.loading = 'lazy'

    const name = create('span', 'repo-name')
    name.append(create('span', 'repo-owner', `${repo.owner}/`), create('strong', '', repo.name))

    const stars = create('span', 'repo-stars')
    stars.innerHTML = STAR_ICON
    stars.append(formatCount(repo.stars))
    stars.title = `${repo.stars.toLocaleString('en')} stars`

    link.append(avatar, name, stars)
    return link
  }

  private createMeta(repo: StarredRepo): HTMLDivElement {
    const meta = create('div', 'repo-meta')
    if (repo.language) {
      const language = create('span', 'repo-language')
      const dot = create('i', 'language-dot')
      dot.style.background = languageColor(repo.language)
      language.append(dot, repo.language)
      meta.append(language)
    }
    if (repo.starredAt) meta.append(create('span', '', `Starred ${starredDate.format(new Date(repo.starredAt))}`))
    if (repo.archived) meta.append(create('span', 'repo-badge', 'Archived'))
    return meta
  }

  private createTopics(repo: StarredRepo): HTMLUListElement {
    const topics = create('ul', 'repo-topics')
    const selectedFirst = [...repo.topics].sort(
      (a, b) => Number(this.selectedTopics.includes(b)) - Number(this.selectedTopics.includes(a)),
    )
    for (const topic of selectedFirst.slice(0, MAX_TOPICS)) {
      const chip = create('button', 'topic-chip', topic)
      chip.type = 'button'
      chip.dataset.topic = topic
      chip.setAttribute('aria-pressed', String(this.selectedTopics.includes(topic)))
      const item = create('li')
      item.append(chip)
      topics.append(item)
    }
    const hidden = repo.topics.length - MAX_TOPICS
    if (hidden > 0) topics.append(create('li', 'repo-more', `+${hidden}`))
    return topics
  }
}
