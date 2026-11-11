import { describe, expect, it, vi } from 'vitest'
import { fetchStars, GitHubError, isValidUsername, parseLastPage, toStarredRepo, type FetchProgress } from './github'

function rawRepo(fullName: string) {
  const [owner = '', name = ''] = fullName.split('/')
  return {
    full_name: fullName,
    name,
    html_url: `https://github.com/${fullName}`,
    description: 'A repository',
    language: 'TypeScript',
    stargazers_count: 42,
    topics: ['cli'],
    archived: false,
    owner: { login: owner, avatar_url: 'https://avatars.example/u/1?v=4' },
  }
}

function rawStar(fullName: string) {
  return { starred_at: '2024-05-06T07:08:09Z', repo: rawRepo(fullName) }
}

function pageResponse(names: string[], lastPage: number, remaining = 50): Response {
  const headers = new Headers({ 'x-ratelimit-remaining': String(remaining) })
  if (lastPage > 1) {
    headers.set('link', `<https://api.github.com/user/1/starred?per_page=100&page=${lastPage}>; rel="last"`)
  }
  return new Response(JSON.stringify(names.map(rawStar)), { status: 200, headers })
}

function rateLimitResponse(resetEpochSeconds: number): Response {
  return new Response('{}', {
    status: 403,
    headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(resetEpochSeconds) },
  })
}

function pageOf(input: RequestInfo | URL): number {
  return Number(new URL(String(input)).searchParams.get('page'))
}

describe('isValidUsername', () => {
  it.each(['octocat', 'a', 'my-user-1', 'A'.repeat(39)])('accepts %s', (user) => {
    expect(isValidUsername(user)).toBe(true)
  })

  it.each(['', '-leading', 'trailing-', 'double--hyphen', 'has space', 'has/slash', 'a'.repeat(40)])(
    'rejects %j',
    (user) => {
      expect(isValidUsername(user)).toBe(false)
    },
  )
})

describe('parseLastPage', () => {
  it('reads the last page from the link header', () => {
    // Given
    const link =
      '<https://api.github.com/user/1/starred?per_page=100&page=2>; rel="next", <https://api.github.com/user/1/starred?per_page=100&page=14>; rel="last"'

    // Then
    expect(parseLastPage(link)).toBe(14)
  })

  it.each([null, '', '<https://api.github.com/user/1/starred?page=1>; rel="first"'])(
    'falls back to a single page for %j',
    (link) => {
      expect(parseLastPage(link)).toBe(1)
    },
  )
})

describe('toStarredRepo', () => {
  it('maps a star with its timestamp', () => {
    // When
    const repo = toStarredRepo(rawStar('octo/tool'))

    // Then
    expect(repo).toEqual({
      fullName: 'octo/tool',
      owner: 'octo',
      name: 'tool',
      url: 'https://github.com/octo/tool',
      avatarUrl: 'https://avatars.example/u/1?v=4',
      description: 'A repository',
      language: 'TypeScript',
      stars: 42,
      topics: ['cli'],
      starredAt: '2024-05-06T07:08:09Z',
      archived: false,
    })
  })

  it('maps a bare repository without a timestamp or topics', () => {
    // Given
    const { topics: _topics, archived: _archived, ...bare } = rawRepo('octo/tool')

    // When
    const repo = toStarredRepo(bare)

    // Then
    expect(repo).toMatchObject({ fullName: 'octo/tool', starredAt: null, topics: [], archived: false })
  })
})

