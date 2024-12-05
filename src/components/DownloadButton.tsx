// src/components/DownloadButton.tsx
'use client'

import { Button } from "@/components/ui/button"
import { DownloadIcon } from "@radix-ui/react-icons"

interface DownloadButtonProps<T extends Record<string, unknown>> {
  data: T[]
  filename: string
}

export function DownloadButton<T extends Record<string, unknown>>({ 
  data, 
  filename 
}: DownloadButtonProps<T>) {
  const downloadCSV = () => {
    // Convert object to CSV
    const headers = Object.keys(data[0])
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header]
          // Handle different value types
          if (value === null || value === undefined) return ''
          if (typeof value === 'object') {
            // Convert JSON objects to formatted string
            return `"${JSON.stringify(value, null, 2).replace(/"/g, '""')}"`
          }
          if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
            return `"${value.replace(/"/g, '""')}"`
          }
          return value
        }).join(',')
      )
    ].join('\n')

    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', `${filename}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <Button 
      onClick={downloadCSV} 
      variant="outline" 
      size="sm" 
      className="mt-2"
    >
      <DownloadIcon className="mr-2 h-4 w-4" />
      Download CSV
    </Button>
  )
} 