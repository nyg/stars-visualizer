import '@fontsource-variable/outfit'
import './style.css'
import { loadCached, loadToken, saveCached, saveToken } from './cache'
import { CLOUD_FONT, CloudView } from './cloud-view'
import { byId, create } from './dom'
import { fetchStars, GitHubError, isValidUsername, type FetchProgress, type StarsResult } from './github'
import { LanguageBar } from './language-bar'
import { languageColor } from './language-colors'
import {
  countLanguages,
  countTopics,
  countUntagged,
  EMPTY_FILTER,
  filterRepos,
  isFilterActive,
  relatedTopics,
  sortRepos,
  toggleTopic,
  type Filter,
  type SortKey,
  type StarredRepo,
} from './model'
import { RepoList } from './repo-list'
import { formatRoute, parseRoute } from './route'
import { startStarfield } from './starfield'

type View = 'landing' | 'loading' | 'error' | 'ready'

interface ErrorCopy {
  title: string
  detail: string
  tokenAction: string | null
}

const FONT_TIMEOUT_MS = 1500
const SEARCH_DEBOUNCE_MS = 120
const CLOSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
const narrowLayout = matchMedia('(max-width: 959px)')
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const clockTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

const loadingTitle = byId('loading-title')
const loadingDetail = byId('loading-detail')
const progressFill = byId('progress-fill')
const errorTitle = byId('error-title')
const errorDetail = byId('error-detail')
const errorTokenButton = byId('error-token-button')
const avatar = byId<HTMLImageElement>('avatar')
const profileLink = byId<HTMLAnchorElement>('profile-link')
const summary = byId('summary')
const updated = byId('updated')
const notice = byId('notice')
const noticeText = byId('notice-text')
const topicSearch = byId<HTMLInputElement>('topic-search')
const activeFilters = byId('active-filters')
const cloudEmpty = byId('cloud-empty')
const cloudHint = byId('cloud-hint')
const panel = byId('panel')
const panelTitle = byId('panel-title')
const panelEmpty = byId('panel-empty')
const sortSelect = byId<HTMLSelectElement>('sort')
const tokenDialog = byId<HTMLDialogElement>('token-dialog')
const tokenInput = byId<HTMLInputElement>('token-input')
const userInputs = [byId<HTMLFormElement>('hero-form'), byId<HTMLFormElement>('topbar-form')].map(bindUserForm)

let result: StarsResult | null = null
let currentUser: string | null = null
let filter: Filter = EMPTY_FILTER
let query = ''
let sort: SortKey = 'starred'
let appliedHash: string | null = null
let controller: AbortController | null = null
let renderedFilterKey = ''
let renderedPanelKey = ''
let topicTotal = 0
let searchTimer = 0

const cloud = new CloudView(byId('cloud'), { onSelect: selectTopicFromCloud, onRender: renderCloudStatus })
const repoList = new RepoList(byId('repo-list'), (topic) => navigate(currentUser, toggleTopic(filter, topic)))
const languageBar = new LanguageBar(byId('languages'), byId('language-bar'), byId('language-legend'), (language) =>
  navigate(currentUser, { ...filter, language: filter.language === language ? null : language }),
)

function setView(view: View): void {
  document.body.dataset.view = view
}

function navigate(user: string | null, nextFilter: Filter = EMPTY_FILTER): void {
  const hash = formatRoute(user, nextFilter)
  if (hash !== location.hash) history.pushState(null, '', hash)
  applyRoute()
}

function applyRoute(): void {
  if (location.hash === appliedHash) return
  appliedHash = location.hash
  const route = parseRoute(location.hash)
  filter = route.filter
  if (!route.user) {
    showLanding()
    return
  }
  if (result && currentUser?.toLowerCase() === route.user.toLowerCase()) {
    renderExplore()
    return
  }
  void loadUser(route.user)
}

function showLanding(): void {
  controller?.abort()
  result = null
  currentUser = null
  cloud.clear()
  setUserInputs('')
  setView('landing')
}

