# annual-reports

A minimal annual-report cover gallery with automatic system dark mode and a short responsive black/white opening cover. The front page opens an enlarged featured report with color matches; “All reports” opens the full collection. Use Ctrl+F / Cmd+F to search by company, ticker or year; click a cover for nearby color matches and its original PDF.

Live: https://annual-reports-chi.vercel.app/

The collection targets 2020–2026 reporting years across current S&P 500 tracking-fund companies. SEC EDGAR ARS PDFs are the primary source; verified AnnualReports.com PDFs backfill missing years. Plain SEC form and dense monochrome text pages are filtered, including a local OCR fallback for broken PDF text mappings. `scripts/coverage.json` records actual coverage and gaps; the archive does not imply every company-year has a designed cover.

```sh
python3 scripts/build_gallery.py
node scripts/check.mjs
python3 scripts/check_import.py
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

To refresh source reports, run `python3 scripts/import_archive.py --start 2020 --end 2026`, then rebuild the gallery output. Imports need curl, Poppler, WebP tools and Tesseract. Full PDFs are transient; first-page text and processed metadata make imports resumable. Only compressed WebP covers and the compact manifest are served. Vercel deploys `dist` without a build, server, database or runtime image transformations. Covers use long browser/CDN caching; the UI lazy-loads, renders batches and skips offscreen painting with native CSS.

Operational details: [docs/ops/annual-report-atlas.md](docs/ops/annual-report-atlas.md).
