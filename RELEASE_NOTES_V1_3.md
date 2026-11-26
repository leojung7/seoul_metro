# Seoul Metro Hub — V1.3 release notes

Full detail, methodology and validation: **IMPLEMENTATION_REPORT_V1_3.md**. Data report: **TRAVEL_TIME_DATA_REPORT.md**.

## 1. English map no longer fails when zooming
English mode used a different tile server from Korean mode (a second provider). That provider has less real map data in Korea at close zoom levels; beyond that limit it answers with a normal image that reads **"Map data not yet available"**, and the app had told Leaflet it had data up to zoom 19. **Both languages now use the OpenStreetMap tiles that already worked in Korean mode** (real data to zoom 19, no key, HTTPS). Language switching no longer touches the base map at all (no reload, no flicker, zoom and centre untouched).
Map labels drawn *inside* the tiles are in the local language; everything the app draws itself — station names, markers, popups, route details, filters, legends, UI text — is still translated.

## 2. Route times and multiple route choices
* Every search now shows **FASTEST**, **FEWEST TRANSFERS** (merged into one card when it is the same route) and up to two **ALTERNATE** routes that are genuinely different, ranked automatically, no duplicates. FASTEST is selected by default.
* Each card: route type, **estimated time**, transfers, stations, distance, and how it differs from the fastest (`+3 min · 1 fewer transfer · +3.5 km`).
* Tap a card to make it the active route: it is highlighted, and a **time breakdown** appears (each line segment with minutes, each transfer, the total, plus a station-by-station list). Showing it on a map follows the selection.
* **Open in Google Maps** (transit directions between the two station names, new tab, URL-encoded). **Open in Kakao Map** (documented route URL). **Open in Naver Map** appears on phones/tablets only, because Naver documents only an app link.

## 3. Where the numbers come from (never hidden)
1. **Exact** running times from the Seoul Metro file (Lines 1–8): 270 segments, used exactly.
2. **Derived** from official distances (National Railway Authority files: 공항철도, 9호선, 수인분당선, 신분당선): 125 segments, using `seconds = 23.9 + 63.27 × km`, a model fitted on the exact segments (cross-validated: 8–15 s mean error per segment).
3. **Estimated** for the remaining 382 segments (no official file): straight-line km × 1.036 through the same model.
Each card says which applies (`✅ Official running times for all 11 segments`, `🟡 …9 of 12 segments; 3 derived from official distances`).
Transfers: exact official walking time (101 interchange pairs); otherwise Easy 2 / Medium 4 / Long 7 min (configurable).
Station-stop time (the official running times exclude it) and an expected wait for the connecting train are added and **shown as separate lines**, with their assumed values. Waiting for the first train is not included. This is a planning estimate, not real-time information.

## 4. Station-name matching fixed
Source files write `복정(동서울대학)`, `판교(판교테크노밸리)`; `data.js` has `복정`, `판교`. Brackets are now normalised on the file side. Distance-only coverage rose from 102 to 125 segments; uncovered segments fell from 405 to 382. 수인분당선 is 60/62 covered, 신분당선 15/15.

## 5. Tests
`e2e-suite-times` 183/183 (new) · `e2e-suite` 192/192 · `e2e-suite-rc2` 317/317 · `e2e-suite-lang` 135/135 · `e2e-suite-rc4` 196/196 — **1,023 checks, 0 failures** (Chromium; Leaflet replaced by a stand-in).

## 6. Known limits
* Not run on real iPhone Safari / Edge / real Leaflet; map tiles cannot be loaded in the test sandbox, so "no missing tiles" is verified by configuration (single provider, zoom capped at the provider's real maximum), not by loading tiles.
* 382 of 777 segments (49%) are estimates — chiefly Line 1 outer sections, 경의중앙선, 경춘선, 서해선, GTX-A, 경강선, light rail, Incheon lines. Derived/estimated times for high-speed lines are the least certain (see the report). Official running-time files for those operators would replace them.
* Two stations in the source files are not in `data.js` (**당고개**, **능길**) and were not invented.