async function loadUser(user: string, force = false): Promise<void> {
  controller?.abort()
  controller = new AbortController()
  const { signal } = controller
  currentUser = user
  result = null
  cloud.clear()
  clearSearch()
  setUserInputs(user)

  if (!isValidUsername(user)) {
    showError(new GitHubError('invalid-user', 'Invalid username'), user)
    return
  }
  const cached = force ? null : loadCached(user)
  if (cached) {
    showResult(cached)
    return
  }

  showLoading(user)
  try {
    const fresh = await fetchStars(user, { token: loadToken(), signal, onProgress: showProgress })
    if (signal.aborted) return
    saveCached(fresh)
    showResult(fresh)
  } catch (error) {
    if (signal.aborted) return
    showError(error, user)
  }
}

function showLoading(user: string): void {
  loadingTitle.textContent = `Collecting stars for @${user}`
  loadingDetail.textContent = 'Contacting GitHub…'
  progressFill.style.scale = '0 1'
  setView('loading')
}

function showProgress({ loadedPages, totalPages, loadedRepos }: FetchProgress): void {
  progressFill.style.scale = `${loadedPages / totalPages} 1`
  loadingDetail.textContent =
    totalPages > 1
      ? `${formatNumber(loadedRepos)} stars so far · page ${loadedPages} of ${totalPages}`
      : `${plural(loadedRepos, 'star')} found`
}

function showError(error: unknown, user: string): void {
  const copy = describeError(error, user)
  errorTitle.textContent = copy.title
  errorDetail.textContent = copy.detail
  errorTokenButton.hidden = copy.tokenAction === null
  errorTokenButton.textContent = copy.tokenAction ?? ''
  setView('error')
}

function describeError(error: unknown, user: string): ErrorCopy {
  if (!(error instanceof GitHubError)) {
    return { title: 'Something went wrong', detail: 'An unexpected error occurred. Try again in a moment.', tokenAction: null }
  }
  switch (error.kind) {
    case 'invalid-user':
      return {
        title: 'That is not a GitHub username',
        detail: 'Usernames use letters, digits and single hyphens, up to 39 characters.',
        tokenAction: null,
      }
    case 'not-found':
      return { title: `No GitHub user named @${user}`, detail: 'Check the spelling and try again.', tokenAction: null }
    case 'rate-limit':
      return {
        title: 'GitHub rate limit reached',
        detail: `${
          error.resetAt
            ? `Requests are allowed again at ${clockTime.format(error.resetAt)}.`
            : 'Requests are allowed again within the hour.'
        } Add a token to keep going right away.`,
        tokenAction: 'Add a token',
      }
    case 'unauthorized':
      return {
        title: 'GitHub rejected the token',
        detail: 'Update or remove it, then try again.',
        tokenAction: 'Update token',
      }
    case 'network':
      return { title: 'GitHub is out of reach', detail: 'Check your connection and try again.', tokenAction: null }
    case 'unexpected':
      return { title: 'GitHub is not cooperating', detail: `${error.message}. Try again in a moment.`, tokenAction: null }
  }
}

function showResult(next: StarsResult): void {
  result = next
  renderedFilterKey = ''
  renderedPanelKey = ''

  avatar.hidden = false
  avatar.src = `https://github.com/${encodeURIComponent(next.user)}.png?size=96`
  profileLink.textContent = `@${next.user}`
  profileLink.href = `https://github.com/${encodeURIComponent(next.user)}?tab=stars`
  updated.textContent = describeAge(next.fetchedAt)
  notice.hidden = !next.partial
  noticeText.textContent = `Showing the ${formatNumber(next.repos.length)} most recent stars. GitHub's rate limit stopped the rest.`

  setView('ready')
  renderExplore()
}

