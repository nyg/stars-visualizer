import { describe, expect, it } from 'vitest'
import {
  countLanguages,
  countTopics,
  countUntagged,
  EMPTY_FILTER,
  filterRepos,
  formatCount,
  isFilterActive,
  relatedTopics,
  sortRepos,
  toggleTopic,
  type StarredRepo,
} from './model'

function repo(name: string, overrides: Partial<StarredRepo> = {}): StarredRepo {
  return {
    fullName: `owner/${name}`,
    owner: 'owner',
    name,
    url: `https://github.com/owner/${name}`,
    avatarUrl: 'https://avatars.example/u/1',
    description: null,
    language: null,
    stars: 0,
    topics: [],
    starredAt: null,
    archived: false,
    ...overrides,
  }
}

const repos = [
  repo('alpha', { topics: ['react', 'typescript'], language: 'TypeScript', stars: 50, starredAt: '2024-03-01T00:00:00Z' }),
  repo('Bravo', { topics: ['react', 'cli'], language: 'JavaScript', stars: 900, starredAt: '2025-01-01T00:00:00Z' }),
  repo('charlie', { topics: ['cli'], language: 'TypeScript', stars: 10, starredAt: '2023-06-01T00:00:00Z' }),
  repo('delta', { language: 'Go', stars: 300, starredAt: '2022-01-01T00:00:00Z' }),
]

describe('countTopics', () => {
  it('orders topics by frequency, then alphabetically', () => {
    // When
    const counts = countTopics(repos)

    // Then
    expect(counts).toEqual([
      { key: 'cli', count: 2 },
      { key: 'react', count: 2 },
      { key: 'typescript', count: 1 },
    ])
  })
})

describe('countLanguages', () => {
  it('ignores repositories without a language', () => {
    // Given
    const withUnknown = [...repos, repo('echo')]

    // When
    const counts = countLanguages(withUnknown)

    // Then
    expect(counts).toEqual([
      { key: 'TypeScript', count: 2 },
      { key: 'Go', count: 1 },
      { key: 'JavaScript', count: 1 },
    ])
  })
})

describe('countUntagged', () => {
  it('counts repositories without topics', () => {
    expect(countUntagged(repos)).toBe(1)
  })
})

describe('filterRepos', () => {
  it('keeps everything when the filter is empty', () => {
    expect(filterRepos(repos, EMPTY_FILTER)).toHaveLength(4)
  })

  it('requires every selected topic', () => {
    // Given
    const filter = { ...EMPTY_FILTER, topics: ['react', 'cli'] }

    // When
    const matching = filterRepos(repos, filter)

    // Then
    expect(matching.map((match) => match.name)).toEqual(['Bravo'])
  })

  it('combines topics with a language', () => {
    // Given
    const filter = { ...EMPTY_FILTER, topics: ['cli'], language: 'TypeScript' }

    // When
    const matching = filterRepos(repos, filter)

    // Then
    expect(matching.map((match) => match.name)).toEqual(['charlie'])
  })

  it('can ignore the language', () => {
    // Given
    const filter = { ...EMPTY_FILTER, topics: ['cli'], language: 'TypeScript' }

    // When
    const matching = filterRepos(repos, filter, { ignoreLanguage: true })

    // Then
    expect(matching.map((match) => match.name)).toEqual(['Bravo', 'charlie'])
  })

  it('keeps only repositories without topics when untagged is set', () => {
    // Given
    const filter = { ...EMPTY_FILTER, untagged: true }

    // When
    const matching = filterRepos(repos, filter)

    // Then
    expect(matching.map((match) => match.name)).toEqual(['delta'])
  })
})

describe('relatedTopics', () => {
  it('leaves out the selected topics', () => {
    // Given
    const matching = filterRepos(repos, { ...EMPTY_FILTER, topics: ['react'] })

    // When
    const related = relatedTopics(matching, ['react'])

    // Then
    expect(related).toEqual([
      { key: 'cli', count: 1 },
      { key: 'typescript', count: 1 },
    ])
  })

  it('narrows topics down to those containing the query', () => {
    // When
    const related = relatedTopics(repos, [], ' TYPE ')

    // Then
    expect(related).toEqual([{ key: 'typescript', count: 1 }])
  })
})

describe('toggleTopic', () => {
  it('adds a topic that is not selected', () => {
    expect(toggleTopic({ ...EMPTY_FILTER, topics: ['react'] }, 'cli').topics).toEqual(['react', 'cli'])
  })

  it('removes a topic that is already selected', () => {
    expect(toggleTopic({ ...EMPTY_FILTER, topics: ['react', 'cli'] }, 'react').topics).toEqual(['cli'])
  })

  it('leaves the untagged mode', () => {
    expect(toggleTopic({ ...EMPTY_FILTER, untagged: true }, 'react').untagged).toBe(false)
  })
})

describe('isFilterActive', () => {
  it.each([
    [EMPTY_FILTER, false],
    [{ ...EMPTY_FILTER, topics: ['react'] }, true],
    [{ ...EMPTY_FILTER, language: 'Go' }, true],
    [{ ...EMPTY_FILTER, untagged: true }, true],
  ])('reports %o as %s', (filter, expected) => {
    expect(isFilterActive(filter)).toBe(expected)
  })
})

describe('sortRepos', () => {
  it('puts the most recently starred first', () => {
    expect(sortRepos(repos, 'starred').map((sorted) => sorted.name)).toEqual(['Bravo', 'alpha', 'charlie', 'delta'])
  })

  it('puts the most starred first', () => {
    expect(sortRepos(repos, 'stars').map((sorted) => sorted.name)).toEqual(['Bravo', 'delta', 'alpha', 'charlie'])
  })

  it('sorts names without regard to case', () => {
    expect(sortRepos(repos, 'name').map((sorted) => sorted.name)).toEqual(['alpha', 'Bravo', 'charlie', 'delta'])
  })

  it('leaves the input untouched', () => {
    // Given
    const original = repos.map((item) => item.name)

    // When
    sortRepos(repos, 'stars')

    // Then
    expect(repos.map((item) => item.name)).toEqual(original)
  })
})

describe('formatCount', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1k'],
    [1250, '1.2k'],
    [22_140, '22.1k'],
    [255_415, '255k'],
    [1_000_000, '1M'],
    [1_540_000, '1.5M'],
  ])('formats %i as %s', (value, expected) => {
    expect(formatCount(value)).toBe(expected)
  })
})
