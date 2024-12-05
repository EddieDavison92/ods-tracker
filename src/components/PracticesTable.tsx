// src/components/PracticesTable.tsx
import { format } from 'date-fns'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { DownloadButton } from "@/components/DownloadButton"
import type { Practice } from '@/types/database.types'

interface PracticesTableProps {
  practices: Practice[]
  pcnNameMap: Map<string, string>
}

export function PracticesTable({ practices, pcnNameMap }: PracticesTableProps) {
  return (
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
  )
} 