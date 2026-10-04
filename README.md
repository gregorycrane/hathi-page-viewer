# Hathi Page Desk

A static, dependency-free prototype for browsing page-mapped corpus records and opening exact HathiTrust scans.

## What it does

- Loads 2,889 records from the public Google Sheet and filters them by language.
- Falls back to a compact bundled sample if the live sheet cannot be reached.
- Constructs each HathiTrust ID as `hvd.{book}`.
- Calls the public HathiTrust volume API and matches the exact ID in `items[]`.
- Displays the live `rightsCode`, source institution, and count of related copies.
- Uses each record's `begin` and `end` values as scan bounds and builds a direct HathiTrust PageTurner link for the selected scan.
- Highlights `pdus` records, whose full view may be geographically limited.

No API key or build step is required. Serve the directory over HTTP for local testing:

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## GitHub Pages

The included workflow publishes the site automatically. Push this directory as the root of a GitHub repository, then enable **Settings â†’ Pages â†’ Source: GitHub Actions**.

## Data source and rebuilding

The live source is the [IB1 Commentaries Google Sheet](https://docs.google.com/spreadsheets/d/14b6_shYOx9t-HBOiVRavhvMS9CBoonx-hrplI-h8BTU/edit?gid=231332487#gid=231332487).

Download the sheet as `data/records.csv`, then run `node scripts/build-records.mjs data/records.csv data/records.js` to rebuild the bundled fallback. The page displays search results in batches of 100, avoiding a 2,889-card initial render. For a 331,000-record deployment, generate a compact search index and paginated record shards rather than linearly searching one giant browser array.

## Access note

HathiTrust serves the page images. Availability depends on HathiTrust's rights determination, geographic rules, authentication, and current service behavior. HathiTrust currently prevents reliable third-party framing, so the selected scan opens directly in its PageTurner rather than in a broken inline frame.
