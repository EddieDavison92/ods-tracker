// src/app/page.tsx
import { createServerSupabaseClient } from '@/lib/supabase'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Header } from '@/components/Header'
import { PracticesTable } from '@/components/PracticesTable'
import { PCNsTable } from '@/components/PCNsTable'
import { RecentChanges } from '@/components/RecentChanges'
import type { Practice, PCN, TrackedChange } from '@/types/database.types'
import { unstable_noStore as noStore } from 'next/cache'

export default async function Home() {
  // Opt out of caching for the entire page
  noStore()

  const supabase = createServerSupabaseClient()

  // Get practices with PCN details
  const { data: practices = [] } = await supabase
    .from('practices')
    .select('*')
    .order('name')
    .throwOnError() as { data: Practice[] }
  
  // Get last update time
  const lastUpdated = practices.length > 0 
    ? Math.max(...practices.map(p => new Date(p.updated_at).getTime()))
    : null

  // Get PCNs with member practices
  const { data: pcns = [] } = await supabase
    .from('pcns')
    .select(`
      *,
      member_practices:pcn_member_practices(
        ods_code,
        name,
        join_date,
        history
      )
    `)
    .order('name')
    .throwOnError() as { data: PCN[] }

  // Get recent changes
  const { data: recentChanges = [] } = await supabase
    .from('tracked_changes')
    .select('*')
    .order('change_date', { ascending: false })
    .limit(10) as { data: TrackedChange[] }

  // Get PCN names for lookup
  const pcnNameMap = new Map(pcns.map(pcn => [pcn.ods_code, pcn.name]))

  return (
    <div className="container mx-auto px-4 py-6 sm:p-6">
      <Header lastUpdated={lastUpdated} />

      <Tabs defaultValue="practices" className="space-y-4">
        <TabsList>
          <TabsTrigger value="practices">Practices ({practices.length})</TabsTrigger>
          <TabsTrigger value="pcns">PCNs ({pcns.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="practices">
          <PracticesTable practices={practices} pcnNameMap={pcnNameMap} />
        </TabsContent>

        <TabsContent value="pcns">
          <PCNsTable pcns={pcns} />
        </TabsContent>
      </Tabs>

      <RecentChanges changes={recentChanges} />
    </div>
  )
}