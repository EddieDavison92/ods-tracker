// src/components/PCNsTable.tsx
import { format } from 'date-fns'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { DownloadButton } from "@/components/DownloadButton"
import type { PCN, PCNMemberPractice, PCNMemberHistory } from '@/types/database.types'

interface PCNsTableProps {
  pcns: (PCN & { member_practices?: PCNMemberPractice[] })[]
}

export function PCNsTable({ pcns }: PCNsTableProps) {
  return (
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
                      ?.filter((p: PCNMemberPractice) => p.join_date !== null)
                      .sort((a: PCNMemberPractice, b: PCNMemberPractice) => a.name.localeCompare(b.name))
                      .map((practice: PCNMemberPractice) => (
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
                      ?.filter((p: PCNMemberPractice) => p.history?.length > 0 && p.join_date === null)
                      .sort((a: PCNMemberPractice, b: PCNMemberPractice) => a.name.localeCompare(b.name))
                      .map((practice: PCNMemberPractice) => (
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
  )
} 