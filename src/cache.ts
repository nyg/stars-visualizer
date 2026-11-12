import type { Viewer } from './auth'
import type { StarsResult } from './github'

const RESULT_PREFIX = 'stars-visualizer:v1:stars:'
const TOKEN_KEY = 'stars-visualizer:v1:token'
const VIEWER_KEY = 'stars-visualizer:v1:viewer'
const TIME_TO_LIVE_MS = 12 * 60 * 60 * 1000

export function loadCached(user: string, now = Date.now()): StarsResult | null {
  try {
    const raw = localStorage.getItem(resultKey(user))
    if (!raw) return null
    const result = JSON.parse(raw) as StarsResult
    return now - result.fetchedAt < TIME_TO_LIVE_MS ? result : null
  } catch {
    return null
  }
}

export function saveCached(result: StarsResult): void {
  const value = JSON.stringify(result)
  try {
    localStorage.setItem(resultKey(result.user), value)
  } catch {
    clearResults()
    try {
      localStorage.setItem(resultKey(result.user), value)
    } catch {
      return
    }
  }
}

export function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function saveToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    return
  }
}

export function loadViewer(): Viewer | null {
  try {
    const raw = localStorage.getItem(VIEWER_KEY)
    return raw ? (JSON.parse(raw) as Viewer) : null
  } catch {
    return null
  }
}

export function saveViewer(viewer: Viewer | null): void {
  try {
    if (viewer) localStorage.setItem(VIEWER_KEY, JSON.stringify(viewer))
    else localStorage.removeItem(VIEWER_KEY)
  } catch {
    return
  }
}

function resultKey(user: string): string {
  return RESULT_PREFIX + user.toLowerCase()
}

function clearResults(): void {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(RESULT_PREFIX))
      .forEach((key) => localStorage.removeItem(key))
  } catch {
    return
  }
}
