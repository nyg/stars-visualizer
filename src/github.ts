import type { StarredRepo } from './model'

const API_ROOT = 'https://api.github.com'
const PER_PAGE = 100
const CONCURRENCY = 4
const USERNAME_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i

export type GitHubErrorKind = 'invalid-user' | 'not-found' | 'rate-limit' | 'unauthorized' | 'network' | 'unexpected'

export class GitHubError extends Error {
  constructor(
    readonly kind: GitHubErrorKind,
    message: string,
    readonly resetAt: Date | null = null,
  ) {
    super(message)
    this.name = 'GitHubError'
  }
}

export interface StarsResult {
  user: string
  repos: StarredRepo[]
  fetchedAt: number
  partial: boolean
}

export interface FetchProgress {
  loadedPages: number
  totalPages: number
  loadedRepos: number
}

export interface FetchOptions {
  token?: string | null
  signal?: AbortSignal
  onProgress?: (progress: FetchProgress) => void
  fetchFn?: typeof fetch
}

interface RawRepo {
  full_name: string
  name: string
  html_url: string
  description: string | null
  language: string | null
  stargazers_count: number
  topics?: string[]
  archived?: boolean
  owner: { login: string; avatar_url: string }
}

interface RawStar {
  starred_at: string
  repo: RawRepo
}

interface Page {
  repos: StarredRepo[]
  lastPage: number
  remaining: number | null
}

export function isValidUsername(user: string): boolean {
  return USERNAME_PATTERN.test(user)
}

export function parseLastPage(link: string | null): number {
  const match = link?.match(/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/)
  return match ? Number(match[1]) : 1
}

export function toStarredRepo(item: RawStar | RawRepo): StarredRepo {
  const repo = 'repo' in item ? item.repo : item
  return {
    fullName: repo.full_name,
    owner: repo.owner.login,
    name: repo.name,
    url: repo.html_url,
    avatarUrl: repo.owner.avatar_url,
    description: repo.description,
    language: repo.language,
    stars: repo.stargazers_count,
    topics: repo.topics ?? [],
    starredAt: 'repo' in item ? item.starred_at : null,
    archived: repo.archived ?? false,
  }
}

export async function fetchStars(user: string, options: FetchOptions = {}): Promise<StarsResult> {
  if (!isValidUsername(user)) {
    throw new GitHubError('invalid-user', `"${user}" is not a valid GitHub username`)
  }

  const first = await fetchPage(user, 1, options)
  const totalPages = first.lastPage
  const remainingPages = Array.from({ length: totalPages - 1 }, (_, index) => index + 2)
  const queue = first.remaining === null ? remainingPages : remainingPages.slice(0, first.remaining)
  let partial = queue.length < remainingPages.length

  const pages = new Map<number, StarredRepo[]>([[1, first.repos]])
  const report = () =>
    options.onProgress?.({
      loadedPages: pages.size,
      totalPages,
      loadedRepos: [...pages.values()].reduce((sum, repos) => sum + repos.length, 0),
    })
  report()

  const worker = async () => {
    for (let page = queue.shift(); page !== undefined; page = queue.shift()) {
      try {
        pages.set(page, (await fetchPage(user, page, options)).repos)
        report()
      } catch (error) {
        if (!(error instanceof GitHubError) || error.kind !== 'rate-limit') throw error
        partial = true
        queue.length = 0
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  return { user, repos: mergePages(pages), fetchedAt: Date.now(), partial }
}

function mergePages(pages: Map<number, StarredRepo[]>): StarredRepo[] {
  const unique = new Map<string, StarredRepo>()
  const ordered = [...pages].sort(([a], [b]) => a - b).flatMap(([, repos]) => repos)
  for (const repo of ordered) {
    if (!unique.has(repo.fullName)) unique.set(repo.fullName, repo)
  }
  return [...unique.values()]
}

async function fetchPage(user: string, page: number, options: FetchOptions): Promise<Page> {
  const fetchFn = options.fetchFn ?? fetch
  const headers: Record<string, string> = { Accept: 'application/vnd.github.star+json' }
  if (options.token) headers.Authorization = `Bearer ${options.token}`

  let response: Response
  try {
    response = await fetchFn(
      `${API_ROOT}/users/${encodeURIComponent(user)}/starred?per_page=${PER_PAGE}&page=${page}`,
      { headers, signal: options.signal },
    )
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new GitHubError('network', 'Could not reach GitHub')
  }

  if (!response.ok) throw toError(response, user)

  const items = (await response.json()) as Array<RawStar | RawRepo>
  const remaining = response.headers.get('x-ratelimit-remaining')
  return {
    repos: items.map(toStarredRepo),
    lastPage: parseLastPage(response.headers.get('link')),
    remaining: remaining === null ? null : Number(remaining),
  }
}

function toError(response: Response, user: string): GitHubError {
  const { status, headers } = response
  if (status === 404) return new GitHubError('not-found', `No GitHub user named "${user}"`)
  if (status === 401) return new GitHubError('unauthorized', 'GitHub rejected the token')
  const limited = headers.get('x-ratelimit-remaining') === '0' || headers.has('retry-after')
  if (status === 429 || (status === 403 && limited)) {
    const reset = Number(headers.get('x-ratelimit-reset'))
    return new GitHubError('rate-limit', 'GitHub rate limit reached', reset > 0 ? new Date(reset * 1000) : null)
  }
  return new GitHubError('unexpected', `GitHub answered with status ${status}`)
}
