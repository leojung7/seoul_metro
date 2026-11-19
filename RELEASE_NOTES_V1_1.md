# Seoul Metro Hub — V1.1 / RC2 release notes

Data: `data.js` is the regenerated, authoritative file from the reconciliation (`data-reconciliation/`): 654 stations, coordinates from the master CSV, aliases included. No coordinates are interpolated, repaired or estimated by the app.

## What changed
**UX**
- **Geo map is the landing view**; Schematic is the second tab. Search (desktop box and mobile search) jumps to the Geo map, selects the station and centres on it. "Show on map" opens the Geo map.
- Route overlays are non-interactive; stations underneath stay tappable. Route start/end/transfer stations are drawn on top. Zoom-to-route follows the drawn path and keeps clear of the summary card.
- Header: single row 280–1920 px; tab strip scrolls if too narrow; EN/한 and ⋯ always visible. Compact header on mid-width desktops.
- Station name shown once per distinct name (e.g. 서울역 on 4 lines), not once per line.

**Honesty (no simulated information)**
- Removed: next-train estimates + countdown, crowding levels, depth/exit profile, hand-written transfer-walk guide, fare, "estimated arrival" clock time, per-route minute totals, weekday/weekend toggle and the fare-class selector.
- Kept: line, station codes, transfers, route path, stop count, distance (≈ km, straight-line between consecutive stations), route compare by *shortest route* / *fewer transfers*.
- **Added:** "Typical interval (not real-time)" — Peak 3–5 min · Off-peak 6–10 min for Lines 2–8; other lines say "Varies by line, train type and time of day". *These ranges are the generic figures from the brief; they were not checked against operator timetables.*
- Guide note states that no live arrivals, delays, crowding or lift status are shown.

**Localization (EN/한)** — one dictionary (`i18n.js`, ~230 strings) drives static HTML and all dynamic panels. EN station pages read "Gangnam (강남)", "Line 2", "Transfer available"; route steps read "Board Line 2", "Transfer at Sindorim (신도림)", "Exit at Seoul Station (서울역)" / "2호선 탑승", "신도림 환승", "서울역 하차".

**SVG schematic** — invalid positions removed (see `AUDIT_REPORT_RC2.md`). Placed: 441 (284 code-verified + 157 name-matched and uniquely on a real station symbol); unmatched: 213 (listed with reasons in `SVG_MISSING_STATIONS.csv`, shown on the Geo map, flagged in the station panel and the Coverage panel).

## Tests
`node tools/e2e-suite.js` → **192 / 192**; `node tools/e2e-suite-rc2.js` → **317 / 317** (desktop 1366×800, iPhone 14 portrait, iPhone 14 landscape, plus header widths 280–1920 px). Chromium only; Leaflet replaced by a shim (see limits).

## Remaining untranslated strings / text that could not be localized
- UI text: none found by the sweep (all tabs, ⋯ menu, picker, search, coverage, station sheet, route cards).
- By design left in English/Latin: GTX-A, AREX, SVG, CSV, WGS84, YouTube, Google, station codes (e.g. K110), "km".
- Secondary names: station English names (and Japanese names) are shown as secondary text in Korean mode; official line names appear in both languages.
- External pages opened from links (Google/Naver/Kakao/Visit Seoul…) are not controlled by this app.
- 12 English station names in data.js contain typos (listed in `AUDIT_REPORT_RC2.md`); not edited.

## Known limits
- Not tested on real iPhone Safari, Edge, or with real Leaflet/tiles.
- 213 stations have no schematic position.
- Distances are approximate (straight-line between stations, not track length).
