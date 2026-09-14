'use client'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl space-y-3 px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">{error.message || 'The page could not be loaded.'}</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg border bg-card px-4 py-2 text-sm shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        Try again
      </button>
    </div>
  )
}
