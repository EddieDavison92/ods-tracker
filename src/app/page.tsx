import { createServerSupabaseClient } from '@/lib/supabase'
import UpdateButton from '@/components/UpdateButton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from "@/components/ui/scroll-area"
import { format } from 'date-fns'
import type { 
  Practice, 
  PCN, 
  TrackedChange, 
  PCNMemberPractice, 
  PCNMemberHistory 
} from '@/types/database.types'
import { DownloadButton } from "@/components/DownloadButton"

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata = {
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate'
  }
}

export default async function Home() {
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
    .throwOnError() as { 
      data: (PCN & { 
        member_practices: PCNMemberPractice[] 
      })[] 
    }

  // Get recent changes
  const { data: recentChanges = [] } = await supabase
    .from('tracked_changes')
    .select('*')
    .order('change_date', { ascending: false })
    .limit(10) as { data: TrackedChange[] }

  // Get PCN names for lookup
  const pcnNameMap = new Map(pcns.map(pcn => [pcn.ods_code, pcn.name]))

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">NCL Practice Tracker</h1>
            <p className="text-lg text-muted-foreground mt-2">
              Tracking changes to GP Practices and Primary Care Networks (PCNs) 
              in North Central London using NHS Digital ODS data.
            </p>
            {lastUpdated && (
              <p className="text-sm text-muted-foreground mt-2">
                Last updated: {format(new Date(lastUpdated), 'dd/MM/yyyy HH:mm')}
              </p>
            )}
          </div>
          <UpdateButton />
        </div>
      </div>

      <Tabs defaultValue="practices" className="space-y-4">
        <TabsList>
          <TabsTrigger value="practices">Practices ({practices.length})</TabsTrigger>
          <TabsTrigger value="pcns">PCNs ({pcns.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="practices">
          <Card>
            <CardHeader>
              <CardTitle>GP Practices</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[250px] text-xs">Name</TableHead>
                      <TableHead className="w-[100px] text-xs">ODS Code</TableHead>
                      <TableHead className="w-[80px] text-xs">Status</TableHead>
                      <TableHead className="w-[200px] text-xs">PCN</TableHead>
                      <TableHead className="w-[200px] text-xs">Address</TableHead>
                      <TableHead className="w-[100px] text-xs">UPRN</TableHead>
                      <TableHead className="w-[150px] text-xs">Contact</TableHead>
                      <TableHead className="w-[150px] text-xs">Dates</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {practices.map(practice => (
                      <TableRow key={practice.ods_code} className="text-xs">
                        <TableCell className="font-medium">{practice.name}</TableCell>
                        <TableCell>{practice.ods_code}</TableCell>
                        <TableCell>{practice.status}</TableCell>
                        <TableCell>
                          {practice.current_pcn_code && (
                            <>
                              {pcnNameMap.get(practice.current_pcn_code)}
                              <span className="text-muted-foreground">
                                {' '}({practice.current_pcn_code})
                              </span>
                            </>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {practice.address_lines}
                          {practice.postcode && <span className="ml-1">{practice.postcode}</span>}
                        </TableCell>
                        <TableCell>{practice.uprn || '-'}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {practice.phone && <div className="whitespace-nowrap">{practice.phone}</div>}
                          {practice.email && <div className="whitespace-nowrap">{practice.email}</div>}
                          {practice.website && <div className="whitespace-nowrap">{practice.website}</div>}
                        </TableCell>
                        <TableCell>
                          {practice.roles?.find(r => r.id === 'RO76')?.Date?.find(d => d.Type === 'Operational')?.Start && (
                            <div>Started: {format(
                              new Date(practice.roles.find(r => r.id === 'RO76')!.Date.find(d => d.Type === 'Operational')!.Start!), 
                              'dd/MM/yyyy'
                            )}</div>
                          )}
                          <div>Updated: {format(new Date(practice.last_changed), 'dd/MM/yyyy')}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
              <DownloadButton 
                data={practices.map(practice => ({
                  ...practice,
                  roles: JSON.stringify(practice.roles),
                  relationships: JSON.stringify(practice.relationships),
                  // Format dates
                  created_at: format(new Date(practice.created_at), 'dd/MM/yyyy HH:mm'),
                  updated_at: format(new Date(practice.updated_at), 'dd/MM/yyyy HH:mm'),
                  last_changed: format(new Date(practice.last_changed), 'dd/MM/yyyy'),
                  operational_start: practice.operational_start ? 
                    format(new Date(practice.operational_start), 'dd/MM/yyyy') : '',
                  operational_end: practice.operational_end ? 
                    format(new Date(practice.operational_end), 'dd/MM/yyyy') : '',
                  legal_start: practice.legal_start ? 
                    format(new Date(practice.legal_start), 'dd/MM/yyyy') : '',
                  legal_end: practice.legal_end ? 
                    format(new Date(practice.legal_end), 'dd/MM/yyyy') : ''
                }))} 
                filename="ncl-practices" 
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pcns">
          <Card>
            <CardHeader>
              <CardTitle>Primary Care Networks</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px] text-xs">Name</TableHead>
                      <TableHead className="w-[100px] text-xs">ODS Code</TableHead>
                      <TableHead className="w-[80px] text-xs">Status</TableHead>
                      <TableHead className="w-[80px] text-xs">Member Count</TableHead>
                      <TableHead className="w-[300px] text-xs">Current Members</TableHead>
                      <TableHead className="w-[300px] text-xs">Previous Members</TableHead>
                      <TableHead className="w-[200px] text-xs">Address</TableHead>
                      <TableHead className="w-[100px] text-xs">UPRN</TableHead>
                      <TableHead className="w-[150px] text-xs">Dates</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pcns.map(pcn => (
                      <TableRow key={pcn.ods_code} className="text-xs">
                        <TableCell className="font-medium">{pcn.name}</TableCell>
                        <TableCell>{pcn.ods_code}</TableCell>
                        <TableCell>{pcn.status}</TableCell>
                        <TableCell>{pcn.member_count}</TableCell>
                        <TableCell>
                          {pcn.member_practices
                            ?.filter(p => p.join_date !== null)
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map(practice => (
                              <div key={practice.ods_code} className="whitespace-nowrap">
                                {practice.name}
                                <span className="text-muted-foreground">
                                  {' '}({practice.ods_code})
                                </span>
                                <span className="text-muted-foreground ml-1">
                                  from {format(new Date(practice.join_date!), 'dd/MM/yyyy')}
                                </span>
                              </div>
                            ))}
                          {!pcn.member_practices?.some(p => p.join_date !== null) && (
                            <span className="text-muted-foreground">No current members</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {pcn.member_practices
                            ?.filter(p => p.history?.length > 0 && p.join_date === null)
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map(practice => (
                              <div key={practice.ods_code} className="whitespace-nowrap mb-2">
                                <div>
                                  {practice.name}
                                  <span className="text-muted-foreground">
                                    {' '}({practice.ods_code})
                                  </span>
                                </div>
                                <div className="text-muted-foreground ml-4 text-xs">
                                  {practice.history.map((period: PCNMemberHistory, i: number) => (
                                    <div key={i}>
                                      Member from {period.start && format(new Date(period.start), 'dd/MM/yyyy')}
                                      {' until '} 
                                      {period.end && format(new Date(period.end), 'dd/MM/yyyy')}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          {!pcn.member_practices?.some(p => p.history?.length > 0 && p.join_date === null) && (
                            <span className="text-muted-foreground">No previous members</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {pcn.address_lines}
                          {pcn.postcode && <span className="ml-1">{pcn.postcode}</span>}
                        </TableCell>
                        <TableCell>{pcn.uprn || '-'}</TableCell>
                        <TableCell>
                          {pcn.operational_start && 
                            <div>Started: {format(new Date(pcn.operational_start), 'dd/MM/yyyy')}</div>
                          }
                          <div>Updated: {format(new Date(pcn.last_changed), 'dd/MM/yyyy')}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
              <DownloadButton 
                data={pcns.map(pcn => ({
                  ...pcn,
                  roles: JSON.stringify(pcn.roles),
                  relationships: JSON.stringify(pcn.relationships),
                  member_practices: JSON.stringify(pcn.member_practices),
                  // Format dates
                  created_at: format(new Date(pcn.created_at), 'dd/MM/yyyy HH:mm'),
                  updated_at: format(new Date(pcn.updated_at), 'dd/MM/yyyy HH:mm'),
                  last_changed: format(new Date(pcn.last_changed), 'dd/MM/yyyy'),
                  operational_start: pcn.operational_start ? 
                    format(new Date(pcn.operational_start), 'dd/MM/yyyy') : '',
                  operational_end: pcn.operational_end ? 
                    format(new Date(pcn.operational_end), 'dd/MM/yyyy') : '',
                  legal_start: pcn.legal_start ? 
                    format(new Date(pcn.legal_start), 'dd/MM/yyyy') : '',
                  legal_end: pcn.legal_end ? 
                    format(new Date(pcn.legal_end), 'dd/MM/yyyy') : ''
                }))} 
                filename="ncl-pcns" 
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Recent Changes</CardTitle>
        </CardHeader>
        <CardContent>
          {recentChanges.length > 0 ? (
            <div className="space-y-4">
              {recentChanges.map(change => (
                <div key={change.id} className="flex gap-4">
                  <div className="w-32 text-sm text-muted-foreground">
                    {format(new Date(change.change_date), 'dd/MM/yyyy HH:mm')}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{change.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {change.change_type.replace(/_/g, ' ')} - {change.ods_code}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No changes have been tracked yet. Changes will appear here after updates are made.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}