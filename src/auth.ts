const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'
const VIEWER_URL = 'https://api.github.com/user'
const PENDING_KEY = 'stars-visualizer:v1:sign-in'
const RANDOM_BYTES = 32

export interface AuthConfig {
  clientId: string
  exchangeUrl: string
}

export interface AuthEnv {
  VITE_GITHUB_CLIENT_ID?: string
  VITE_TOKEN_EXCHANGE_URL?: string
}

export interface Viewer {
  login: string
  avatarUrl: string
}

export interface PendingSignIn {
  state: string
  verifier: string
  returnHash: string
}

export type Callback = { kind: 'code'; code: string; state: string } | { kind: 'denied' }

export class SignInError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SignInError'
  }
}

export function readAuthConfig(env: AuthEnv): AuthConfig | null {
  const clientId = env.VITE_GITHUB_CLIENT_ID?.trim()
  const exchangeUrl = env.VITE_TOKEN_EXCHANGE_URL?.trim()
  return clientId && exchangeUrl ? { clientId, exchangeUrl } : null
}

export function randomToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(RANDOM_BYTES)))
}

export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

export function buildAuthorizeUrl(config: AuthConfig, redirectUri: string, state: string, challenge: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  return `${AUTHORIZE_URL}?${params}`
}

export function parseCallback(search: string): Callback | null {
  const params = new URLSearchParams(search)
  if (params.has('error')) return { kind: 'denied' }
  const code = params.get('code')
  const state = params.get('state')
  return code && state ? { kind: 'code', code, state } : null
}

export function savePending(pending: PendingSignIn, storage: Storage = sessionStorage): void {
  storage.setItem(PENDING_KEY, JSON.stringify(pending))
}

export function takePending(storage: Storage = sessionStorage): PendingSignIn | null {
  try {
    const raw = storage.getItem(PENDING_KEY)
    storage.removeItem(PENDING_KEY)
    return raw ? (JSON.parse(raw) as PendingSignIn) : null
  } catch {
    return null
  }
}

export async function exchangeCode(
  config: AuthConfig,
  grant: { code: string; verifier: string; redirectUri: string },
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  let response: Response
  try {
    response = await fetchFn(config.exchangeUrl, {
      method: 'POST',
      body: new URLSearchParams({ code: grant.code, code_verifier: grant.verifier, redirect_uri: grant.redirectUri }),
    })
  } catch {
    throw new SignInError('The sign-in service is out of reach. Try again.')
  }

  const payload = (await response.json().catch(() => ({}))) as { access_token?: unknown; error?: unknown }
  if (!response.ok || typeof payload.access_token !== 'string') {
    const reason = typeof payload.error === 'string' ? `: ${payload.error}` : '. Try again.'
    throw new SignInError(`GitHub sign-in failed${reason}`)
  }
  return payload.access_token
}

export async function fetchViewer(token: string, fetchFn: typeof fetch = fetch): Promise<Viewer | null> {
  try {
    const response = await fetchFn(VIEWER_URL, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
    })
    if (!response.ok) return null
    const user = (await response.json()) as { login: string; avatar_url: string }
    return { login: user.login, avatarUrl: user.avatar_url }
  } catch {
    return null
  }
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
