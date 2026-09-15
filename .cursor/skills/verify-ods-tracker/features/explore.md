# Explore the directory

Explore lists ODS organisations by type, area, status and query, and can show GP practices as they were on a past date.

## Sub-features

- `explore-open` opens the directory from the main nav and from home type tiles.
- `explore-filter-type` narrows the list with the `Organisation type` nav.
- `explore-filter-status` switches Active / Closed / All.
- `explore-query` finds rows from the on-page search box.
- `explore-as-at` lists GP practices open on a past date with the hierarchy they had then.
- `explore-api` returns the same slice from `GET /api/orgs` (and `GET /api/practices` when `asAt` is set).

## How to get to it (user POV)

- Choose `Explore` in the nav named `Main`.
- Choose a type tile on home (for example `GP practices` → `/explore?group=gp`).
- Open `/practices` or `/pcns` (redirects to Explore with `group=gp` or `group=pcn`).
- Open `/explore?q=archway&status=all`.
- Open `/explore?group=gp&asAt=2019-06-01&scope=Z9B2Z`.
- `GET {API}/api/orgs?group=gp&limit=5` and `GET {API}/api/practices?asAt=2019-06-01&scope=Z9B2Z&limit=5`.

## Driving it with Playwright and orgs

Preconditions:

- Doctor has passed.
- `$VERIFY_API/api/orgs?group=gp&limit=1` returns `total` > 7000.
- Area `Z9B2Z` still has practices on `2019-06-01`.

- **Nav entry.** Choose `Explore`. Run Playwright `page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Explore' }).click()`. The heading is `Explore organisations` and the URL is `/explore`.
- **Type filter.** Choose `GP practices` in the nav named `Organisation type`. The heading becomes `GP practices` and the list shows codes and names.
- **Query.** Fill the search box named `Search organisations` with `archway` and submit the form (`role=search`). The heading contains `archway` and a row links to an organisation.
- **Status.** Choose `Closed` in the group named `Status`. The description mentions `closed` and rows may show a closed badge.
- **As at.** Open `/explore?group=gp&asAt=2019-06-01&scope=Z9B2Z`. The heading is `GP practices`, the description mentions `1 Jun 2019`, and the list is non-empty.
- **API slice.** `GET $VERIFY_API/api/orgs?group=gp&limit=5` → 200, `items.length === 5`, `total` > 7000. `GET $VERIFY_API/api/practices?asAt=2019-06-01&scope=Z9B2Z&limit=5` → 200, `total` > 400.
- **Open a row.** Choose the link named with the first row’s organisation name. The org page `h1` matches that name.
- **Proof.** Screenshot of `/explore?group=gp` with the type nav and at least one row, plus the JSON from the two GETs. Do not click **CSV**.

## Gotchas

- `/practices` and `/pcns` only prove Explore if you assert the post-redirect URL and heading.
- `asAt` is offered only when `group=gp`. Other types ignore it.
- Invalid `asAt` (for example `not-a-date`) still renders the page; it is not a 400 in the UI. Assert the historical description only when the date parsed.
- The Explore **CSV** control hits `/api/export/orgs.csv` with the current filters. Do not activate it.
- Keep page loads sequential. Each Explore view fans out to `/api/orgs` or `/api/practices` plus facets and scopes.