function renderExplore(): void {
  if (!result) return
  document.body.dataset.panel = isFilterActive(filter) ? 'open' : 'closed'

  const matching = filterRepos(result.repos, filter)
  const topics = relatedTopics(matching, filter.topics, query)
  const filterKey = formatRoute(currentUser, filter)
  if (filterKey !== renderedFilterKey) {
    renderedFilterKey = filterKey
    renderSummary(result)
    renderActiveFilters()
  }
  languageBar.show(countLanguages(filterRepos(result.repos, filter, { ignoreLanguage: true })), filter.language)
  renderPanel(matching, filterKey)

  topicTotal = topics.length
  cloud.setWords(topics.map(({ key, count }) => ({ key, label: key, weight: count })))
}

function renderSummary(current: StarsResult): void {
  const parts: Array<string | Node> = [
    `${plural(current.repos.length, 'star')} · ${plural(countTopics(current.repos).length, 'topic')}`,
  ]
  const untagged = countUntagged(current.repos)
  if (untagged > 0) {
    const button = create('button', 'link-button', `${formatNumber(untagged)} without topics`)
    button.type = 'button'
    button.setAttribute('aria-pressed', String(filter.untagged))
    button.addEventListener('click', () =>
      navigate(currentUser, { topics: [], language: filter.language, untagged: !filter.untagged }),
    )
    parts.push(' · ', button)
  }
  summary.replaceChildren(...parts)
}

function renderActiveFilters(): void {
  const chips = filter.topics.map((topic) =>
    createFilterChip(topic, () => navigate(currentUser, toggleTopic(filter, topic))),
  )
  if (filter.untagged) {
    chips.push(createFilterChip('no topics', () => navigate(currentUser, { ...filter, untagged: false })))
  }
  if (filter.language !== null) {
    chips.push(
      createFilterChip(
        filter.language,
        () => navigate(currentUser, { ...filter, language: null }),
        languageColor(filter.language),
      ),
    )
  }
  if (chips.length > 1) {
    const clear = create('button', 'link-button', 'Clear all')
    clear.type = 'button'
    clear.addEventListener('click', () => navigate(currentUser))
    chips.push(clear)
  }
  activeFilters.replaceChildren(...chips)
}

function createFilterChip(label: string, onRemove: () => void, dotColor?: string): HTMLButtonElement {
  const chip = create('button', 'chip')
  chip.type = 'button'
  chip.setAttribute('aria-label', `Remove filter ${label}`)
  if (dotColor) {
    const dot = create('i', 'language-dot')
    dot.style.background = dotColor
    chip.append(dot)
  }
  chip.append(label)
  chip.insertAdjacentHTML('beforeend', CLOSE_ICON)
  chip.addEventListener('click', onRemove)
  return chip
}

function renderPanel(matching: StarredRepo[], filterKey: string): void {
  const panelKey = `${filterKey}|${sort}`
  if (!isFilterActive(filter) || panelKey === renderedPanelKey) return
  renderedPanelKey = panelKey
  panelTitle.textContent = matching.length === 1 ? '1 repository' : `${formatNumber(matching.length)} repositories`
  panelEmpty.hidden = matching.length > 0
  panel.scrollTop = 0
  repoList.show(sortRepos(matching, sort), filter.topics)
}

function renderCloudStatus(shown: number): void {
  cloudEmpty.hidden = topicTotal > 0
  cloudEmpty.textContent = topicTotal > 0 ? '' : describeEmptyCloud()
  cloudHint.textContent = describeCloud(shown)
}

function describeEmptyCloud(): string {
  if (result?.repos.length === 0) return `@${result.user} has not starred any repository yet.`
  if (query.trim() !== '') return `No topic matches "${query.trim()}".`
  if (filter.untagged) return 'These repositories have no topics.'
  if (isFilterActive(filter)) return 'No other topics in these repositories.'
  return 'None of these repositories has topics.'
}

