// src/components/UpdateProgress.tsx
'use client'

import { useState, useEffect } from 'react'
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"

type ProgressMessage = {
  id: number
  message: string
  timestamp: Date
}

export function UpdateProgress({ isVisible }: { isVisible: boolean }) {
  const [messages, setMessages] = useState<ProgressMessage[]>([])

  useEffect(() => {
    if (!isVisible) {
      setMessages([])
      return
    }

    const eventSource = new EventSource('/api/update-ods')

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)
      setMessages(prev => [...prev, {
        id: prev.length,
        message: data.message,
        timestamp: new Date()
      }])
    }

    return () => eventSource.close()
  }, [isVisible])

  if (!isVisible) return null

  return (
    <Alert className="mt-4">
      <AlertDescription>
        <ScrollArea className="h-[100px] w-full">
          {messages.map(msg => (
            <div key={msg.id} className="text-sm py-1">
              {msg.message}
            </div>
          ))}
        </ScrollArea>
      </AlertDescription>
    </Alert>
  )
} 