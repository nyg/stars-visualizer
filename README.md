# Stars Visualizer

Turns the repositories a GitHub user has starred into an animated cloud of topics. Click a topic to list the matching repositories, and keep clicking to narrow down.

## Features

- Topic cloud sized by how many starred repositories carry each topic.
- Drill-down: selecting a topic redraws the cloud with the topics that appear alongside it, and each further selection narrows the list.
- Language bar to filter by primary language, and a shortcut to the repositories without any topic.
- Topic search for everything that does not fit in the cloud.
- Shareable URLs such as `#/octocat?topics=react,cli`, with working back and forward buttons.
- Results cached in the browser for 12 hours.

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

The site calls the public GitHub API straight from the browser, 100 stars per request. Without a token GitHub allows 60 requests per hour per IP address, which covers about 6,000 stars. A personal access token with no permissions raises this to 5,000 requests. The token is kept in the browser's local storage and is only sent to `api.github.com`.
