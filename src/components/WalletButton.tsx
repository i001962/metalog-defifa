'use client'

import { useWallet } from '@/providers/Providers'

export function WalletButton() {
  const { address, isSigna, connect, disconnect } = useWallet()
  if (!address) return <button type="button" onClick={() => connect()}>Connect</button>
  return <span className="wallet-controls">
    <button type="button" onClick={() => connect()} title={address}>{isSigna ? 'Signa ' : ''}{address.slice(0, 6)}…{address.slice(-4)}</button>
    <button type="button" onClick={() => disconnect()}>Disconnect</button>
  </span>
}
