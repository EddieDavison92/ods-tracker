import { createServerSupabaseClient } from '@/lib/supabase'
import UpdateButton from '@/components/UpdateButton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { format } from 'date-fns'
import type { 
  Practice, 
  PCN, 
  TrackedChange, 
  PCNMemberPractice, 
  PCNMemberHistory 
} from '@/types/database.types'
import { DownloadButton } from "@/components/DownloadButton"
import { cn } from "@/lib/utils"
import Image from 'next/image'

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
    <div className="container mx-auto px-4 py-6 sm:p-6">
      <div className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div className="space-y-4">
            <div className="flex flex-col items-start gap-4">
              <Image 
                src="/logo.jpg" 
                alt="NCL Logo" 
                width={200}
                height={64}
                priority
                className="h-16 w-auto"
              />
              <h1 className="text-4xl font-bold tracking-tight">NCL Practice Tracker</h1>
            </div>
            <p className="text-lg text-muted-foreground">
              Tracking changes to GP Practices and Primary Care Networks (PCNs) 
              in North Central London using NHS Digital ODS data.
            </p>
            {lastUpdated && (
              <p className="text-sm text-muted-foreground">
                Last updated: {format(new Date(lastUpdated), 'dd/MM/yyyy HH:mm')}
              </p>
            )}
          </div>
          <div className="mt-4 sm:mt-0">
            <UpdateButton />
          </div>
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
              <ScrollArea className="h-[600px] border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[250px] text-xs">Name</TableHead>
                      <TableHead className="min-w-[100px] text-xs">ODS Code</TableHead>
                      <TableHead className="min-w-[80px] text-xs">Status</TableHead>
                      <TableHead className="min-w-[200px] text-xs">PCN</TableHead>
                      <TableHead className="min-w-[200px] text-xs">Address</TableHead>
                      <TableHead className="min-w-[100px] text-xs">UPRN</TableHead>
                      <TableHead className="min-w-[150px] text-xs">Contact</TableHead>
                      <TableHead className="min-w-[150px] text-xs">Dates</TableHead>
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
                <ScrollBar orientation="horizontal" />
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
              <ScrollArea className="h-[600px] border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px] text-xs">Name</TableHead>
                      <TableHead className="min-w-[100px] text-xs">ODS Code</TableHead>
                      <TableHead className="min-w-[80px] text-xs">Status</TableHead>
                      <TableHead className="min-w-[80px] text-xs">Member Count</TableHead>
                      <TableHead className="min-w-[300px] text-xs">Current Members</TableHead>
                      <TableHead className="min-w-[300px] text-xs">Previous Members</TableHead>
                      <TableHead className="min-w-[200px] text-xs">Address</TableHead>
                      <TableHead className="min-w-[100px] text-xs">UPRN</TableHead>
                      <TableHead className="min-w-[150px] text-xs">Dates</TableHead>
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
                <ScrollBar orientation="horizontal" />
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
            <div className="space-y-6">
              {recentChanges.map(change => (
                <div key={change.id} className="flex gap-4">
                  <div className="w-24 text-sm text-muted-foreground">
                    {format(new Date(change.change_date), 'dd/MM/yyyy')}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-2">
                      {change.name}
                      <span className="text-xs text-muted-foreground">({change.ods_code})</span>
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        {
                          'bg-green-100 text-green-700': change.change_type === 'new_practice',
                          'bg-red-100 text-red-700': change.change_type === 'practice_closed',
                          'bg-blue-100 text-blue-700': change.change_type === 'pcn_change',
                          'bg-orange-100 text-orange-700': change.change_type === 'status_change',
                          'bg-gray-100 text-gray-700': change.change_type === 'details_change',
                        }
                      )}>
                        {change.change_type.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="mt-1 text-sm">
                      {change.change_type === 'pcn_change' && (
                        <div className="text-muted-foreground">
                          PCN changed from{' '}
                          <span className="font-medium">{(change.old_value as { pcn_code: string })?.pcn_code || 'none'}</span>
                          {' '}to{' '}
                          <span className="font-medium">{(change.new_value as { pcn_code: string })?.pcn_code || 'none'}</span>
                        </div>
                      )}
                      {change.change_type === 'status_change' && (
                        <div className="text-muted-foreground">
                          Status changed from{' '}
                          <span className="font-medium">{(change.old_value as { status: string })?.status}</span>
                          {' '}to{' '}
                          <span className="font-medium">{(change.new_value as { status: string })?.status}</span>
                        </div>
                      )}
                      {change.change_type === 'details_change' && (
                        <div className="space-y-1 text-muted-foreground">
                          {Object.entries(change.new_value as Record<string, string>).map(([field, value]) => (
                            <div key={field}>
                              {field.charAt(0).toUpperCase() + field.slice(1)} changed from{' '}
                              <span className="font-medium">
                                {(change.old_value as Record<string, string>)?.[field] || 'none'}
                              </span>
                              {' '}to{' '}
                              <span className="font-medium">{value || 'none'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {change.change_type === 'new_practice' && (
                        <div className="text-muted-foreground">
                          New practice added to ODS
                        </div>
                      )}
                      {change.change_type === 'practice_closed' && (
                        <div className="text-muted-foreground">
                          Practice removed from ODS
                        </div>
                      )}
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