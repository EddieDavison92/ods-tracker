# Change feed

The change feed lists what ODS recorded, filterable by kind, period, date basis, type and area, with a matching activity chart.

## Sub-features

- `changes-open` opens the feed from the main nav and from home “Latest notable changes”.
- `changes-filter-kind` switches kind presets (notable, lifecycle, identity, membership, all).
- `changes-filter-period` switches 30 days / 90 days / 12 months / since 2018.
- `changes-filter-type` uses the organisation-type chips.
- `changes-api` returns a paged feed from `GET /api/changes` and activity from `GET /api/changes/activity`.
- `changes-older` follows `Older changes` via `cursor`.

## How to get to it (user POV)

- Choose `Changes` in the nav named `Main`.
- Choose `All changes` or the home tile `Changes, last 3 months`.
- Open `/changes?kinds=lifecycle&period=30d&group=gp`.
- Open `/changes?scope=Z9B2Z`.
- `GET {API}/api/changes?limit=5` and `GET {API}/api/changes/activity?months=12`.

## Driving it with Playwright and changes

Preconditions:

- Doctor has passed.
- `GET $VERIFY_API/api/changes?limit=5` returns 200 with five items and `nextCursor`.

- **Nav entry.** Choose `Changes`. The heading is `Changes`. A list of change rows is visible under the feed (or the empty message for the current filters).
- **Kind.** Choose `Lifecycle` in the group named `Kind of change`. The URL includes `kinds=lifecycle`. Rows, if any, are openings/closures rather than membership noise.
- **Period.** Choose `30 days` in the group named `Period`. The URL includes `period=30d`.
- **Type chip.** Choose `GP practices` in the group named `Organisation type`. The URL includes `group=gp`.
- **API page.** `GET $VERIFY_API/api/changes?limit=5` → 200, `items.length === 5`, `nextCursor` set. `GET $VERIFY_API/api/changes/activity?months=12` → 200, `months.length === 12`.
- **Older.** If the page shows `Older changes`, follow it once. The URL gains `cursor=` and the list still renders without an error state.
- **Proof.** Screenshot of `/changes` with heading, filters and at least one change (or a genuine empty state), plus the two JSON bodies. Do not click **CSV** or **Follow (RSS)**.

## Gotchas

- Default kind is `notable` and default period is 90 days; those values are omitted from the URL. Assert the selected chip, not the query string, for defaults.
- `By date recorded` vs `By date effective` changes both the list and the chart. Effective view drops changes that have no effective date.
- Home “Latest notable changes” is a subset (core types, notable kinds). It does not prove the full feed.
- The **CSV** and **Follow (RSS)** controls call `/api/export/changes.csv` and `/api/changes.rss`. Skip them.
- `npm run qa:weekly` already samples `/api/changes` for flip-flops; that is API health, not proof of this UI.
