import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">That address is not a page in ODS Tracker.</p>
      <Link href="/" className="text-sm text-primary hover:underline">
        Back to overview
      </Link>
    </div>
  )
}
