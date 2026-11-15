export interface HitEnv {
   VITE_HIT_URL?: string
}

export interface PageView {
   path: string
   title: string
   referrer: string
   screen: string
}

export function hitUrl(env: HitEnv, view: PageView): string | null {
   const endpoint = env.VITE_HIT_URL?.trim()
   if (!endpoint) {
      return null
   }
   const params = new URLSearchParams({ p: view.path, t: view.title, r: view.referrer, s: view.screen })
   return `${endpoint}?${params}`
}

export function countPageView(env: HitEnv): void {
   const url = hitUrl(env, {
      // The query string stays out: after a GitHub sign-in it holds the one-time code.
      path: location.pathname,
      title: document.title,
      referrer: document.referrer,
      screen: `${screen.width},${screen.height},${devicePixelRatio}`,
   })
   if (url) {
      void fetch(url, { method: 'POST', keepalive: true, mode: 'no-cors' }).catch(() => {})
   }
}
