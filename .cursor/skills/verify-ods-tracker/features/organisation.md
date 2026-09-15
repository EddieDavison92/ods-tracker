# Organisation record

The organisation page shows one ODS record: identity, area chain, relationships, members or sites, and a change timeline.

## Sub-features

- `org-open` opens a record from search, Explore, or a typed `/org/{code}` URL.
- `org-overview` shows name, code, type, status, address and area crumbs.
- `org-tabs` switches Overview, Timeline, members/sites, Relationships and Details.
- `org-case` accepts lower-case codes (`/org/f83004`).
- `org-missing` 404s unknown codes.
- `org-api` returns the same record from `GET /api/orgs/{code}`.

## How to get to it (user POV)

- Choose a search suggestion or an Explore row.
- Open `/org/F83004`, `/org/RRV`, or `/org/Z9B2Z` (home “Try” links use the first and third plus UCLH).
- Open `/org/f83004` (same practice).
- Open `/org/ZZZZZZ9` (not found).
- `GET {API}/api/orgs/F83004`.

## Driving it with Playwright and org detail

Preconditions:

- Doctor has passed.
- `GET $VERIFY_API/api/orgs/F83004` returns 200 with `org.code` `F83004` and a non-empty `parents` list.

- **Direct URL.** Open `/org/F83004`. The `h1` contains `Archway`. A button or text shows `F83004`. The nav named `Sections` includes `Overview` with `aria-current="page"`.
- **API.** `GET $VERIFY_API/api/orgs/F83004` → 200, body has `org`, `hierarchy`, `parents`, `events`. Save as `proof/organisation/F83004.json`.
- **Crumbs.** The nav named `Breadcrumb` contains `England` and at least one ancestor link.
- **Timeline.** Choose `Timeline` in `Sections`. The URL is `/org/F83004?tab=timeline`. A change list or the empty message `No changes recorded.` is visible. The group named `Timeline` can switch `This organisation` / `Involving it`.
- **Relationships.** Choose `Relationships`. The URL has `tab=relationships` and a table or list of links.
- **Trust sites.** Open `/org/RRV`. The members tab label is `Sites`. Choose it; the list is non-empty. `GET $VERIFY_API/api/orgs/RRV/children?group=trust_site` → 200, `total` > 0.
- **Lower case.** Open `/org/f83004`. Same `h1` as `F83004`, not a 404.
- **Missing.** Open `/org/ZZZZZZ9`. HTTP 404 and an `h1` (the app’s not-found page).
- **Proof.** Screenshot of `/org/F83004` with header, `h1`, code and Overview, plus the API JSON. Do not activate **Follow changes** (RSS).

## Gotchas

- Tab labels change with type: PCNs say `Members`, trusts and GP practices say `Sites`, commissioners often say `Linked`. Assert the label from the page, not a hard-coded “Members”.
- Overview is the default; it has no `?tab=` in the URL.
- `eventCounts` on older cached payloads may be missing; the timeline still lists the latest events on the record.
- A 404 org URL is a pass for `org-missing`, not a failed drive.
- Do not click map, telephone, or external website links as proof of this feature.
