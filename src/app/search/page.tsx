import { redirect } from 'next/navigation'
import { pageHref, type Query } from '@/lib/href'

// Search is part of Explore.
export default async function SearchPage({ searchParams }: { searchParams: Promise<Query> }) {
  redirect(pageHref('/explore', await searchParams, { role: null }))
}
