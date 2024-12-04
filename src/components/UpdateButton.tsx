'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ReloadIcon, UpdateIcon } from '@radix-ui/react-icons'
import { useToast } from "@/hooks/use-toast"
import { useRouter } from 'next/navigation'

export default function UpdateButton() {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  const handleUpdate = async () => {
    try {
      setIsLoading(true)

      const response = await fetch('/api/update-ods', {
        method: 'POST',
      })

      const data = await response.json()
      
      if (data.success) {
        toast({
          title: "Success",
          description: (
            <div className="space-y-1">
              <div>Found {data.summary.totalPractices} practices and {data.summary.totalPCNs} PCNs</div>
              <div>Data updated successfully</div>
            </div>
          ),
          className: "bg-green-600 text-white",
        })
        router.refresh()
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: data.error,
        })
      }

    } catch (error) {
      console.error('Error:', error)
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      <Button 
        onClick={handleUpdate} 
        disabled={isLoading}
        variant="outline"
      >
        {isLoading ? (
          <>
            <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
            Updating...
          </>
        ) : (
          <>
            <UpdateIcon className="mr-2 h-4 w-4" />
            Update Data
          </>
        )}
      </Button>
    </div>
  )
} 