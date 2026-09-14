import { redirect } from 'next/navigation'
import { pageHref, type Query } from '@/lib/href'

export default async function PcnsPage({ searchParams }: { searchParams: Promise<Query> }) {
  redirect(pageHref('/explore', await searchParams, { group: 'pcn' }))
}
