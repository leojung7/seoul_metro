# Seoul Metro Hub — V1.2 (RC3) release notes

## 1. Character-length filter
- Length is counted on `nameForLength = name.replace(/\s*\([^)]*\)/g, "")` — parenthetical text **and the parentheses** are ignored. Displayed names are unchanged.
- `Isu(Chongshin Univ.)` → "Isu" (3) · `이수(총신대입구)` → "이수" (2) · `총신대입구(이수)` → "총신대입구" (5) · `Seoul Station(서울역)` → "Seoul Station".
- Used by every length filter and by the count shown on each row (`cl()` in `app.js`). Counting rules other than the parenthesis removal are unchanged: Korean mode ignores spaces; English mode counts letters and digits only (so "Seoul Station" counts as 12, not 13 — say so if you want raw `.length` instead).

## 2. Bilingual Geo map
- English mode → CARTO Voyager tiles (English labels where a name exists). Korean mode → OpenStreetMap standard tiles (local = Korean names). Defined in `TILE_SOURCES` (`app.js`), so providers are easy to swap. Attributions for OSM and CARTO are shown.
- Toggling EN/한 swaps the base tiles **without** touching: selected station, open sheet (state and scroll), route highlight and pins, map centre, zoom, markers or hit-testing.
- The old tiles stay visible until the new ones load. If the new tiles fail (4+ tile errors, none loaded) the current tiles are kept, a localized notice is shown, and everything else (station names, markers, tooltips, route text, sheets) is still localized by the app. A failed language is retried after 60 s or on the next toggle after recovery.
- The theme toggle keeps the tiles of the current language; rapid toggling always ends with one tile layer.

## 3. SVG schematic coverage (improved)
Found that `svg-positions.js` only listed **577 of the 767** station symbols in the official artwork. With the full list (`svg-positions-labelmatch.js`):
- 21 earlier name-matched positions that had been rejected turned out to sit exactly on real symbols and are now accepted.
- New tool `tools/svg_label_match.py` learns how station labels sit relative to their symbols from the code-verified stations and predicts the symbol of unplaced stations. Leave-one-out validation: **100% precision (267/267 correct, 0 wrong), 94% coverage**. 33 more stations qualified (20 independently confirm the older supplement; 4 disagreed and the validated method wins; 9 were new).
- Rules unchanged: a position is accepted only if it is an existing symbol, on the station's own line, and not claimed by any other station. Nothing is interpolated.

| | Before | Now |
|---|---|---|
| Placed on schematic | 441 | **472** (284 code-verified + 188 name/label-matched) |
| Unmatched (listed in `SVG_MISSING_STATIONS.csv`) | 213 | **182** |

Still unmatched: mostly interchange hubs and line termini, whose labels sit 40–65 units from the symbol (the verified stations only show 10–33), so the learned label pattern does not apply and no validated way exists to pair them. I stopped there rather than guess.

## Tests (Chromium; Leaflet replaced by `tools/leaflet-shim.js`)
- `node tools/e2e-suite.js` 192/192 · `node tools/e2e-suite-rc2.js` 317/317 · `node tools/e2e-suite-lang.js` **147/147** (new).
- New suite: length-filter examples + all stations × lines × both modes against the spec regex + UI filtering; language toggle while a route is visible and while a station sheet is open (selection, view, route, pins, sheet state/scroll, tiles, localized text, post-toggle taps); Korean/English tile failure fallback with notice; recovery; rapid toggles; theme toggle.

## Limits
- **Tile labels could not be verified here** (no network): that CARTO Voyager labels Seoul in English and OSM standard in Korean is based on how those providers document/behave. Check one screen of each on a real device; if a provider disagrees, change its entry in `TILE_SOURCES`. CARTO's free tiles are intended for light use.
- Not run on real iPhone Safari, Edge or real Leaflet.
- 182 stations still have no schematic position.
