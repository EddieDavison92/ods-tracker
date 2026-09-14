import Link from 'next/link'

export default function OrgNotFound() {
  return (
    <div className="mx-auto max-w-xl space-y-3 px-4 py-20 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Organisation not found</h1>
      <p className="text-sm text-muted-foreground">That ODS code is not in the database.</p>
      <Link href="/explore" className="text-sm font-medium text-primary hover:underline">Search organisations</Link>
    </div>
  )
}
