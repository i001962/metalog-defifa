import type { Metadata } from 'next'
import Link from 'next/link'
import { Providers } from '@/providers/Providers'
import { WalletButton } from '@/components/WalletButton'
import './globals.css'

export const metadata: Metadata = { title: { default: 'Metalog', template: '%s | Metalog' }, description: 'Probability markets on Defifa.' }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Providers>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header">
      <Link href="/" className="wordmark">Metalog</Link>
      <nav aria-label="Main"><Link href="/create">Create market</Link><WalletButton /></nav>
    </header>
    <main id="main">{children}</main>
    <footer><a href="https://github.com/BallKidz/defifa" target="_blank" rel="noreferrer">Defifa</a><Link href="/data">Data</Link><Link href="/rules">How it works</Link></footer>
  </Providers></body></html>
}
