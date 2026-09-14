'use client'

// Last-resort boundary when the root layout itself fails.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-GB">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '4rem 1rem', textAlign: 'center', color: '#111' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>ODS Tracker is temporarily unavailable</h1>
        <p style={{ color: '#555' }}>Please try again in a moment.</p>
        <button type="button" onClick={reset} style={{ marginTop: '1rem', padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #ccc', cursor: 'pointer' }}>
          Try again
        </button>
        {error.digest ? <p style={{ marginTop: '1rem', fontSize: 12, color: '#888', fontFamily: 'monospace' }}>Reference {error.digest}</p> : null}
      </body>
    </html>
  )
}
