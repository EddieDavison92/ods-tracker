import { timingSafeEqual } from 'node:crypto'
import { revalidateTag } from 'next/cache'
import { ODS_TAG } from '@/lib/api'

// Called by the Worker after each sync so cached API data is refetched on the next visit.
// POST with "Authorization: Bearer <REVALIDATE_TOKEN>".
export async function POST(request: Request) {
  const expected = process.env.REVALIDATE_TOKEN
  const given = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const ok = !!expected && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  if (!ok) return Response.json({ error: 'unauthorised' }, { status: 401 })
  // 'max': the next visitor gets the cached copy while fresh data loads in the background.
  revalidateTag(ODS_TAG, 'max')
  return Response.json({ revalidated: true, now: Date.now() })
}
