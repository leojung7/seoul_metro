# Seoul Metro Hub — Station Data Reconciliation Report

Sources: `data.js` (uploaded), `서울시 역사마스터 정보.csv` (784 rows, coordinates), `서울교통공사_노선별_지하철역_정보_1.csv` (799 rows, codes/lines).
Outputs: this report · `station-registry.json/.csv` · regenerated `data.js` · audit CSVs (`phase1_*.csv`, `phase3_*.csv`, `phase4_coordinate_diff.csv`).

## Headline results
| Item | Result |
|---|---|
| Active stations in the authoritative registry | **654** (+1 planned: 삼성 GTX-A, excluded from routes) |
| Stations whose coordinate came from the master CSV | **654 / 654** (old data.js: 182 within 100 m, **472 not**) |
| Old coordinates more than 1 km / 5 km / 65 km off | **237 / 71 / max 65 km** |
| Impossible route hops (> 15 km, 25–30 km for GTX-A/AREX) with OLD coordinates | **2** |
| Impossible route hops with NEW coordinates | **0** |
| Duplicate station IDs / duplicate names / orphan stations | **0 / 0 / 0** |
| Line-CSV codes missing from routes | **0** of 799 |

## PHASE 1 — Audit (data.js ↔ master CSV)
Station-level categories (654 data.js stations):

| Category | Count | Meaning |
|---|---|---|
| 1. Exact matches | **565** | same name (after trimming 역) on a line the station belongs to |
| 2. Alias matches | **77** | matched through the rename table, parenthetical sub-names (e.g. `쌍용(나사렛대)`) or punctuation (`·` vs `.`) |
| 3. Duplicate matches | **12** | the master has 2+ rows for the same station on the same line (see below) |
| 4. Ambiguous matches | **0** | 0 after correction. Initially 3 (서빙고, 한남, 응봉) plus 3 rows (옥수, 이촌, 왕십리) because the master files the Yongsan–Wangsimni Jungang section under 경원선 (= Line 1). I re-assigned master IDs 1008–1013 to 경의·중앙선 |
| 5. Missing from CSV (in data.js, not in master) | **0** | none (`양평(중앙선)` is master row 1217 `양평`) |
| 6. Missing from data.js (in master, not in data.js) | **1** | ID 9006 `삼성` GTX-A: station under construction, not in the operator CSV; kept in the registry as `planned` |

Master rows: 784 total, 783 mapped to a data.js station, 1 unmapped (9006). No master row is claimed by two stations. data.js has no duplicate station names.

**Duplicate matches (12)** — master rows for one physical station:
| Station | Master rows |
|---|---|
| 청량리 | 1014 청량리(서울시립대입구), 158 청량리(서울시립대입구) |
| 서울 | 1001 서울역, 150 서울역, 426 서울역, 9005 서울, 4201 서울역, 1251 서울역 |
| 지축 | 1949 지축, 309 지축 |
| 까치울 | 3753 까치울, 2753 까치울 |
| 부천종합운동장 | 3754 부천종합운동장, 2754 부천종합운동장, 1982 부천종합운동장 |
| 춘의 | 3755 춘의, 2755 춘의 |
| 신중동 | 3756 신중동, 2756 신중동 |
| 부천시청 | 3757 부천시청, 2757 부천시청 |
| 상동 | 3758 상동, 2758 상동 |
| 삼산체육관 | 3759 삼산체육관, 2759 삼산체육관 |
| 굴포천 | 3760 굴포천, 2760 굴포천 |
| 부평구청 | 3761 부평구청, 2761 부평구청, 3118 부평구청 |

Reasons: Line 7 Incheon extension stations are listed twice (`7호선` and `7호선(인천)`, IDs 27xx and 37xx), 지축 twice (309 / 1949), 청량리 and 서울역 under both 1호선 and 경원선/경부선. Their coordinates are averaged; spreads are 5–510 m.

**Alias matches (77):** 77 stations; types: parenthetical sub-names (66+), explicit renames (7), punctuation (3+). Full list: `phase1_station_matches.csv`.

