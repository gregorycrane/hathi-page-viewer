# Hathi Page Desk

A static, dependency-free prototype for browsing corpus records and opening the corresponding HathiTrust page images.

## What it does

- Searches and filters the six supplied test records.
- Constructs each HathiTrust ID as `hvd.{book}`.
- Calls the public HathiTrust volume API and matches the exact ID in `items[]`.
- Displays the live `rightsCode`, source institution, and count of related copies.
- Builds a direct HathiTrust PageTurner link for any selected page scan.
- Highlights `pdus` records, whose full view may be geographically limited.

No API key or build step is required. Serve the directory over HTTP for local testing:

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## GitHub Pages

The included workflow publishes the site automatically. Push this directory as the root of a GitHub repository, then enable **Settings → Pages → Source: GitHub Actions**.

## Scaling beyond the prototype

The six records are in `data/records.js`. A 331,000-record deployment should not render or linearly search one giant browser array. A production version should generate a compact search index and paginated record shards during a data-preparation step, or query a small read-only search service. The viewer and HathiTrust lookup can remain unchanged.

## Access note

HathiTrust serves the page images. Availability depends on HathiTrust's rights determination, geographic rules, authentication, and current service behavior. HathiTrust currently prevents reliable third-party framing, so the selected scan opens directly in its PageTurner rather than in a broken inline frame.
