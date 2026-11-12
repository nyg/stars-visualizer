const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'

export async function exchange(request, env, fetchFn = fetch) {
  const allowedOrigin = env.ALLOWED_ORIGIN
  if (!allowedOrigin || !env.GITHUB_OAUTH_CLIENT_ID || !env.GITHUB_OAUTH_CLIENT_SECRET) {
    return json(500, { error: 'The token exchange is not configured' })
  }
  if (request.headers.get('origin') !== allowedOrigin) {
    return json(403, { error: 'Origin not allowed' })
  }

  const cors = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' }, cors)

  const form = new URLSearchParams(await request.text())
  const code = form.get('code')
  const codeVerifier = form.get('code_verifier')
  if (!code || !codeVerifier) return json(400, { error: 'Missing code or code_verifier' }, cors)

  let grant
  try {
    const response = await fetchFn(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_OAUTH_CLIENT_ID,
        client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
        code,
        code_verifier: codeVerifier,
        redirect_uri: form.get('redirect_uri') ?? undefined,
      }),
    })
    grant = await response.json()
  } catch {
    return json(502, { error: 'Could not reach GitHub' }, cors)
  }

  if (typeof grant?.access_token !== 'string') {
    return json(400, { error: grant?.error_description ?? grant?.error ?? 'GitHub did not return a token' }, cors)
  }
  return json(200, { access_token: grant.access_token }, cors)
}

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })
}
