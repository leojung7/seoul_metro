# Travel-time data report (generated)

| file | kind | rows | values used |
|---|---|---|---|
| 서울교통공사 역간거리 및 소요시간_240810.csv | exact running time + km (Seoul Metro lines 1-8) | 279 | 270 |
| 서울교통공사_환승역거리 소요시간 정보_20250331.csv | exact transfer walking distance/time | 140 | 101 |
| 국가철도공단_공항철도_역간거리_20260630.CSV | official distance only (km) | 14 | 13 |
| 국가철도공단_수도권9호선_역간거리_20260630.CSV | official distance only (km) | 38 | 37 |
| 국가철도공단_수인분당선_역간거리_20260630.CSV | official distance only (km) | 63 | 60 |
| 국가철도공단_신분당선_역간거리_20260630.CSV | official distance only (km) | 16 | 15 |

Note: all six files are **CSV (cp949)**, not Excel workbooks; there are no sheets.

## Mapping onto data.js
- Exact running-time edges: **270** (branch jumps resolved by adjacency + km check: 3: [('2', '성수', '용답'), ('2', '신도림', '도림천'), ('5', '강동', '둔촌동')])
- Distance-only edges (not overlapping an exact one): **125**
- Transfer pairs: **101** (conflicting duplicates: 0); unmapped transfer rows: [('3', '수서', '국철')]
- Unmapped station names: {'서울교통공사 역간거리 및 소요시간_240810.csv': [('4', '당고개')], '국가철도공단_수인분당선_역간거리_20260630.CSV': [('수인분당선', '능길')]}
- Rows that could not be attached to an adjacent pair: [('4', '상계')]

## Coverage of the app graph (adjacent station pairs)
| line | pairs in app | exact time | distance only | neither |
|---|---|---|---|---|
| 1 | 101 | 9 | 0 | 92 |
| 2 | 51 | 51 | 0 | 0 |
| 3 | 43 | 33 | 0 | 10 |
| 4 | 50 | 24 | 0 | 26 |
| 5 | 55 | 55 | 0 | 0 |
| 6 | 39 | 39 | 0 | 0 |
| 7 | 52 | 41 | 0 | 11 |
| 8 | 23 | 18 | 0 | 5 |
| 9 | 37 | 0 | 37 | 0 |
| GTX-A | 8 | 0 | 0 | 8 |
| 경강선 | 11 | 0 | 0 | 11 |
| 경의선 | 56 | 0 | 0 | 56 |
| 경춘선 | 24 | 0 | 0 | 24 |
| 공항철도 | 13 | 0 | 13 | 0 |
| 김포도시철도 | 9 | 0 | 0 | 9 |
| 서해선 | 20 | 0 | 0 | 20 |
| 수인분당선 | 62 | 0 | 60 | 2 |
| 신림선 | 10 | 0 | 0 | 10 |
| 신분당선 | 15 | 0 | 15 | 0 |
| 용인경전철 | 14 | 0 | 0 | 14 |
| 우이신설경전철 | 12 | 0 | 0 | 12 |
| 의정부경전철 | 14 | 0 | 0 | 14 |
| 인천2호선 | 26 | 0 | 0 | 26 |
| 인천선 | 32 | 0 | 0 | 32 |
| **all** | 777 | 270 (35%) | 125 (16%) | 382 (49%) |

## Time model for distance-only segments
`seconds = 23.9 + 63.27 x km`  (cruise 56.9 km/h, n=270 exact segments, R2=0.563, residual sd 19.5 s)

Route distance without an official km: straight-line km x **1.036** (median of official km / straight-line km over 395 segments; p5 0.89, p95 1.26).

Leave-one-line-out cross-validation (fit on the other lines, predict this line):

