// src/components/Header.tsx
import Image from 'next/image'
import { format } from 'date-fns'
import UpdateButton from '@/components/UpdateButton'

interface HeaderProps {
  lastUpdated: number | null
}

export function Header({ lastUpdated }: HeaderProps) {
  return (
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
  )
} 