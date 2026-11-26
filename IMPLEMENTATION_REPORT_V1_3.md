# Implementation report — V1.3 (English map fix, travel times, multi-route)

All work is in the project ZIP. Every claim below was measured by a test or tool run in this session; where something could **not** be verified it is listed under *Limits*.

---

## A. Root cause — English map shows "Map data not yet available" when zooming

| question | finding (from the real `app.js`) |
|---|---|
| Different providers for Korean / English? | **Yes.** `TILE_SOURCES.ko` = `tile.openstreetmap.org`; `TILE_SOURCES.en` = `server.arcgisonline.com` (Esri World Street Map). |
| Different APIs? | Yes — different servers and URL schemes (`{z}/{x}/{y}` vs `{z}/{y}/{x}`). |
| Does English switch to a different server? | Yes, on every language toggle `setTiles()` swapped the layer. |
| Are English tiles unavailable at higher zoom? | Yes. The Esri service has far less detail in Korea than the declared `maxNativeZoom: 19`. Beyond its real limit it returns a **normal `200 image/png` that is itself a notice reading "Map data not yet available"**. Leaflet sees a successful tile load, so neither `tileerror` nor the switch-over/fallback logic can detect it (same trap as the earlier "API KEY REQUIRED" provider). |

**Fix.** One provider for both languages — the OpenStreetMap tiles that already worked (`TILE_OSM`, `TILE_SOURCES = { ko: TILE_OSM, en: TILE_OSM }`). Map reliability was prioritised over English basemap labels, as requested. `setTiles()` now returns immediately when the wanted language uses the same URL, so toggling language never reloads the base map. Everything the app draws itself stays translated (station names, route details/summaries, popups, filters, UI text, legends, route instructions).
**Verification.** The app can request at most zoom 15 programmatically; user zoom is capped by `maxZoom: 19`, equal to OpenStreetMap's native maximum, so no reachable zoom level is outside the provider's real data. No Esri/ArcGIS reference remains in active code (test-enforced). *Tiles themselves cannot be downloaded in the sandbox — see Limits.*

## B. Root cause — station-name matching

`data.js` stores plain names (`복정`, `판교`, `죽전`…). The National Railway Authority CSVs append the station subtitle in brackets (`복정(동서울대학)`, `판교(판교테크노밸리)`…). The builder stripped brackets from the **app** names only, never from the **file** names, so 11 stations on 수인분당선/신분당선 never matched and their segments fell through to "estimated".
**Fix** (`tools/build_travel_times.py`, `name_candidates()` + `match()`): for each file name try the full text, then the text without brackets, then the bracket content; accept only a unique match on that line. All 11 examples you listed now map.
Still unmapped, correctly: **당고개** (Seoul Metro file, Line 4) and **능길** (Suin-Bundang file) — neither station exists in `data.js`. No placeholder stations or coordinates were created. (Consequence: Line 4 상계–불암산 has no exact time.)

## C. Coverage before vs after (777 adjacent station pairs)

| | exact running time | official distance only | no official value (estimated) |
|---|---|---|---|
| **before** | 270 (35%) | 102 (13%) | 405 (52%) |
| **after** | 270 (35%) | **125 (16%)** | **382 (49%)** |

By line, the change: 수인분당선 distance 41 → 60 (uncovered 21 → 2); 신분당선 11 → 15 (uncovered 4 → 0). Transfer pairs: 101 before and after (the 140 file rows describe both directions of the same interchange; 139 map, 1 — 수서 "국철" — is ambiguous and is not guessed).
Full table: `TRAVEL_TIME_DATA_REPORT.md` (generated).

