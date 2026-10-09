import { CreateMarket } from '@/components/CreateMarket'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Create market' }

export default function CreatePage() {
  // A dynamic server render supplies one clock value to both SSR and hydration.
  // eslint-disable-next-line react-hooks/purity
  const now = Math.floor(Date.now() / 1000)
  return <CreateMarket now={now} />
}
