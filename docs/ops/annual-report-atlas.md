# Annual Report Atlas

The application is a static white cover gallery: search company/ticker/year, click a cover, browse four nearest color matches, and open its original SEC PDF. No framework, runtime server, account database, or browser persistence is required. Public image assets and `reports.json` live in `dist`; Vercel serves the static output. `dist/app.mjs` owns browsing and matching; `scripts/import_reports.py` owns discovery, issuer checks, PDF validation and first-page extraction. `scripts/color.py` owns palette extraction. No scheduled importer is configured.

## Source boundary

The first collection is ten designed covers from April–June 2025 ARS filings. Discovery uses the SEC quarterly master index and ARS filing detail pages, including attached PDFs when the primary document is HTML. PDF signatures are validated before Poppler extracts page one. Company CIKs are limited to equity holdings in iShares IVV, a maintained S&P 500 tracking fund. This is a membership proxy rather than a licensed official S&P constituent list; the downloaded holdings date and source are stored in `scripts/universe.json` and `reports.json`. SEC incorporation metadata excludes foreign-incorporated issuers and unknown incorporation states. This is a narrower subset than all index constituents, not a complete archive. The selection uses current membership, not membership at the report date.

`year` uses the first-page annual-report title when available, otherwise the SEC reporting-period year. Both `yearBasis` and the original `period`/`filed` dates remain in the data. This avoids labeling a 2024 report as 2025 simply because its fiscal year ends in January 2025.

## Image filtering and similarity

Poppler samples the first page to a small PPM image. HSV pixels provide a coarse dominant hue while ignoring white margins; neutral covers fall back to grayscale. Plain pages with SEC commission and Form 10-K/Q headings and less than 8% chromatic content are excluded. Monochrome designed covers without those form headings are preserved. This is a heuristic, not a model or aesthetic judgment; a designed SEC-form page may be excluded, while another plain text page may pass. Inspect new covers when growing the collection.

Nearest colors use squared RGB distance between dominant sampled colors, exclude the selected cover, and break ties by stable report ID. Matching is relative to this small collection; it does not infer layout or subject similarity.

## Operate

Requires Python 3, curl, and Poppler (`pdftoppm`, `pdftotext`) and WebP (`cwebp`). Set `SEC_USER_AGENT` to an identifiable application and contact email if changing the operator; current contact was supplied by the user. The importer is sequential, pauses between uncached requests, retries failures twice, and stays below SEC's documented 10 requests/second ceiling. PDFs and metadata are cached outside Git in the OS temporary directory. Re-running resumes downloaded reports; delete the holdings/SEC ticker cache files to refresh membership.

```sh
python3 scripts/import_reports.py --years 2025 --limit 10
node scripts/check.mjs
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

The limit is successful designed covers per filing year. Each successful record has a real PDF URL, filing URL, CIK, tickers, incorporation, dates, cover image, palette and provenance. The importer atomically replaces the JSON manifest as it progresses; keep a running import local until complete. Failures are explicitly recorded rather than claimed as imported. Source PDFs may become unavailable upstream; local first-page images remain readable, while original-document links depend on SEC availability. Remove a record and its cover and republish to withdraw it. The initial ten are not automatically updated.

## Verify

`node scripts/check.mjs` checks count, asset/source integrity, reporting dates, membership scope, ticker search and nearest-color behavior. `python3 scripts/check_import.py` checks the plain-form filter with colored and monochrome counterexamples. The browser check uses the parent workspace's installed Playwright, verifies image decoding, search/empty states, the PDF link, similar-cover navigation, Escape dismissal and mobile overflow, and records the actual UI outside Git. It requires the local server above. New checkouts need Playwright available to run that optional UI check; the product itself has no npm dependencies.

The user requested work outside Lobby. The application has an independent GitHub repository at luckymonkybaby/annual-reports on main, separate from the parent coding application's integration checkout. Vercel publishes `dist` with no installation or build step. Covers are precompressed WebP images served through the CDN with immutable cache headers; full PDFs remain in the temporary import cache. Keep full PDFs, demo videos and temporary caches outside Git.
