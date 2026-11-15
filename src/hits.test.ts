import { describe, expect, it } from 'vitest'

import { hitUrl } from './hits'

const view = { path: '/stars-visualizer/', title: 'Stars Visualizer', referrer: 'https://github.com/', screen: '1440,900,2' }

describe('hitUrl', () => {
   it('adds the page view to the endpoint', () => {
      // Given
      const env = { VITE_HIT_URL: ' https://hits.example/hit ' }

      // When
      const url = new URL(hitUrl(env, view) ?? '')

      // Then
      expect(url.origin + url.pathname).toBe('https://hits.example/hit')
      expect(Object.fromEntries(url.searchParams)).toEqual({
         p: '/stars-visualizer/',
         t: 'Stars Visualizer',
         r: 'https://github.com/',
         s: '1440,900,2',
      })
   })

   it.each([{}, { VITE_HIT_URL: '' }, { VITE_HIT_URL: '  ' }])('counts nothing for %o', (env) => {
      expect(hitUrl(env, view)).toBeNull()
   })
})
