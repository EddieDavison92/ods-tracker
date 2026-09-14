# ODS Tracker

Tracks changes to NHS Organisation Data Service (ODS) records across England: GP practices, PCNs,
Sub-ICB locations, ICBs, trusts, pharmacies and every other ODS organisation. History runs from the
first TRUD release in the archive (June 2018); current data is refreshed from the ODS API every 6 hours.

- **UI**: Next.js app in the repo root, deployed on Vercel.
- **API + sync**: Cloudflare Worker in [`worker/`](worker), backed by the D1 database `ods-tracker`.

## Data sources

| Source | Used for |
|---|---|
| [TRUD item 341](https://isd.digital.nhs.uk/trud/users/guest/filters/0/categories/5/items/341/releases) (HSCOrgRefData XML, monthly) | Initial load. Consecutive releases are diffed into change history. Needs a free TRUD account subscribed to item 341. |
| [ORD API](https://digital.nhs.uk/developer/api-catalogue/organisation-data-service-ord) `/sync` + `/organisations/{code}` | Incremental updates every 6 hours. |
| [epraccur](https://www.odsdatasearchandexport.nhs.uk/) extract | Spot-checking the database (`npm run spot-check`). |

TRUD XML and ORD JSON are parsed into one record model (`worker/src/ods/model.ts`), so both sources
hash and diff the same way.

## How change detection works

- Each org's record (attributes, roles, relationships, successions) is hashed. A changed hash is diffed
  into events: `created`, `closed`, `name`, `address`, `rel_added` (e.g. joined a PCN), `rel_ended`, etc.
- `detected_at` is when the change first appeared (TRUD release date, or sync date).
  `effective_date` is the date ODS gives for it, where known.
- Relationship and role rows keep ODS start/end dates, so membership history (e.g. a practice's PCNs
  over time) comes from the data itself, not only from detected events.
- `org_scope` holds each org's current or last known PCN → Sub-ICB → ICB → region.

## Worker

```bash
cd worker
npm install
npm run typecheck && npm test
npm run dev                      # local API on :8787 (local D1)
npm run deploy
```

Secrets: `ADMIN_TOKEN` (Worker secret, and in `worker/.dev.vars` for local dev). `TRUD_API_KEY` in
`worker/.env` for the backfill.

Admin endpoints (`Authorization: Bearer $ADMIN_TOKEN`):
- `POST /admin/sync?max=1000` runs a sync batch (use to catch up after a load).
- `POST /admin/refresh` rebuilds `org_scope` and headline stats.

### Rebuilding the database from TRUD

```bash
cd worker
npm run backfill                               # downloads all releases to ../.cache/trud, writes .backfill/*.sql (~40 min)
npm run db:migrate:remote
npm run import -- --remote                     # loads .backfill in order
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" $API/admin/refresh
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" "$API/admin/sync?max=3000"   # repeat until remaining = 0
npm run spot-check
```

The sync resumes from the last release's publication date. ORD only serves changes from the last
185 days, so if the sync stops for longer than that, rebuild from TRUD.

## API

Base URL: `https://ods-tracker-api.eddiefox-davison.workers.dev`. Response types: [`worker/src/api/types.ts`](worker/src/api/types.ts).

| Endpoint | Notes |
|---|---|
| `GET /api/meta` | Data freshness, headline counts, recent sync runs |
| `GET /api/scopes` | Regions, ICBs, Sub-ICB locations for filtering |
| `GET /api/practices?scope=&status=&q=&asAt=` | GP practices with hierarchy; `asAt` gives practices and hierarchy on a past date |
| `GET /api/pcns?scope=&status=&q=` | PCNs with active member counts |
| `GET /api/orgs?q=&role=` | Search all ODS orgs |
| `GET /api/orgs/{code}` | Org detail: relationships, members, successions, change timeline |
| `GET /api/changes?scope=&type=&kinds=&since=&before=` | Change feed (cursor pagination via `before`) |
| `GET /api/changes.rss` | Same filters, as RSS |
| `GET /api/export/practices.csv?scope=&asAt=` | Practice → PCN → Sub-ICB → ICB → region mapping |

## Known gaps

- ODS has no CCG → STP links before 2020; historical ICB/region for older dates is often blank.
  `asAt` queries scoped to an ICB also match practices currently in that ICB.
- History before the sync started is at monthly (TRUD release) granularity.
- Archived orgs (long closed) are loaded from TRUD but not served by the ORD API, so they never sync.
- Fax numbers are stored but not tracked as changes (ORD omits some that TRUD carries).

## UI

```bash
npm install
npm run dev        # uses NEXT_PUBLIC_ODS_API_URL, defaulting to the deployed Worker
```
