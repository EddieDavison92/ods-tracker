import { redirect } from 'next/navigation'
import { pageHref, type Query } from '@/lib/href'

export default async function PracticesPage({ searchParams }: { searchParams: Promise<Query> }) {
  redirect(pageHref('/explore', await searchParams, { group: 'gp' }))
}