## PHASE 2 — Name reconciliation
One station record per physical station. Old/other names are kept as `aliases` (search finds them) and `obsoleteNames`; no duplicate records were created.

| data.js name | CSV name(s) | Master rows | Line-CSV name | Canonical name in registry | Result |
|---|---|---|---|---|---|
| 평택지제 | 지제 | 1723 지제 (경부선) | 평택지제 | 평택지제 | 1 record, aliases: 지제, Jije |
| 자양 | 뚝섬유원지 | 2730 뚝섬유원지 (7호선) | 자양 | 자양 | 1 record, aliases: 뚝섬유원지, 자양(뚝섬한강공원), Ttukseom Resort |
| 운정중앙 | 운정 | 9000 운정 (수도권 광역급행철도) | 운정중앙 | 운정중앙 | 1 record, aliases: 운정(GTX-A) |
| 시우 | 원곡 | 4814 원곡 (서해선) | 시우 | 시우 | 1 record, aliases: 원곡, Wongok |
| 용인중앙시장 | 운동장송담대/운동장·송담대 | 4512 운동장.송담대 (에버라인선) | 용인중앙시장 | 용인중앙시장 | 1 record, aliases: 운동장·송담대, 운동장.송담대, 운동장송담대 |
| 서해구청 | 서구청 | 3210 서구청 (인천2호선) | 서해구청 | 서해구청 | 1 record, aliases: 서구청, Seo-gu Office |
| 한국항공대 | 화전 | 1268 화전 (경의중앙선) | 한국항공대 | 한국항공대 | 1 record, aliases: 화전, Hwajeon |
| 서울 | 서울역 | 1001 서울역 (경부선)<br>150 서울역 (1호선)<br>426 서울역 (4호선)<br>9005 서울 (수도권 광역급행철도)<br>4201 서울역 (공항철도1호선) | 서울, 서울역 | 서울역 | 1 record, aliases: 서울, Seoul |

Notes: `서울` (the GTX-A line-CSV name) is merged into **서울역**; GTX-A riders still see `서울` via a line-specific display name. `운정중앙` (GTX-A) is **not** merged with `운정` (경의선, a different station 4 km away): the alias `운정(GTX-A)` is used instead. `양평(중앙선)` and `양평` (5호선) stay separate stations. `총신대입구` / `이수` is one station with line-specific display names (Line 4 / Line 7).

## PHASE 3 — Line reconciliation
Compared names, codes and line assignments against the operator line CSV (authoritative for codes):

| Check | Result |
|---|---|
| Stations assigned to a line the CSV does not list (wrong line) | **0** |
| Line-CSV memberships missing from data.js | **0** |
| Code mismatches (data.js code ≠ CSV code for that line) | **0** |
| Duplicated transfer records (same station stored twice) | **0** (data.js has 1 near-pair by position: `마전` / `아라`, 73 m apart, different lines and names: kept separate, flagged for review) |
| Obsolete / divergent names | **6**: `4·19민주묘지` (CSV: 4?19민주묘지), `서울` (CSV: 서울역), `시청·용인대` (CSV: 시청.용인대), `양평(중앙선)` (CSV: 양평), `전대·에버랜드` (CSV: 전대.에버랜드), `총신대입구` (CSV: 이수) |
| Master line-section differences (master lacks a line data.js has) | **29** stations. All are master line-naming artefacts (e.g. 안산선/수인선 split, 경원선, 일산선), not data.js errors. See `phase3_master_line_section_differences.csv` |

Master-only memberships by data.js line: {'1': 1, '경춘선': 4, '1,경춘선': 1, '경의선,경춘선,수인분당선': 1, '경의선': 6, '경의선,수인분당선': 1, '2': 1, '경의선,서해선': 1, '수인분당선': 8, '서해선': 5}.

