'use client'

import { useEffect, useId, useRef } from 'react'
import { formatEther } from 'viem'
import { chainForId } from '@/lib/wallet'
import type { PreparedTransaction } from '@/lib/transaction'

export function TransactionReview({ request, gas, decide }: { request: PreparedTransaction; gas: bigint; decide: (approved: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useId()
  useEffect(() => {
    const element = dialog.current
    const opener = document.activeElement
    element?.showModal()
    return () => { element?.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus() }
  }, [])
  return <dialog ref={dialog} className="transaction-dialog" aria-labelledby={title} onCancel={event => { event.preventDefault(); decide(false) }}>
    <h2 id={title}>{request.title}</h2>
    <dl>
      {request.details.map((detail, index) => <div key={index}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}
      <div><dt>Network</dt><dd>{chainForId(request.chainId).name}</dd></div>
      <div><dt>Payment</dt><dd>{formatEther(request.value)} ETH</dd></div>
      <div><dt>Gas limit</dt><dd>{gas.toString()}</dd></div>
    </dl>
    <details>
      <summary>Transaction</summary>
      <dl>
        <div><dt>From</dt><dd><code>{request.account}</code></dd></div>
        <div><dt>To</dt><dd><code>{request.to}</code></dd></div>
        <div><dt>Calldata</dt><dd><code>{request.data}</code></dd></div>
      </dl>
    </details>
    <div className="actions">
      <button type="button" onClick={() => decide(false)}>Cancel</button>
      <button type="button" onClick={() => decide(true)}>Continue to wallet</button>
    </div>
  </dialog>
}
