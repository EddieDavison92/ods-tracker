# Public API health

The public API serves the same data as the site. Weekly check proves sync freshness, agreement with live ORD on a sample, a sane change feed, and history — without admin routes or CSV dumps.

## Sub-features

- `api-meta` reports freshness and headline counts.
- `api-weekly` runs the repo’s rate-limited Monday checkup.
- `api-org` returns known organisations `RRV`, `F83004`, `Z9B2Z`.
- `api-history` still serves pre-2026 changes and `asAt=2019-06-01` practices.
- `api-reject` does **not** run `qa:api` / smoke-api (admin + CSV).

## How to get to it (user POV)

- Open `/docs` on the site (human documentation; not required for the checkup).
- Call `https://api.ods-tracker.org/api/meta` (or `$VERIFY_API`).
- Run `npm run qa:weekly` from the repo root.
- Run `node worker/scripts/weekly-check.ts "$VERIFY_API"` (optional `--json`).

## Driving it with qa:weekly

Preconditions:

- Network to `$VERIFY_API` and to `https://directory.spineservices.nhs.uk/ORD/2-0-0`.
- No Cloudflare credentials. Doctor’s `/api/meta` check has already passed, or this run *is* the first API check.

- **Weekly checkup.** From the repo root, run `npm run qa:weekly`. That executes `node worker/scripts/weekly-check.ts` against `$VERIFY_API` or `https://api.ods-tracker.org`. Exit code `0`. Lines include `PASS` or `WARN` for Sync health, ORD drift, Spot sample, Changes, and History. Any `FAIL` fails the drive. Save stdout as `proof/public-api/weekly.txt`.
- **Meta.** `GET $VERIFY_API/api/meta` → 200. `lastSyncDate` within 2 days, `stats.orgs` ≥ 300000, latest `runs[0].status` is not `error`.
- **Known orgs.** `GET $VERIFY_API/api/orgs/F83004`, `/api/orgs/RRV`, `/api/orgs/Z9B2Z` → 200, each `org.code` matches. Space these by ≥500 ms.
- **History.** Covered by the History section of `qa:weekly` (`asAt=2019-06-01` practices in the thousands; yearly activity length 9). Do not add extra history GETs unless weekly was skipped.
- **Proof.** `weekly.txt` plus a truncated `meta.json`. Record `VERIFY_API` in `RUN.txt`.

## Gotchas

- `qa:weekly` is ≤2 rps and never hits `/admin/*` or CSV. `qa:weekly:full` and `npm run qa:api` spawn `smoke-api.ts`, which POSTs `/admin/sync` and GETs export CSVs. Do not run them as this skill’s drive.
- WARN is allowed (exit 0). FAIL is not.
- `--json` prints one object; use it when a human log is not needed, and save that object as proof instead of the table.
- Pointing weekly at a local Worker (`http://127.0.0.1:8787`) only works if that D1 is loaded. An empty local database fails Sync health; that is not a site bug.
- ORD can 429. Weekly treats some ORD failures as WARN. Do not retry the whole script more than once in a run.
- Site `/docs` contains live links into `$VERIFY_API`. Opening `/docs` is optional documentation proof, not a substitute for `qa:weekly`.