## PHASE 4 — Coordinates (CSV authoritative)
* Per station: mean of its master rows per line, then mean across lines (per-line values kept in `perLineCoords`).
* **472 of 654 stations differed by more than 100 m** from the CSV (full list in `phase4_coordinate_diff.csv`); all replaced. By primary line: {'1': 90, '경의선': 39, '수인분당선': 37, '인천선': 29, '4': 28, '2': 24, '7': 23, '3': 21}…
* 48 stations have master rows more than 100 m apart on different lines (real platform separation, e.g. 서울역 ≈ 510 m). Top: 신촌 715 m, 서울 510 m, 잠실 401 m, 동대문역사문화공원 343 m, 신당 311 m, 고속터미널 296 m, 노원 295 m, 구리 292 m.

**Requested verification (경의·중앙선, Gwangju-side stations):**
| Station | Old data.js (lat, lng) | CSV (lat, lng) | Old error | Action | Master ID |
|---|---|---|---|---|---|
| 구리 | 37.59720, 127.14180 | 37.60301, 127.14228 | 0.65 km | ✅ replaced | 2808,1205 |
| 도농 | 37.59124, 127.12047 | 37.60881, 127.16115 | 4.08 km | ✅ replaced | 1206 |
| 양정 | 37.58528, 127.09913 | 37.60533, 127.19364 | 8.62 km | ✅ replaced | 1207 |
| 덕소 | 37.57932, 127.07780 | 37.58678, 127.20883 | 11.58 km | ✅ replaced | 1208 |
| 도심 | 37.57337, 127.05647 | 37.57962, 127.22267 | 14.66 km | ✅ replaced | 1209 |
| 팔당 | 37.56741, 127.03513 | 37.54737, 127.24394 | 18.54 km | ✅ replaced | 1210 |
| 운길산 | 37.56145, 127.01380 | 37.55467, 127.31011 | 26.13 km | ✅ replaced | 1211 |
| 양수 | 37.55549, 126.99247 | 37.54598, 127.32910 | 29.69 km | ✅ replaced | 1212 |
| 신원 | 37.54953, 126.97113 | 37.52555, 127.37292 | 35.53 km | ✅ replaced | 1213 |
| 국수 | 37.54358, 126.94980 | 37.51617, 127.39937 | 39.76 km | ✅ replaced | 1214 |
| 아신 | 37.53762, 126.92847 | 37.51382, 127.44317 | 45.47 km | ✅ replaced | 1215 |
| 오빈 | 37.53166, 126.90713 | 37.50606, 127.47387 | 50.06 km | ✅ replaced | 1216 |
| 양평(중앙선) | 37.49277, 127.49184 | 37.49277, 127.49184 | 0.00 km | ✅ already correct | 1217 |
| 원덕 | 37.52970, 126.88980 | 37.46867, 127.54708 | 58.38 km | ✅ replaced | 1218 |
| 용문 | 37.53370, 126.89380 | 37.48223, 127.59465 | 62.08 km | ✅ replaced | 1219 |
| 지평 | 37.53770, 126.89780 | 37.47639, 127.62987 | 64.93 km | ✅ replaced | 1220 |

The old coordinates for 도농 → 지평 were synthetic points running **west** of Seoul (up to 65 km from the real station).

## PHASE 5 — Validation (regenerated data.js)
Every route passes: no duplicate or missing stations, every station has a code for the route's line, no impossible jumps, branches connect to their trunk, Line 2 loop closes (1227 m closing hop), all 799 line-CSV codes covered.

