# Audit & status — RC2 (new authoritative data.js)

Audit method: ran the existing app against the regenerated `data.js` **before changing code**, then probed each priority
(automated browser probes + data checks). Statuses below are the *audit result*; "Now" is after this release's changes and tests.

| # | Priority | Audit result (before changes) | Now |
|---|----------|-------------------------------|-----|
| 1 | Route highlighting | **PARTIALLY FIXED** — overlay rendered and followed stations, but (a) zoom-to-route cut off the route for 홍대입구→잠실 (desktop + landscape: fit used station points, not the drawn curve), (b) origin/destination could not be tapped (see NEW BUG 1) | **FIXED** |
| 2 | iPhone station sheet | **FIXED** (bottom sheet, drag, close, safe-area vars) — safe-area and "below header" were not yet asserted | **FIXED** + safe-area/header assertions (portrait + landscape) |
| 3 | Mobile header | **PARTIALLY FIXED** — one row, but the 4th tab was clipped by ~2 px at 390 px and there was no horizontal-scroll fallback | **FIXED** (scroll fallback, logo hidden ≤430 px; tested 280–430 px) |
| 4 | SVG system | **NOT FIXED** — 504 "placed", but 62 name-matched positions were invalid (21 up to 787 units from any station symbol, 41 shared by two stations) and 1 code-verified entry pointed at the wrong station (양평 K135 → 5호선 양평) | **PARTIALLY FIXED** — all invalid positions removed (nothing guessed); 441 placed, 213 reported. Missing stations were **not** added (see NOT FIXED) |
| 5 | Hit testing | **PARTIALLY FIXED** — hit targets matched their positions (0 off) but 29 shared symbols meant a tap could select the wrong station | **FIXED** — 0 shared, 0 off-symbol, sampled taps select the right station |
| 6 | Search / aliases | **FIXED** — aliases come from data.js; 서울, 지제, 뚝섬유원지, 원곡, 서구청, 화전, English names, codes all resolve | **FIXED** (tests added). `oldNames` does not exist in the data; aliases cover the renames |
| 7 | Geo validation | **PARTIALLY FIXED** — my earlier coordinate "repair" code was overwriting 14 real Gyeongui-Jungang coordinates with interpolated ones | **FIXED** — all synthetic-coordinate code removed; 654/654 from data.js; 0 impossible hops |
| 8 | Language toggle | **PARTIALLY FIXED** — only some UI changed language | **FIXED** — full UI + station pages + route steps (dictionary `i18n.js`); sweep finds no untranslated UI text |
| 9 | Desktop UI | **PARTIALLY FIXED** — ⋯ menu fine; tabs clipped at 1024 px | **FIXED** (compact header 901–1200 px; tested 700–1920) |

## NEW BUGS FOUND
1. **Route pins swallowed taps** on the origin/destination (marker pane sits above station dots) — reproduced 4/4, fixed (`interactive:false`, `pointer-events:none`).
2. **Synthetic coordinate code** (mine, from RC1) overwrote real data once data.js became authoritative — removed.
3. **Invalid SVG positions** (62 supplement entries + 1 verified-table conflict) — removed/rejected.
4. **Zoom-to-route** ignored the drawn curve and the summary card position (card is bottom-left on desktop) — fixed.
5. **Neighbouring station dots covered the route's start/end** when zoomed out — start/end/transfers now drawn on top.
6. **Same name repeated per line** in the station heading/tooltips/search (e.g. 서울역 ×5) — grouped.
7. **Route summary card swallowed taps** while picking a station on a map — hidden in pick mode (RC1).

## NOT FIXED / limits
- **213 stations have no schematic position** (list + reason per station: `SVG_MISSING_STATIONS.csv`). 208 of them *do* have a text label in the official SVG, but linking a rotated label to the right symbol is ambiguous; guessing was rejected by the rules. Effort to improve: ~1 day (needs a symbol↔label model, not a heuristic).
- **Real iPhone Safari / Edge / real Leaflet not exercised** (sandbox has only Chromium and no network; Leaflet is replaced by `tools/leaflet-shim.js`). Effort: ~1 hour manual.
- English names in data.js with typos (not changed, per instructions): `PyeongtaekJije`, `GyeonggiGwangju`, `MaetanGwonseon`, `GwanggyoJungang`, `Seoul-forest`, `Onyang oncheon`, `Jeondae ? Everland`, `sae-mal`, `hyoja`, `gonjae`, `eoryong`, `Dongdaemun History  Culture Park`.
