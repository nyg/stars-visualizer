import { describe, expect, it } from 'vitest'
import { EMPTY_FILTER } from './model'
import { formatRoute, parseRoute } from './route'

describe('parseRoute', () => {
  it.each(['', '#', '#/'])('has no user for %j', (hash) => {
    expect(parseRoute(hash)).toEqual({ user: null, filter: EMPTY_FILTER })
  })

  it('reads the user', () => {
    expect(parseRoute('#/octocat')).toEqual({ user: 'octocat', filter: EMPTY_FILTER })
  })

  it('reads every filter', () => {
    // When
    const route = parseRoute('#/octocat?topics=react%2Ccli&lang=C%2B%2B&untagged=1')

    // Then
    expect(route).toEqual({
      user: 'octocat',
      filter: { topics: ['react', 'cli'], language: 'C++', untagged: true },
    })
  })

  it('keeps a user that is not valid percent-encoding', () => {
    expect(parseRoute('#/100%').user).toBe('100%')
  })
})

describe('formatRoute', () => {
  it('points home without a user', () => {
    expect(formatRoute(null, EMPTY_FILTER)).toBe('#/')
  })

  it('leaves out inactive filters', () => {
    expect(formatRoute('octocat', EMPTY_FILTER)).toBe('#/octocat')
  })

  it('round-trips through parseRoute', () => {
    // Given
    const filter = { topics: ['machine-learning', 'c++'], language: 'Jupyter Notebook', untagged: false }

    // When
    const route = parseRoute(formatRoute('octocat', filter))

    // Then
    expect(route).toEqual({ user: 'octocat', filter })
  })
})
