/** Clear one-time callback data before loading a wallet SDK or rendering. */
let captured: string | null = null
let captureFailed = false

export function clearCallbackLocation(location: { href: string; replace(path: string): void }): string | null {
  const url = new URL(location.href)
  if (url.pathname !== '/center/callback') return null
  location.replace('/center/callback')
  return url.href
}

if (typeof window !== 'undefined') {
  try {
    captured = clearCallbackLocation({ href: window.location.href, replace: path => window.history.replaceState(null, '', path) })
  } catch { captureFailed = true }
}

export function walletCallbackUrl() {
  if (captureFailed) throw new Error('The sign-in callback could not be cleared safely.')
  // Next may restore its original URL while mounting the route.
  if (window.location.pathname === '/center/callback') window.history.replaceState(null, '', '/center/callback')
  return captured ?? window.location.href
}
