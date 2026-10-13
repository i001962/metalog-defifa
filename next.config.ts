import type { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'

export default function config(phase: string): NextConfig {
  return {
    output: 'standalone',
    outputFileTracingRoot: process.cwd(),
    poweredByHeader: false,
    reactStrictMode: true,
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
    allowedDevOrigins: ['127.0.0.1'],
    // Design iteration: `npm run dev:live` serves market data from production, so local pages load live games
    // without spending Center's public-origin rate limit. Development server only.
    async rewrites() {
      const live = phase === PHASE_DEVELOPMENT_SERVER ? process.env.METALOG_DEV_API : undefined
      return { beforeFiles: live ? [{ source: '/api/markets/:path*', destination: `${new URL(live).origin}/api/markets/:path*` }] : [], afterFiles: [], fallback: [] }
    },
    async headers() {
      return [
        { source: '/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }] },
        { source: '/center/callback', headers: [{ key: 'Cache-Control', value: 'no-store' }, { key: 'Referrer-Policy', value: 'no-referrer' }] },
      ]
    },
  }
}