function describeCloud(shown: number): string {
  if (topicTotal === 0) return ''
  const scope = isFilterActive(filter) ? 'related topics' : 'topics'
  if (shown < topicTotal) return `Top ${shown} of ${formatNumber(topicTotal)} ${scope} · search to find the rest`
  return isFilterActive(filter)
    ? `${plural(topicTotal, 'related topic')} · click one to narrow down`
    : `${plural(topicTotal, 'topic')} · click one to explore`
}

function describeAge(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60_000)
  if (minutes < 1) return 'Updated just now'
  if (minutes < 60) return `Updated ${minutes} min ago`
  return `Updated ${Math.round(minutes / 60)} h ago`
}

function selectTopicFromCloud(topic: string): void {
  const wasActive = isFilterActive(filter)
  clearSearch()
  navigate(currentUser, toggleTopic(filter, topic))
  if (!wasActive && narrowLayout.matches) panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function clearSearch(): void {
  clearTimeout(searchTimer)
  query = ''
  topicSearch.value = ''
}

function setUserInputs(user: string): void {
  for (const input of userInputs) {
    input.value = user
    input.setCustomValidity('')
  }
}

function bindUserForm(form: HTMLFormElement): HTMLInputElement {
  const input = form.elements.namedItem('user') as HTMLInputElement
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const user = extractUsername(input.value)
    if (!isValidUsername(user)) {
      input.setCustomValidity(user ? 'That does not look like a GitHub username' : 'Enter a GitHub username')
      input.reportValidity()
      if (!reducedMotion.matches) form.animate({ translate: ['0', '-6px', '6px', '-6px', '6px', '0'] }, 400)
      return
    }
    input.blur()
    navigate(user)
  })
  input.addEventListener('input', () => input.setCustomValidity(''))
  return input
}

function extractUsername(raw: string): string {
  const trimmed = raw.trim()
  const fromUrl = trimmed.match(/github\.com\/([^/?#\s]+)/i)
  return (fromUrl?.[1] ?? trimmed).replace(/^@/, '')
}

function openTokenDialog(): void {
  tokenInput.value = loadToken() ?? ''
  tokenDialog.returnValue = ''
  tokenDialog.showModal()
}

function applyTokenChange(): void {
  if (tokenDialog.returnValue === 'save') saveToken(tokenInput.value.trim() || null)
  else if (tokenDialog.returnValue === 'remove') saveToken(null)
  else return
  const needsReload = document.body.dataset.view === 'error' || result?.partial === true
  if (currentUser && needsReload) void loadUser(currentUser, true)
}

function formatNumber(value: number): string {
  return value.toLocaleString('en')
}

function plural(count: number, noun: string): string {
  return `${formatNumber(count)} ${noun}${count === 1 ? '' : 's'}`
}

function reloadCurrentUser(): void {
  if (currentUser) void loadUser(currentUser, true)
}

topicSearch.addEventListener('input', () => {
  clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    query = topicSearch.value
    renderExplore()
  }, SEARCH_DEBOUNCE_MS)
})
sortSelect.addEventListener('change', () => {
  sort = sortSelect.value as SortKey
  renderExplore()
})
avatar.addEventListener('error', () => {
  avatar.hidden = true
})
byId('refresh-button').addEventListener('click', reloadCurrentUser)
byId('retry-button').addEventListener('click', reloadCurrentUser)
byId('panel-close').addEventListener('click', () => navigate(currentUser))
byId('token-button').addEventListener('click', openTokenDialog)
byId('notice-token-button').addEventListener('click', openTokenDialog)
errorTokenButton.addEventListener('click', openTokenDialog)
byId('token-cancel').addEventListener('click', () => tokenDialog.close('cancel'))
byId('token-remove').addEventListener('click', () => tokenDialog.close('remove'))
tokenDialog.addEventListener('close', applyTokenChange)
window.addEventListener('popstate', applyRoute)
window.addEventListener('hashchange', applyRoute)

startStarfield(byId<HTMLCanvasElement>('starfield'))
await Promise.race([
  document.fonts.load(`700 100px ${CLOUD_FONT}`),
  new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT_MS)),
])
applyRoute()