| Route id | Line | Stations | Length km | Longest hop km | Result |
|---|---|---|---|---|---|
| 1 | Line 1 | 80 | 180.1 | 9.1 | pass |
| 1b | Line 1 | 21 | 25.8 | 1.9 | pass |
| 1c | Line 1 | 2 | 4.5 | 4.5 | pass |
| 1d | Line 1 | 2 | 2.1 | 2.1 | pass |
| 2 | Line 2 | 43 | 45.9 | 1.9 | pass |
| 2n | Line 2 | 5 | 5.1 | 2.0 | pass |
| 2s | Line 2 | 5 | 5.3 | 1.5 | pass |
| 3 | Line 3 | 44 | 54.5 | 2.6 | pass |
| 4 | Line 4 | 51 | 80.8 | 7.9 | pass |
| 7 | Line 7 | 53 | 59.8 | 2.4 | pass |
| 8 | Line 8 | 24 | 29.3 | 3.4 | pass |
| 9 | Line 9 | 38 | 36.9 | 1.9 | pass |
| 5 | Line 5 | 39 | 38.9 | 1.9 | pass |
| 5a | Line 5 | 11 | 10.8 | 1.6 | pass |
| 5b | Line 5 | 8 | 6.5 | 1.4 | pass |
| 6l | Line 6 | 7 | 6.1 | 1.4 | pass |
| 6 | Line 6 | 34 | 29.3 | 1.4 | pass |
| GTX-A | GTX-A | 9 | 76.6 | 13.7 | pass |
| 경강선 | 경강선 | 12 | 53.4 | 8.1 | pass |
| 경춘선 | 경춘선 | 25 | 85.3 | 7.2 | pass |
| 김포도시철도 | 김포골드라인 | 10 | 21.8 | 5.2 | pass |
| 서해선 | 서해선 | 21 | 45.3 | 6.5 | pass |
| 수인분당선 | 수인·분당선 | 63 | 101.9 | 4.9 | pass |
| 신림선 | 신림선 | 11 | 6.8 | 1.0 | pass |
| 신분당선 | 신분당선 | 16 | 31.5 | 7.7 | pass |
| 용인경전철 | 용인에버라인 | 15 | 16.5 | 2.2 | pass |
| 우이신설경전철 | 우이신설선 | 13 | 10.6 | 1.2 | pass |
| 의정부경전철 | 의정부경전철 | 15 | 9.8 | 1.1 | pass |
| 인천2호선 | 인천2호선 | 27 | 28.0 | 2.1 | pass |
| 인천선 | 인천1호선 | 33 | 34.7 | 3.1 | pass |
| A | 공항철도 | 14 | 54.7 | 10.1 | pass |
| G | 경의·중앙선 | 55 | 121.0 | 5.9 | pass |
| Gs | 경의·중앙선 | 3 | 5.3 | 2.8 | pass |

Per-line station counts (line CSV rows vs routes): all equal (Line 1 102, Line 2 51, Line 3 44, Line 4 51, Line 5 56, Line 6 39, Line 7 53, Line 8 24, Line 9 38, GTX-A 9, 경강선 12, 경의·중앙선 57, 경춘선 25, 공항철도 14, 김포골드라인 10, 서해선 21, 수인·분당선 63, 신림선 11, 신분당선 16, 용인에버라인 15, 우이신설선 13, 의정부경전철 15, 인천2호선 27, 인천1호선 33).
Longest hops are real: GTX-A 서울역–수서 13.7 km; 공항철도 청라국제도시–영종 10.1 km; 연천–전곡 8.5 km.
With the OLD coordinates the same check found 2 impossible hops, e.g. G: 오빈→양평(중앙선) 51.8 km, G: 양평(중앙선)→원덕 53.3 km.

## What changed in data.js
* All 654 station coordinates replaced from the master CSV; `ap` is 0 everywhere because nothing synthetic remains.
* `MASTER_CSV_OVERRIDES` removed (no longer needed); the runtime `양평` split is now stored in the data.
* `서울` renamed to `서울역`; new `aliases` field on every station; `DISPLAY_NAMES` extended (GTX-A: 서울).
* Station indices 0–653 are unchanged, so `svg-positions*.js` (keyed by line:code) keep working.

## Caveats
* `x`/`y` (legacy layout) and `D.G` (line geometry) were not part of this reconciliation and are unchanged.
* `app.js` needs the alias list in its search (`s.aliases`) so that `서울`, `지제`, `뚝섬유원지`, `원곡`, `서구청`, `화전`… still find the stations.
* The master CSV has no row for `삼성` GTX-A in the operator CSV (planned station). It is in the registry, not in routes.
