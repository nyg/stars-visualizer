import type { Filter } from './model'

export interface Route {
  user: string | null
  filter: Filter
}

export function parseRoute(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?')
  const params = new URLSearchParams(query)
  return {
    user: safeDecode(path).trim() || null,
    filter: {
      topics: (params.get('topics') ?? '').split(',').filter(Boolean),
      language: params.get('lang'),
      untagged: params.has('untagged'),
    },
  }
}

export function formatRoute(user: string | null, filter: Filter): string {
  if (!user) return '#/'
  const params = new URLSearchParams()
  if (filter.topics.length > 0) params.set('topics', filter.topics.join(','))
  if (filter.language !== null) params.set('lang', filter.language)
  if (filter.untagged) params.set('untagged', '1')
  const query = params.toString()
  return `#/${encodeURIComponent(user)}${query ? `?${query}` : ''}`
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
