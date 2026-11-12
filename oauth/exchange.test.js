import { describe, expect, it, vi } from 'vitest'
import { exchange } from './exchange.js'

const ORIGIN = 'https://octocat.github.io'
const env = {
  ALLOWED_ORIGIN: ORIGIN,
  GITHUB_OAUTH_CLIENT_ID: 'client-id',
  GITHUB_OAUTH_CLIENT_SECRET: 'client-secret',
}

function request({ method = 'POST', origin = ORIGIN, body = { code: 'the-code', code_verifier: 'the-verifier' } } = {}) {
  return new Request('https://exchange.example/api/token', {
    method,
    headers: origin ? { Origin: origin } : {},
    body: method === 'POST' ? new URLSearchParams(body) : undefined,
  })
}

function githubAnswers(payload) {
  return vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))
}

describe('exchange', () => {
  it('returns the access token GitHub grants', async () => {
    // Given
    const fetchFn = githubAnswers({ access_token: 'gho_token', token_type: 'bearer', scope: '' })

    // When
    const response = await exchange(request(), env, fetchFn)

    // Then
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ access_token: 'gho_token' })
  })

  it('sends the code, the verifier and the secret to GitHub', async () => {
    // Given
    const fetchFn = githubAnswers({ access_token: 'gho_token' })
    const body = { code: 'the-code', code_verifier: 'the-verifier', redirect_uri: `${ORIGIN}/app/` }

    // When
    await exchange(request({ body }), env, fetchFn)

    // Then
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://github.com/login/oauth/access_token')
    expect(JSON.parse(init.body)).toEqual({
      client_id: 'client-id',
      client_secret: 'client-secret',
      code: 'the-code',
      code_verifier: 'the-verifier',
      redirect_uri: `${ORIGIN}/app/`,
    })
  })

  it('lets the allowed origin read the answer and forbids caching it', async () => {
    // When
    const response = await exchange(request(), env, githubAnswers({ access_token: 'gho_token' }))

    // Then
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it.each(['https://evil.example', null])('refuses origin %s without calling GitHub', async (origin) => {
    // Given
    const fetchFn = githubAnswers({ access_token: 'gho_token' })

    // When
    const response = await exchange(request({ origin }), env, fetchFn)

    // Then
    expect(response.status).toBe(403)
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it.each(['ALLOWED_ORIGIN', 'GITHUB_OAUTH_CLIENT_ID', 'GITHUB_OAUTH_CLIENT_SECRET'])(
    'reports a missing %s setting',
    async (setting) => {
      // Given
      const incomplete = { ...env, [setting]: undefined }

      // When
      const response = await exchange(request(), incomplete, githubAnswers({}))

      // Then
      expect(response.status).toBe(500)
    },
  )

  it('answers a preflight request', async () => {
    // When
    const response = await exchange(request({ method: 'OPTIONS' }), env, githubAnswers({}))

    // Then
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-methods')).toContain('POST')
  })

  it('rejects other methods', async () => {
    // When
    const response = await exchange(request({ method: 'GET' }), env, githubAnswers({}))

    // Then
    expect(response.status).toBe(405)
  })

  it.each([{ code: 'the-code' }, { code_verifier: 'the-verifier' }, {}])(
    'rejects an incomplete body %o',
    async (body) => {
      // Given
      const fetchFn = githubAnswers({ access_token: 'gho_token' })

      // When
      const response = await exchange(request({ body }), env, fetchFn)

      // Then
      expect(response.status).toBe(400)
      expect(fetchFn).not.toHaveBeenCalled()
    },
  )

  it('passes on the reason when GitHub refuses the code', async () => {
    // Given
    const fetchFn = githubAnswers({ error: 'bad_verification_code', error_description: 'The code is incorrect or expired.' })

    // When
    const response = await exchange(request(), env, fetchFn)

    // Then
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'The code is incorrect or expired.' })
  })

  it('never returns the client secret', async () => {
    // Given
    const fetchFn = githubAnswers({ error: 'incorrect_client_credentials' })

    // When
    const response = await exchange(request(), env, fetchFn)

    // Then
    expect(await response.text()).not.toContain('client-secret')
  })

  it('reports GitHub being unreachable', async () => {
    // Given
    const fetchFn = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })

    // When
    const response = await exchange(request(), env, fetchFn)

    // Then
    expect(response.status).toBe(502)
  })
})
