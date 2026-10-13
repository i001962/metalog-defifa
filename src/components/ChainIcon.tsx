import arbitrum from '@/assets/chains/arbitrum.svg'
import base from '@/assets/chains/base.svg'
import mainnet from '@/assets/chains/mainnet.svg'
import optimism from '@/assets/chains/optimism.svg'
import { chainForId } from '@/lib/wallet'

// Testnets share their network's icon; the name stays in the tooltip and alt text.
const ICONS: Record<number, { src: string }> = {
  1: mainnet, 11155111: mainnet, 8453: base, 84532: base, 10: optimism, 11155420: optimism, 42161: arbitrum, 421614: arbitrum,
}

export function ChainIcon({ chainId }: { chainId: number }) {
  const name = chainForId(chainId).name
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="chain-icon" src={ICONS[chainId].src} alt={name} title={name} width={18} height={18} />
}
