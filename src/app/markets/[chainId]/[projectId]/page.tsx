import { notFound } from 'next/navigation'
import { MarketView } from '@/components/MarketView'
import { SUPPORTED_CHAINS } from '@/lib/wallet'

export default async function MarketPage({ params }: { params: Promise<{ chainId: string; projectId: string }> }) {
  const { chainId, projectId } = await params
  if (!SUPPORTED_CHAINS.some(chain => chain.id === Number(chainId)) || !/^[1-9]\d{0,76}$/.test(projectId)) notFound()
  return <MarketView chainId={Number(chainId)} projectId={projectId} />
}
