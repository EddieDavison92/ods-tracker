# ODS Tracker verification map

This directory is the maintained source for verifying user-facing behaviour of ODS Tracker. Read this index before driving, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch the Next.js site at `$VERIFY_SITE` (default `http://127.0.0.1:3100`) with `NEXT_PUBLIC_ODS_API_URL` pointing at `$VERIFY_API` (default `https://api.ods-tracker.org`).
- Do not start the Cloudflare Worker unless the run is explicitly proving a local API with a loaded D1.
- Run `node .cursor/skills/verify-ods-tracker/helpers/doctor.mjs --api "$VERIFY_API" --site "$VERIFY_SITE"` and require a fresh `/api/meta`, ≥300000 orgs, and an ODS Tracker homepage.
- Never drive a site instance this run did not start.
- Cap API traffic at ≤2 rps. Never call `/admin/*` or `/api/export/*`.

## Driving conventions

- Start every recipe from the homepage unless the feature lists another URL.
- Prefer ARIA roles and accessible names over CSS selectors or position.
- Treat every command as literal. Keep codes, flags and quoted names unchanged.
- Site actions go through Playwright against `$VERIFY_SITE` (same library as `npm run qa:crawl`, one page at a time).
- API actions go through `npm run qa:weekly` or `GET` with the 500 ms gap used by `worker/scripts/weekly-check.ts`.
- Do not click **CSV**, **Download CSV**, or **Follow (RSS)** during verification.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an ARIA (or text) snapshot and a screenshot with the ODS Tracker header visible.
- API proof includes the request path, status, and the field that satisfied the assertion.
- Record the feature ID and entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behaviour. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behaviour.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with <harness>` starts with `Preconditions:` and uses labelled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Search organisations](./search.md) covers header, home, keyboard and `/api/suggest`, then opening a result.
- [Explore the directory](./explore.md) covers type, area, status, query and historical GP (`asAt`) browse.
- [Organisation record](./organisation.md) covers `/org/{code}` overview and section tabs.
- [Change feed](./changes.md) covers `/changes` filters and `/api/changes`.
- [Public API health](./public-api.md) covers `qa:weekly` (sync, ORD drift, samples, history) without admin or CSV.
