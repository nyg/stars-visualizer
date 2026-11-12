# Stars Visualizer

Turns the repositories a GitHub user has starred into an animated cloud of topics. Click a topic to list the matching repositories, and keep clicking to narrow down.

## Features

- Topic cloud sized by how many starred repositories carry each topic.
- Drill-down: selecting a topic redraws the cloud with the topics that appear alongside it, and each further selection narrows the list.
- Language bar to filter by primary language, and a shortcut to the repositories without any topic.
- Topic search for everything that does not fit in the cloud.
- Shareable URLs such as `#/octocat?topics=react,cli`, with working back and forward buttons.
- Results cached in the browser for 12 hours.
- Optional sign-in with GitHub, or a pasted personal access token, to lift the anonymous rate limit.

## Development

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

## Deploying to GitHub Pages

The workflow in `.github/workflows/deploy.yml` tests, builds and publishes the site on every push to the default branch. In the repository settings, open **Pages** and set **Source** to **GitHub Actions** once.

The build uses relative asset paths, so it works under any repository name or custom domain.

## GitHub API limits

The site calls the public GitHub API straight from the browser, 100 stars per request. Anonymous visitors get 60 requests per hour per IP address, which covers about 6,000 stars. Signing in with GitHub, or pasting a personal access token with no permissions, raises this to 5,000 requests per hour. Either way the access token is kept in the browser's local storage and is only sent to `api.github.com`.

## Sign in with GitHub

Sign-in is optional. Without the two build settings below the button stays hidden and only the personal access token field is offered.

GitHub will not hand a token to a browser directly: the last step of its OAuth flow needs a client secret and refuses cross-origin calls. That one step runs in a small Vercel Function in `oauth/`. The site sends it the one-time sign-in code, the function adds the secret and returns the token. It stores nothing.

### 1. Register an OAuth App

On GitHub, go to **Settings → Developer settings → OAuth Apps → New OAuth App**.

- **Homepage URL** and **Redirect URI**: the address of the deployed site, for example `https://octocat.github.io/stars-visualizer/`.
- **Expire user access tokens**: uncheck it. The site keeps a single access token and does not refresh it, so an expiring token would end the sign-in after eight hours.

Note the **Client ID** and generate a **client secret**. The app asks for no scopes, so a signed-in visitor grants read access to public data only.

### 2. Deploy the function

Create a Vercel project from this repository with **Root Directory** set to `oauth` and the framework preset **Other**. Add three environment variables:

| Name | Value |
| --- | --- |
| `GITHUB_OAUTH_CLIENT_ID` | the Client ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | the client secret |
| `ALLOWED_ORIGIN` | the origin of the site, for example `https://octocat.github.io` |

The function answers at `https://<project>.vercel.app/api/token` and only to requests coming from `ALLOWED_ORIGIN`.

### 3. Point the site at it

Add two repository variables under **Settings → Secrets and variables → Actions → Variables**, then run the deploy workflow again:

| Name | Value |
| --- | --- |
| `OAUTH_CLIENT_ID` | the Client ID |
| `TOKEN_EXCHANGE_URL` | `https://<project>.vercel.app/api/token` |

For a local build, copy `.env.example` to `.env.local` and fill in the same two values. Sign-in only completes on an address that is both registered as a redirect URI in step 1 and allowed by the function's `ALLOWED_ORIGIN`.