## D. Modified files
`app.js` (tile config + shortcut in `setTiles`; `summarizeRoute`, `routeOptionHTML`, `doRoute`, new `routeDetailHTML`/`selectRoute`/`externalLinks`/helpers; route meta + on-map summary show minutes; language re-render keeps results and selection) · `index.html` (two script tags; "Fastest route / Fewest transfers" option labels) · `styles.css` (cards, breakdown, links) · `i18n.js` (~45 Korean strings) · `DEPLOYMENT_VERIFICATION_RC4.md` (marked historical — see J) · `tools/e2e-suite-rc4.js`, `tools/e2e-suite-lang.js`, `tools/e2e-suite-rc2.js` (tests updated for the new behaviour, reasons in J) · `tools/leaflet-shim.js` (one provider) · `TEST_RESULTS_*.json` (regenerated). Unchanged and still byte-identical: `data.js`, `svg-positions*.js`, the SVGs, the PDF.

## E. New files
`route-engine.js` (travel-time + multi-route engine) · `travel-times.js` (generated data) · `TRAVEL_TIME_DATA_REPORT.md` (generated) · `tools/build_travel_times.py` (builder) · `data-sources/travel-times/` (the six source CSVs + `coverage_before_name_fix.json`) · `tools/e2e-suite-times.js` (183 checks) · `RELEASE_NOTES_V1_3.md` · this report · `evidence/v13-*.png` (6 screenshots) · `TEST_RESULTS_TIMES.json`.

## F. Data sources used
**The attached "Excel files" are six CSV files (cp949); there are no workbooks and therefore no sheets.**

| file | content | used for |
|---|---|---|
| 서울교통공사 역간거리 및 소요시간_240810.csv (279 rows) | running time (mm:ss, 10 s steps) + km between stations, Lines 1–8 | 270 **exact** ride segments |
| 서울교통공사_환승역거리 소요시간 정보_20250331.csv (140 rows) | transfer distance (m) + walking time (= distance / 1.2 m/s) | 101 **exact** transfer pairs |
| 국가철도공단_공항철도 / 수도권9호선 / 수인분당선 / 신분당선_역간거리_20260630.CSV | distance (km) to the next station, **no time** | 125 **derived** segments |
None of the files contains timetables, operating hours or live data.

## G. Travel-time methodology
For one adjacent station pair, in this order (`route-engine.js: rideSegment`):
1. **Official** — exact CSV running time, used exactly, never altered. Distance = the file's km.
2. **Derived** — official km (NRA files) → `seconds = 23.9 + 63.27 × km`.
3. **Estimated** — no official value: straight-line km × **1.036** → the same model. (1.036 = median of official km ÷ straight-line km over 395 segments; p5 0.89, p95 1.26, which also supports both the station mapping and the coordinates.)

