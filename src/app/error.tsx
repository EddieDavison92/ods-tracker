'use client'

import Link from 'next/link'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">This page could not be loaded</h1>
      <p className="text-sm text-muted-foreground">
        The ODS data service did not respond in time. This is usually brief, so trying again normally works.
      </p>
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          Try again
        </button>
        <Link href="/" className="rounded-lg border bg-card px-4 py-2 text-sm shadow-xs hover:bg-accent">
          Home
        </Link>
      </div>
      {error.digest ? <p className="font-mono text-xs text-muted-foreground">Reference {error.digest}</p> : null}
    </div>
  )
}
