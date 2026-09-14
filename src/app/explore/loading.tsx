export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-6 px-4 py-8" aria-hidden>
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-8 w-72 rounded-lg bg-muted" />
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-24 rounded-xl bg-muted" />)}
      </div>
      <div className="h-96 rounded-xl bg-muted" />
    </div>
  )
}