describe('fetchStars', () => {
  it('rejects an invalid username without calling GitHub', async () => {
    // Given
    const fetchFn = vi.fn()

    // When
    const attempt = fetchStars('not valid', { fetchFn })

    // Then
    await expect(attempt).rejects.toMatchObject({ kind: 'invalid-user' })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('collects every page in order', async () => {
    // Given
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => pageResponse([`octo/page-${pageOf(input)}`], 3))

    // When
    const result = await fetchStars('octocat', { fetchFn })

    // Then
    expect(result.repos.map((repo) => repo.name)).toEqual(['page-1', 'page-2', 'page-3'])
    expect(result.partial).toBe(false)
    expect(result.user).toBe('octocat')
  })

  it('reports progress after each page', async () => {
    // Given
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => pageResponse([`octo/page-${pageOf(input)}`], 2))
    const progress: FetchProgress[] = []

    // When
    await fetchStars('octocat', { fetchFn, onProgress: (update) => progress.push(update) })

    // Then
    expect(progress).toEqual([
      { loadedPages: 1, totalPages: 2, loadedRepos: 1 },
      { loadedPages: 2, totalPages: 2, loadedRepos: 2 },
    ])
  })

  it('keeps a repository once when pages overlap', async () => {
    // Given
    const fetchFn = vi.fn(async () => pageResponse(['octo/same'], 2))

    // When
    const result = await fetchStars('octocat', { fetchFn })

    // Then
    expect(result.repos).toHaveLength(1)
  })

  it('stops at the request budget and flags the result as partial', async () => {
    // Given
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => pageResponse([`octo/page-${pageOf(input)}`], 10, 2))

    // When
    const result = await fetchStars('octocat', { fetchFn })

    // Then
    expect(fetchFn).toHaveBeenCalledTimes(3)
    expect(result.repos.map((repo) => repo.name)).toEqual(['page-1', 'page-2', 'page-3'])
    expect(result.partial).toBe(true)
  })

  it('keeps what it has when the rate limit hits halfway', async () => {
    // Given
    const fetchFn = vi.fn(async (input: RequestInfo | URL) =>
      pageOf(input) === 1 ? pageResponse(['octo/page-1'], 5) : rateLimitResponse(1_900_000_000),
    )

    // When
    const result = await fetchStars('octocat', { fetchFn })

    // Then
    expect(result.repos.map((repo) => repo.name)).toEqual(['page-1'])
    expect(result.partial).toBe(true)
  })

  it('reports an unknown user', async () => {
    // Given
    const fetchFn = vi.fn(async () => new Response('{}', { status: 404 }))

    // When
    const attempt = fetchStars('ghost', { fetchFn })

    // Then
    await expect(attempt).rejects.toMatchObject({ kind: 'not-found' })
  })

  it('reports the rate limit with its reset time', async () => {
    // Given
    const fetchFn = vi.fn(async () => rateLimitResponse(1_900_000_000))

    // When
    const attempt = fetchStars('octocat', { fetchFn })

    // Then
    await expect(attempt).rejects.toMatchObject({ kind: 'rate-limit', resetAt: new Date(1_900_000_000_000) })
  })

  it('reports a rejected token', async () => {
    // Given
    const fetchFn = vi.fn(async () => new Response('{}', { status: 401 }))

    // When
    const attempt = fetchStars('octocat', { fetchFn, token: 'bad' })

    // Then
    await expect(attempt).rejects.toMatchObject({ kind: 'unauthorized' })
  })

  it('reports a network failure', async () => {
    // Given
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })

    // When
    const attempt = fetchStars('octocat', { fetchFn })

    // Then
    await expect(attempt).rejects.toBeInstanceOf(GitHubError)
    await expect(attempt).rejects.toMatchObject({ kind: 'network' })
  })

  it('sends the token only when one is given', async () => {
    // Given
    const fetchFn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => pageResponse(['octo/one'], 1))

    // When
    await fetchStars('octocat', { fetchFn })
    await fetchStars('octocat', { fetchFn, token: 'secret' })

    // Then
    const [anonymous, authenticated] = fetchFn.mock.calls.map(([, init]) => init?.headers as Record<string, string>)
    expect(anonymous).not.toHaveProperty('Authorization')
    expect(authenticated).toHaveProperty('Authorization', 'Bearer secret')
  })
})
