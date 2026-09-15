---
name: verify-ods-tracker
description: "Drive ODS Tracker the way a user does — Next.js site plus public JSON API. Use when proving search, browse, organisation pages, the change feed, or API health before a change ships."
---

# Verify ODS Tracker

ODS Tracker is a read-only site (`ods-tracker.org`) over a public API (`api.ods-tracker.org`). Verification launches a local Next.js UI that talks to that API (or another base you set), then drives one mapped feature and keeps the proof files.

Read `features/README.md` before driving. Drive the entry points the chosen feature file lists; do not mark a skipped entry point as verified via a different path.

## Launch

From the repo root. The UI defaults to the deployed Worker; do not start `worker/` unless you are deliberately proving a local API with a loaded D1.

```bash
npm install
# First site drive on this machine only:
npx playwright install --with-deps chromium
```

Pick a free port. `scripts/qa-crawl.mjs` defaults to 3100, so use that when it is free. Bind to IPv4.

```bash
export VERIFY_SITE=http://127.0.0.1:3100
export VERIFY_API="${NEXT_PUBLIC_ODS_API_URL:-https://api.ods-tracker.org}"
export VERIFY_PID_FILE="/tmp/ods-tracker-verify-$$.pid"
# Ready when GET $VERIFY_SITE/ returns 200. Record the `next` pid, not an `npx` wrapper.
./node_modules/.bin/next dev --hostname 127.0.0.1 --port 3100 &
echo $! > "$VERIFY_PID_FILE"
```

Ready: `curl -sf -o /dev/null -w "%{http_code}" "$VERIFY_SITE/"` is `200`, and the HTML includes `ODS Tracker`. Next prints a Ready line; trust the HTTP check.

If 3100 is already taken, use another port and set `VERIFY_SITE` to match. Never attach to a server you did not start.

Two UI processes can share the public API. The API is a shared production (or staging) instance: stay at ≤2 requests per second, and never run two heavy harnesses against it at once.

Teardown is in Cleanup. Leave the server up while you doctor and drive.

## Doctor

Run this first whenever anything looks off, and before every drive.

```bash
node .cursor/skills/verify-ods-tracker/helpers/doctor.mjs --api "$VERIFY_API" --site "$VERIFY_SITE" --pid-file "$VERIFY_PID_FILE"
```

It must report:

- API `GET /api/meta` → 200, `stats.orgs` ≥ 300000, `lastSyncDate` not more than 2 days old, latest run not `error`
- Site `GET /` → 200, body contains `ODS Tracker` and an `h1`
- If `--pid-file` is set, that PID is still alive

Refuse to drive when doctor fails. Do not “fix” a shared API from this skill (no `/admin/*`).

## Drive

Harnesses already in the repo, in the order to reach for them:

| Surface | Command | Use when |
|---|---|---|
| API health | `npm run qa:weekly` | Default API drive. ≤2 rps. Never `/admin/*`. Never CSV. |
| Site feature | Playwright recipes in `features/*.md`, or `helpers/drive-search.mjs` for search | Default site drive. Sequential pages. |
| Full API contract | `npm run qa:api` | Out of bounds for this skill: hits `/admin/sync` and CSV exports. |
| Full site crawl | `npm run qa:crawl` | Out of bounds for this skill: follows CSV/RSS links, concurrency 4. |

Rules for every drive:

- ≤2 requests per second to the API (including those the site makes while rendering). Sequential page loads; wait for idle between them.
- Never request `/admin/*`.
- Never request `/api/export/*` or click **CSV** / **Download CSV**. Do not download change-feed RSS bodies either.
- Prefer ARIA names and `data` in the feature files over CSS or coordinates.
- Stable fixtures (live ODS codes, not seed data): `F83004` Archway Medical Centre, `RRV` (UCLH), `Z9B2Z` West and North London ICB, `Y56` as a region scope. If one is missing, report that entry point unreachable; do not swap in another code and call the path verified.

`npm run qa:weekly` is the mapped drive for [public-api](features/public-api.md). Site features use Playwright against `$VERIFY_SITE`.

One feature is enough for a proof run. Search is the canned end-to-end:

```bash
node .cursor/skills/verify-ods-tracker/helpers/drive-search.mjs --site "$VERIFY_SITE" --api "$VERIFY_API" --out .cursor/skills/verify-ods-tracker/proof/search
```

## Evidence

Write proof under `.cursor/skills/verify-ods-tracker/proof/<feature-id>/`. Cleanup must not delete this directory.

Minimum for a pass:

- The real user path (UI control or public GET), not an internal setter
- The action and the resulting state (not only the last screen)
- Site: screenshot with the ODS Tracker header visible, plus an ARIA or text snapshot
- API: status, truncated body, and the assertion that passed
- Feature ID and entry point recorded in `proof/<id>/RUN.txt`

Mocks are not used. The Worker is the production boundary.

## Cleanup

Kill only the Next.js process this run started. Walk children of the recorded pid (do not `pkill` by name):

```bash
stop_tree() {
  local p=$1
  for c in $(pgrep -P "$p" 2>/dev/null); do stop_tree "$c"; done
  kill "$p" 2>/dev/null || true
}
if [ -f "$VERIFY_PID_FILE" ]; then
  stop_tree "$(cat "$VERIFY_PID_FILE")"
  rm -f "$VERIFY_PID_FILE"
fi
```

Do not `pkill` by name. Do not stop other people’s servers. Do not wipe `proof/`. After teardown, `ls` the proof files and confirm they are still on disk.

## Helpers

Both scripts are executable. `--help` prints usage.

```bash
node .cursor/skills/verify-ods-tracker/helpers/doctor.mjs --api https://api.ods-tracker.org --site http://127.0.0.1:3100
node .cursor/skills/verify-ods-tracker/helpers/drive-search.mjs --site http://127.0.0.1:3100 --api https://api.ods-tracker.org --out .cursor/skills/verify-ods-tracker/proof/search
```

Keep the feature map honest with `/maintain-verification-skill` as the product changes.
