import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { PageHeading, Panel } from '@/components/field'

export const metadata: Metadata = { title: 'About' }

// The official NHS England service for looking up ODS records.
const ODS_PORTAL_URL ='https://odsportal.digital.nhs.uk/'

const link = 'text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary'

function Out({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 ${link}`}>
      {children}
      <ExternalLink aria-hidden className="h-3 w-3" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeading
        title="About ODS Tracker"
        description="A free, independent tool for exploring NHS organisation data in England: who each organisation is, how it connects to others, and what has changed."
      />
      <div className="space-y-6 text-sm leading-relaxed">
        <Panel title="What it is">
          <div className="space-y-3">
            <p>
              NHS England&apos;s Organisation Data Service (ODS) gives every NHS organisation, and many organisations that work with the NHS, a code and a record: its name, address, type, dates and its relationships to other organisations.
            </p>
            <p>ODS Tracker takes that data and makes it easier to use:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Search every organisation by name, ODS code or postcode.</li>
              <li>Browse by type and by area: region, ICB, Sub-ICB location or PCN.</li>
              <li>See where an organisation sits, from GP practice to PCN, Sub-ICB, ICB and region, and how that has changed over time.</li>
              <li>Follow openings, closures, renames, moves and membership changes, with RSS feeds for any organisation, area or type.</li>
              <li>Download CSVs or use the <Link href="/docs" className={link}>free API</Link>.</li>
            </ul>
          </div>
        </Panel>

        <Panel title="Not an official NHS service">
          <div className="space-y-3">
            <p>
              ODS Tracker is an independent project. It is not affiliated with, run by or endorsed by NHS England, and it is not the official{' '}
              <Out href={ODS_PORTAL_URL}>ODS Portal</Out>.
            </p>
            <p>
              For authoritative records, and to correct an organisation&apos;s details, use the official ODS services. Changes made there appear here after the next update.
            </p>
          </div>
        </Panel>

        <Panel title="Where the data comes from">
          <div className="space-y-3">
            <p>
              History since June 2018 comes from the monthly ODS releases published on NHS England&apos;s TRUD service. Since September 2026 the ODS API is checked every 6 hours.
            </p>
            <p>A few things to know when reading it:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Before September 2026, changes are dated to the monthly release that first showed them, so a reorganisation such as April 2020 appears as one spike.</li>
              <li>Each organisation&apos;s type is worked out from its ODS roles; the mapping is listed in the <Link href="/docs" className={link}>API docs</Link>.</li>
              <li>Where ODS itself is out of date or inconsistent, this site shows what ODS says.</li>
            </ul>
            <p className="text-muted-foreground">
              Contains public sector information licensed under the{' '}
              <Out href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">Open Government Licence v3.0</Out>.
            </p>
          </div>
        </Panel>

        <Panel title="Cost">
          <p>ODS Tracker is free to use, with no sign-up. The API and downloads are free too; please keep automated use to a few requests per second.</p>
        </Panel>
      </div>
    </div>
  )
}
