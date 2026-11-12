import { describe, expect, it, vi } from 'vitest'
import {
  buildAuthorizeUrl,
  codeChallenge,
  exchangeCode,
  fetchViewer,
  parseCallback,
  randomToken,
  readAuthConfig,
  savePending,
  SignInError,
  takePending,
} from './auth'

const config = { clientId: 'client-id', exchangeUrl: 'https://exchange.example/api/token' }
const grant = { code: 'the-code', verifier: 'the-verifier', redirectUri: 'https://octocat.github.io/app/' }

function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
    clear: () => items.clear(),
    key: (index) => [...items.keys()][index] ?? null,
    get length() {
      return items.size
    },
  }
}

describe('readAuthConfig', () => {
  it('reads both settings', () => {
    // Given
    const env = { VITE_GITHUB_CLIENT_ID: ' client-id ', VITE_TOKEN_EXCHANGE_URL: 'https://exchange.example/api/token' }

    // Then
    expect(readAuthConfig(env)).toEqual(config)
  })

  it.each([
    {},
    { VITE_GITHUB_CLIENT_ID: 'client-id' },
    { VITE_TOKEN_EXCHANGE_URL: 'https://exchange.example/api/token' },
    { VITE_GITHUB_CLIENT_ID: '', VITE_TOKEN_EXCHANGE_URL: '' },
  ])('turns sign-in off for %o', (env) => {
    expect(readAuthConfig(env)).toBeNull()
  })
})

describe('randomToken', () => {
  it('is long enough to be a PKCE verifier and safe in a URL', () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('differs on every call', () => {
    expect(randomToken()).not.toBe(randomToken())
  })
})

describe('codeChallenge', () => {
  it('matches the RFC 7636 example', async () => {
    // Given
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'

    // When
    const challenge = await codeChallenge(verifier)

    // Then
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
})

describe('buildAuthorizeUrl', () => {
  it('asks GitHub for a code without any scope', () => {
    // When
    const url = new URL(buildAuthorizeUrl(config, 'https://octocat.github.io/app/', 'the-state', 'the-challenge'))

    // Then
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'client-id',
      redirect_uri: 'https://octocat.github.io/app/',
      state: 'the-state',
      code_challenge: 'the-challenge',
      code_challenge_method: 'S256',
    })
  })
})

describe('parseCallback', () => {
  it('reads the code and state GitHub sends back', () => {
    expect(parseCallback('?code=abc&state=xyz')).toEqual({ kind: 'code', code: 'abc', state: 'xyz' })
  })

  it('recognises a refused sign-in', () => {
    expect(parseCallback('?error=access_denied&state=xyz')).toEqual({ kind: 'denied' })
  })

  it.each(['', '?code=abc', '?state=xyz', '?user=octocat'])('ignores %j', (search) => {
    expect(parseCallback(search)).toBeNull()
  })
})

describe('pending sign-in', () => {
  it('is handed back once', () => {
    // Given
    const storage = memoryStorage()
    const pending = { state: 'the-state', verifier: 'the-verifier', returnHash: '#/octocat' }
    savePending(pending, storage)

    // When
    const first = takePending(storage)
    const second = takePending(storage)

    // Then
    expect(first).toEqual(pending)
    expect(second).toBeNull()
  })

  it('is absent when nothing was started', () => {
    expect(takePending(memoryStorage())).toBeNull()
  })
})

describe('exchangeCode', () => {
  it('returns the token from the exchange service', async () => {
    // Given
    const fetchFn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ access_token: 'gho_token' }),
    )

    // When
    const token = await exchangeCode(config, grant, fetchFn)

    // Then
    expect(token).toBe('gho_token')
    const [url, init] = fetchFn.mock.calls[0] ?? []
    expect(url).toBe(config.exchangeUrl)
    expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
      code: 'the-code',
      code_verifier: 'the-verifier',
      redirect_uri: 'https://octocat.github.io/app/',
    })
  })

  it('explains why GitHub refused', async () => {
    // Given
    const fetchFn = vi.fn(async () => Response.json({ error: 'The code is incorrect or expired.' }, { status: 400 }))

    // When
    const attempt = exchangeCode(config, grant, fetchFn)

    // Then
    await expect(attempt).rejects.toThrow(new SignInError('GitHub sign-in failed: The code is incorrect or expired.'))
  })

  it('fails when the answer is not JSON', async () => {
    // Given
    const fetchFn = vi.fn(async () => new Response('Bad gateway', { status: 502 }))

    // When
    const attempt = exchangeCode(config, grant, fetchFn)

    // Then
    await expect(attempt).rejects.toThrow(new SignInError('GitHub sign-in failed. Try again.'))
  })

  it('fails when the exchange service is unreachable', async () => {
    // Given
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })

    // When
    const attempt = exchangeCode(config, grant, fetchFn)

    // Then
    await expect(attempt).rejects.toThrow(new SignInError('The sign-in service is out of reach. Try again.'))
  })
})

describe('fetchViewer', () => {
  it('reads the signed-in user', async () => {
    // Given
    const fetchFn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ login: 'octocat', avatar_url: 'https://avatars.example/u/1?v=4', id: 1 }),
    )

    // When
    const viewer = await fetchViewer('gho_token', fetchFn)

    // Then
    expect(viewer).toEqual({ login: 'octocat', avatarUrl: 'https://avatars.example/u/1?v=4' })
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer gho_token' })
  })

  it('is empty when GitHub rejects the token', async () => {
    // Given
    const fetchFn = vi.fn(async () => new Response('{}', { status: 401 }))

    // Then
    expect(await fetchViewer('bad', fetchFn)).toBeNull()
  })

  it('is empty when GitHub is unreachable', async () => {
    // Given
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })

    // Then
    expect(await fetchViewer('gho_token', fetchFn)).toBeNull()
  })
})
