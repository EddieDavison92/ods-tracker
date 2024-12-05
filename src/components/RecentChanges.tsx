// src/components/RecentChanges.tsx
import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from "@/lib/utils"
import type { TrackedChange } from '@/types/database.types'

interface RecentChangesProps {
  changes: TrackedChange[]
}

export function RecentChanges({ changes }: RecentChangesProps) {
  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>Recent Changes</CardTitle>
      </CardHeader>
      <CardContent>
        {changes.length > 0 ? (
          <div className="space-y-6">
            {changes.map(change => (
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
  )
} 