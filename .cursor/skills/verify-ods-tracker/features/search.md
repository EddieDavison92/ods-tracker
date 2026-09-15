# Search organisations

Search lets a user find any ODS organisation by name, code or postcode, pick a suggestion, and land on that organisation’s record.

## Sub-features

- `search-open` opens search from the header, the home hero, and `/` / `Ctrl+K`.
- `search-suggest` returns typed matches from `/api/suggest` without changing data.
- `search-open-result` opens a suggestion on `/org/{code}`.
- `search-all-results` sends “see all results” to Explore with the same query.
- `search-empty` shows a complete empty state for a query with no matches.
- `search-api` returns the same top match from `GET /api/suggest`.

## How to get to it (user POV)

- Choose the header button named `Search organisations`.
- Choose the home hero button whose name includes `Search by name, ODS code or postcode`.
- Press `Ctrl+K` or `/` while focus is outside an editable field (header search).
- Open `/search?q=F83004` (redirects to Explore).
- `GET {API}/api/suggest?q=F83004`.

## Driving it with Playwright and suggest

Preconditions:

- Doctor has passed for `$VERIFY_SITE` and `$VERIFY_API`.
- `F83004` is still an organisation in the API.
- Chromium for Playwright is installed (`npx playwright install chromium`).

- **API match.** Ask suggest for the known practice. Run `GET $VERIFY_API/api/suggest?q=F83004` with the 500 ms gap. Status `200` and `items[0].code` is `F83004`. Save the body as `proof/search/suggest.json`.
- **Hero entry.** Open home and choose the hero search. Run `node .cursor/skills/verify-ods-tracker/helpers/drive-search.mjs --site "$VERIFY_SITE" --api "$VERIFY_API" --out .cursor/skills/verify-ods-tracker/proof/search`. The dialog named `Search organisations` appears with focus in the box placeholder `Name, ODS code or postcode`.
- **Type a code.** The helper types `F83004`. Wait for an organisation row (`[cmdk-item]` containing `F83004` but not `See all results`). That row’s text includes `Archway`. Do not treat the immediate “see all results” item as a match.
- **Open result.** Activate that row. The dialog closes and the page URL is `$VERIFY_SITE/org/F83004`. The `h1` contains `Archway`.
- **Header entry.** From any page, choose `Search organisations` (or press `/`). The same dialog opens and the URL does not gain a slash.
- **Empty state.** Type `zzzzqqqq`. A message `No organisations match “zzzzqqqq”.` appears.
- **See all results.** Type `archway` and choose `See all results for “archway”`. The URL is `/explore?q=archway&status=all` and the heading contains `archway`.
- **Proof.** Keep `proof/search/dialog.png`, `proof/search/org.png`, matching `.aria.txt` snapshots, `suggest.json`, and `RUN.txt`. The org screenshot shows the ODS Tracker header and `F83004`.

The helper covers hero open, type, result, and org proof. Drive header, empty, and see-all in a later run if this proof only used the helper.

## Gotchas

- Suggestions fire after two characters and a 140 ms debounce. Wait for the list or the empty message, not a fixed sleep.
- `/` and `Ctrl+K` do nothing while an input has focus.
- `/search` is a redirect into Explore, not the command dialog. Do not treat an Explore heading as proof that the dialog opened.
- Do not follow the Explore **CSV** link from “see all results”.
- Live codes can disappear. If `F83004` 404s, record the miss; do not silently switch codes.
- Opening the search dialog sets `aria-hidden` on the header. In `next dev` that can log a hydration mismatch. Ignore that console line; it is not a failed search.