| line | segments | mean abs error (s) | mean bias (s) | bias on line total |
|---|---|---|---|---|
| 1 | 9 | 15.5 | -15.3 | -16.4% |
| 2 | 51 | 12.1 | +2.3 | +2.4% |
| 3 | 33 | 13.1 | +4.1 | +4.4% |
| 4 | 24 | 9.9 | +4.5 | +4.6% |
| 5 | 55 | 8.1 | +0.8 | +0.9% |
| 6 | 39 | 9.4 | -2.6 | -3.0% |
| 7 | 41 | 15.1 | -5.6 | -5.6% |
| 8 | 18 | 8.2 | +4.1 | +4.8% |

## Coverage before vs after the station-name normalization (Issue #3)

Cause: data.js stores plain names (복정, 판교, 죽전 ...) while the National Railway Authority files add the station subtitle in brackets (복정(동서울대학), 판교(판교테크노밸리) ...). Only the app side was being stripped of brackets, never the CSV side. `name_candidates()` now tries full text, text without brackets, then the bracket content.

| line | distance-only before | distance-only after | neither before | neither after |
|---|---|---|---|---|
| 수인분당선 | 41 | 60 | 21 | 2 |
| 신분당선 | 11 | 15 | 4 | 0 |
| **all lines** | 102 (13%) | 125 (16%) | 405 (52%) | 382 (49%) |

Exact running-time segments: 270 before, 270 after (unchanged - the Seoul Metro file had no bracketed names). Transfer pairs: 101 before, 101 after (140 file rows describe both directions of the same interchange, so rows > unique pairs).

## Coverage audit: lines without their own distance/time file (Issue #11)

| line | adjacent pairs in the app | exact time | official distance | neither (estimated at run time) |
|---|---|---|---|---|
| GTX-A | 8 | 0 | 0 | 8 |
| 경강선 | 11 | 0 | 0 | 11 |
| 경의선 (경의중앙선) | 56 | 0 | 0 | 56 |
| 경춘선 | 24 | 0 | 0 | 24 |
| 김포골드라인 | 9 | 0 | 0 | 9 |
| 서해선 | 20 | 0 | 0 | 20 |
| 신림선 | 10 | 0 | 0 | 10 |
| 용인경전철 | 14 | 0 | 0 | 14 |
| 우이신설경전철 | 12 | 0 | 0 | 12 |
| 의정부경전철 | 14 | 0 | 0 | 14 |
| 인천1호선 | 32 | 0 | 0 | 32 |
| 인천2호선 | 26 | 0 | 0 | 26 |

**What the current files can still improve:** nothing more for these lines. Every row of the six files is already used (see the table of sources); the bracket-name fix was the last gain available. The remaining gaps are lines for which no supplied file contains a single row, plus two stations that exist in the source files but not in data.js: **당고개** (Seoul Metro file, Line 4, which also leaves 상계-불암산 without an exact time) and **능길** (Suin-Bundang file). Neither is added here - no placeholder stations or coordinates are invented.

**Additional datasets that would be required (nothing below has been fabricated; the app flags these segments as *estimated*):**

| need | for which lines | likely source (not verified to exist for every line) |
|---|---|---|
| inter-station **running times** (best) | all lines above, and the uncovered parts of Lines 1, 3, 4, 7, 8, 9, 수인분당선, 신분당선, 공항철도 | the operator's own published standard running times, in the same form as the Seoul Metro "역간거리 및 소요시간" file; or operator timetables (successive station departure times of one train) |
| inter-station **distances** | the 12 lines above | the 국가철도공단 `역간거리` series on data.go.kr - the four supplied files (공항철도, 9호선, 수인분당선, 신분당선) belong to it; check for `국가철도공단_<노선명>_역간거리` for the other lines |
| **transfer walking times** for non-Seoul-Metro interchanges (경의선, 서해선, GTX-A, 신분당선 ...) | 경의선 x 서해선/경춘선/공항철도/수인분당선, GTX-A x any, 4 x 수인분당선, ... | operator station-guide data, or the Seoul Metro transfer file extended to those operators |
| the missing stations **당고개, 능길** (with coordinates) | Line 4 / 수인분당선 | the master station list used to generate data.js (서울시 역사마스터 정보) |

