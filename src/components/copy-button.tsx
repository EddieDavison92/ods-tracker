'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CopyButton({ value, label = 'Copy code' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setDone(true)
        setTimeout(() => setDone(false), 1500)
      }}
      className="inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2 font-mono text-sm shadow-xs hover:bg-accent"
      aria-label={`${label} ${value}`}
    >
      {value}
      {done ? <Check aria-hidden className="h-3.5 w-3.5 text-emerald-600" /> : <Copy aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />}
    </button>
  )
}
