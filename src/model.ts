export interface StarredRepo {
  fullName: string
  owner: string
  name: string
  url: string
  avatarUrl: string
  description: string | null
  language: string | null
  stars: number
  topics: string[]
  starredAt: string | null
  archived: boolean
}

export interface Filter {
  topics: string[]
  language: string | null
  untagged: boolean
}

export interface Count {
  key: string
  count: number
}

export type SortKey = 'starred' | 'stars' | 'name'

export const EMPTY_FILTER: Filter = { topics: [], language: null, untagged: false }

export function isFilterActive(filter: Filter): boolean {
  return filter.topics.length > 0 || filter.language !== null || filter.untagged
}

export function toggleTopic(filter: Filter, topic: string): Filter {
  const topics = filter.topics.includes(topic)
    ? filter.topics.filter((selected) => selected !== topic)
    : [...filter.topics, topic]
  return { ...filter, topics, untagged: false }
}

export function countTopics(repos: StarredRepo[]): Count[] {
  return tally(repos.flatMap((repo) => repo.topics))
}

export function countLanguages(repos: StarredRepo[]): Count[] {
  return tally(repos.flatMap((repo) => (repo.language ? [repo.language] : [])))
}

export function countUntagged(repos: StarredRepo[]): number {
  return repos.filter((repo) => repo.topics.length === 0).length
}

export function filterRepos(
  repos: StarredRepo[],
  filter: Filter,
  options: { ignoreLanguage?: boolean } = {},
): StarredRepo[] {
  return repos.filter((repo) => {
    if (filter.untagged && repo.topics.length > 0) return false
    if (!filter.topics.every((topic) => repo.topics.includes(topic))) return false
    if (!options.ignoreLanguage && filter.language !== null && repo.language !== filter.language) return false
    return true
  })
}

export function relatedTopics(repos: StarredRepo[], selected: string[], query = ''): Count[] {
  const needle = query.trim().toLowerCase()
  return countTopics(repos).filter(
    ({ key }) => !selected.includes(key) && (needle === '' || key.toLowerCase().includes(needle)),
  )
}

export function sortRepos(repos: StarredRepo[], sort: SortKey): StarredRepo[] {
  const sorted = [...repos]
  if (sort === 'stars') return sorted.sort((a, b) => b.stars - a.stars)
  if (sort === 'name') return sorted.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
  return sorted.sort((a, b) => (b.starredAt ?? '').localeCompare(a.starredAt ?? ''))
}

export function formatCount(value: number): string {
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return `${trimDecimal(value / 1_000, value < 100_000)}k`
  return `${trimDecimal(value / 1_000_000, true)}M`
}

function trimDecimal(value: number, keepDecimal: boolean): string {
  if (!keepDecimal) return String(Math.floor(value))
  return (Math.floor(value * 10) / 10).toFixed(1).replace(/\.0$/, '')
}

function tally(keys: string[]): Count[] {
  const counts = new Map<string, number>()
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1)
  return [...counts]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}
