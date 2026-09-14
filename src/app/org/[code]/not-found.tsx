import Link from 'next/link'

export default function OrgNotFound() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Organisation not found</h1>
      <p className="text-sm text-muted-foreground">That ODS code is not in the database.</p>
      <Link href="/" className="text-sm text-primary hover:underline">
        Back to overview
      </Link>
    </div>
  )
}