*Model.* Least-squares fit on the 270 exact segments: cruise 56.9 km/h, fixed 23.9 s, R² 0.56, residual sd 19.5 s. **Leave-one-line-out cross-validation** (fit without a line, predict it): mean absolute error 8.1–15.5 s per segment, bias on line totals −5.6 % to +4.8 % (Line 1 −16 %, 9 segments only).
*Station stops.* The official times are departure→arrival between stations and **exclude** the time trains stand in stations (the dataset's own definition; e.g. the 43 official running times of the Line 2 loop sum to only 65 min, and the trains also stand at each of its 43 stations — +18 min at 25 s). The engine therefore adds **25 s at each intermediate station** (configurable), shown on its own line ("14 min running + 4 min at 10 stations"). Changing between branches of one line is not counted as a through-stop.
*Express setting.* The existing "Include express lines" control now selects the app's per-line express speed (`SPD`) **only where it is faster than the model**, and never for exact segments: airport 서울역→인천공항1터미널 is 71 min all-stop and 59 min with express on (this is a modelled figure — I have no official running time for that line to compare it with); Line 2 is unchanged at 35.
*Route search.* Dijkstra over the same station×route graph as the original planner (the original `plan()` is untouched and is the automatic fallback if the engine/data fail to load). Path cost equals displayed time exactly. Options: FASTEST (min time); FEWEST TRANSFERS (min transfers, then time); up to two ALTERNATES found by penalising the best routes' tracks and forbidding each interchange they use, kept only if within min(1.5 × fastest, fastest + 20 min) and different in lines, interchanges or track (Jaccard ≤ 0.7). Identical routes are merged ("FASTEST · FEWEST TRANSFERS"). Displayed leg minutes are apportioned so they add up exactly to the displayed total.

## H. Transfer-time methodology
1. **Official**: exact walking time from the Seoul Metro transfer file (symmetric: all 79 interchange pairs listed in both directions are identical).
2. **Expected connecting-train wait**: after an official walk, **120 s** (half of the 3–5 min peak interval) is added and shown separately. Reason found during testing: with zero wait, a 3-transfer chain (AREX → GTX-A → 3 → 8) "beat" the direct Line 2 ride 홍대입구→잠실 by a minute; with the wait the direct ride is FASTEST. Waiting for the *first* train is not included.
3. **Default classes** when no official value exists: Easy 2 / Medium 4 / Long 7 min (complete penalty, no extra wait). The class comes from a per-interchange override if one is configured, else from the median official walk of the same line pair when ≥ 2 samples exist (< 3 min → Easy, > 5.5 min → Long), else Medium.
4. Branch changes on the same line: 12 s (same as the original planner) and not counted as a transfer.
All values are in `window.TT_CONFIG` / `RouteEngine.config` (`dwellSeconds`, `transferDefaultsMin`, `transferDefaultClass`, `transferClassOverrides`, `classThresholdsMin`, `transferWaitSeconds`, `cruiseKmhByLine`, `alternates`).

## Issue #11 — coverage audit of the remaining lines
Lines with **no official value for any segment**: GTX-A (8 pairs), 경강선 (11), 경의선 (56), 경춘선 (24), 김포골드라인 (9), 서해선 (20), 신림선 (10), 용인경전철 (14), 우이신설경전철 (12), 의정부경전철 (14), 인천1호선 (32), 인천2호선 (26) — plus Line 1 (92 of 101), Line 4 (26), Line 3 (10), Line 7 (11), Line 8 (5), 수인분당 (2).
*Can the current files improve this?* **No.** Every row of the six files is already used; the bracket fix was the last gain. *What is needed* (nothing was fabricated): (1) the operators' standard **running times** per station pair in the same form as the Seoul Metro file (best), or timetables from which they can be derived; (2) the 국가철도공단 `역간거리` series for the other lines (the four supplied files belong to it; existence for each line was not verified); (3) **transfer walking times** for non-Seoul-Metro interchanges (경의선, 서해선, GTX-A, 4↔수인분당…); (4) the missing stations 당고개, 능길 with coordinates. Details in `TRAVEL_TIME_DATA_REPORT.md`.

## I. Validation results
* **Data vs. raw files (independent re-read in the test, not the builder's code):** 262 consecutive Seoul Metro rows — every running time and km equal; 137 transfer rows — distance and walking time equal; 125 NRA segments — all equal.
* **Integrity:** every exact/distance edge joins two real, adjacent stations; every transfer joins two lines of the same station; 654 stations, no duplicate stations or (line, code); 120 multi-line stations unchanged; all values positive/finite.
* **Engine:** 60 random origin/destination pairs — no duplicate routes, FASTEST is never beaten, FEWEST TRANSFERS has the true minimum, ranks unique, displayed legs always sum to the total, worst-case search 41 ms. FASTEST equals a **separate shortest-path implementation** on 40 pairs.
* **Lines checked:** 1–8 (4+2 and 4→7 examples), 9, Airport Railroad, Suin-Bundang, Shinbundang, GTX-A, Sillim — each returns a timed route; Line 9 is flagged *derived* (0 official segments), Line 2 is 100 % official.
* **UI:** cards, breakdown (parts add up to total), station-by-station list, selection by click/keyboard/"Show on map", on-map summary minutes, preference selector, Google/Kakao/Naver links (exact URL, encoding, `target=_blank rel=noopener`), Korean/English, selection kept across language switches, fallback to the original planner, both express settings, aliases, same-station rejection, no console errors — desktop, iPhone and iPhone-landscape.
* Sample outputs (all-stop / express): 사당→동대문역사문화공원 22 min (all official); 홍대입구→잠실 35 min (all official); 강남→판교 18 min (derived); 김포공항→여의도 24 min (derived, Line 9); 서울역→강남 fastest 25 min (2 transfers, 9 of 12 segments official, 3 derived; 5 min of that is transfer walking + connecting-train wait).

## J. Test results
| suite | before my changes | final |
|---|---|---|
| `e2e-suite` | 192 / 192 | **192 / 192** |
| `e2e-suite-rc2` | 317 / 317 | **317 / 317** |
| `e2e-suite-lang` | 147 / 147 | **135 / 135** (12 fewer: two obsolete "English tiles fail" scenarios replaced by one identity test) |
| `e2e-suite-rc4` | 193 / 194 | **196 / 196** |
| `e2e-suite-times` (new) | — | **183 / 183** |
| **total** | | **1,023 / 1,023, 0 failures** |

*Baseline note:* `e2e-suite-rc4` already failed one check before any change (a repo-wide grep counted `DEPLOYMENT_VERIFICATION_RC4.md`, which quotes the former provider's code). That document is now explicitly marked HISTORICAL and the test honours that banner.
*Tests I changed, and why:* tile tests (one provider now; failure scenarios for a second provider no longer exist); three "Board Line 2" wording tests (the fastest route is now chosen by official times, so they read the real first line); a mid-route tap test (zooms in first, as a finger-user would, because the new route has closely spaced markers on a tiny landscape map). No assertion was weakened to hide a failure.
*Bugs found by the new tests and fixed during this work:* (1) the express setting was not reaching the route graph; (2) a same-line branch change was charged a station stop in the breakdown but not in the search (25 s mismatch vs. the independent search); (3) the Calculate button's click event was being treated as "keep previous selection", ignoring the preference selector; (4) transfers without a wait made transfer-heavy routes unrealistically "fastest" (see H); (5) a helper I had assumed (`pdfEmbedWanted`) does not exist in this project.

## K. ZIP
`SEOUL_METRO_HUB_V1_3.zip` — the complete project (including the original `.git`, with the changes uncommitted so `git diff` shows them).

---

## Assumptions
25 s station-stop time; 120 s expected connecting-train wait; transfer classes 2/4/7 min (your values); one official running time is used for both directions (the file lists one figure per pair; every interchange listed in both directions was identical); straight-line × 1.036 as route distance when no official km exists; the model's constants are fitted on Seoul Metro Lines 1–8.

## Limits and risks
* **Derived/estimated times for high-speed or light-rail lines are the least certain.** The model is calibrated on metro-style stopping patterns; AREX/GTX-A/Shinbundang segments longer than the calibration range are extrapolated, and light-rail lines (slower in practice) are not treated differently because no data supports a different value. `cruiseKmhByLine` exists to override once an official figure is available.
* 49 % of segments are estimates; each card says so.
* Naver: only an **app** link is documented, so it is shown on phones/tablets only. Kakao's route link follows its published URL scheme but was not exercised against the live service.
* Google link uses station names (`<name>역`) as requested; names are less precise than coordinates and a few outer stations may resolve ambiguously.
* **Not run on real iPhone Safari, Edge or real Leaflet.** Tiles cannot be fetched from the test sandbox.
* The request mentions a **color filter** and an **ownership filter**; neither exists in this codebase. The filters that do exist (line grid, character-length filter, sort, transfers-only, text filter, Geo line selector) are tested and unchanged.
* Not real-time: no live arrivals, delays or crowding anywhere (test-enforced).

## Regenerating the data
`python3 tools/build_travel_times.py` (needs Python 3 and Node; reads `data-sources/travel-times/*.csv` and `data.js`; writes `travel-times.js` and `TRAVEL_TIME_DATA_REPORT.md`). New operator files in the same format can be added to the builder's `F_*` lists.
