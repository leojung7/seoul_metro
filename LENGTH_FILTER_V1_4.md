# V1.4 — Dynamic character-length filter

## What changed
| File | Change |
|---|---|
| `app.js` | New counting rules (`countLen`, `cl`), dynamic maximum (`computeLengthStats`, `LEN_STATS`) with an initialization console log, exact-length dropdown beside "6+", exact-length filtering, dropdown change handler, and the total beside the filter now counts each station once in route order. State field `S.lines.lenN` (default 6). |
| `i18n.js` | Korean text for the dropdown label ("Exact length (6–{max})"). |
| `styles.css` | Small style so the dropdown sits beside the 6+ button. |
| `tools/e2e-suite-length.js` (new), `tools/TEST_RESULTS_LENGTH.json` (new) | Validation suite and its results. |
| `tools/e2e-suite-lang.js` | One assertion updated to the new English counting rule (letters only). |

## Filtering logic
1. **Counting** (applies to the counting language chosen in the filter's own "Hangul / English letters" selector, exactly as before):
   * Text in parentheses is removed first, including the brackets: `이수(총신대입구)` → `이수` = **2**; `Isu(Chongshin Univ.)` → `Isu` = **3**.
   * **Korean:** the Korean station name, spaces ignored.
   * **English:** the English station name, **letters only**: spaces, punctuation, `&` and digits are ignored (`Dongdaemun History & Culture Park` → **28**).
2. **Maximum (dynamic, not hard-coded):** when the app loads, `computeLengthStats()` measures every station's default name and every line-specific display name in both languages and stores the longest in `LEN_STATS`. It logs, for example: `[length-filter] longest station name computed from 654 stations: Korean = 9 ("동대문역사문화공원"), English = 42 ("Gyeonggi Provincial Government Northern Office") ...`
3. **Buttons:** All | 2 | 3 | 4 | 5 | 6+ . Choosing **6+** shows a dropdown beside it listing every integer from **6 up to the longest name for the current counting language** (Korean 6…9, English 6…42 with the current data). It defaults to 6.
4. **Filtering:** the dropdown value is an **exact** length. 6 shows exactly 6-character stations; 12 exactly 12; 42 exactly 42. If the counting language changes and the chosen value is above the new maximum, it is clamped to the new maximum.
5. **Preserved:** Korean/English counting selector, search text, A→Z / 가나다 / route-order sorting, the transfers-only filter, line-specific names (총신대입구/이수), branch sections, and the mobile layout. Keyboard focus stays on the dropdown after each change.
6. **Counts:** the number beside the filter is the number of **distinct stations** shown. In route order a junction station (e.g. 성수, 신도림) is listed under both its trunk and its branch; the old total added both rows (Line 2 showed 53 for 51 stations). It now counts each station once, so the figure is the same in every sort mode.

## Validation results
* Longest names, computed independently from `data.js` (different code path): **Korean 9** (동대문역사문화공원), **English 42** (Gyeonggi Provincial Government Northern Office); the running app's `LEN_STATS` matches both.
* English top lengths: 42 (Gyeonggi Provincial Government Northern Office), 37 (Seoul Regional Office of Military Manpower), 37 (Gyeong-in National University of Education), 31 (Incheon Intl. Airport Cargo Terminal), 29 (Juan National Industrial Complex), 29 (International Business District).
* Station counts by length, Korean: 2: 383, 3: 122, 4: 62, 5: 48, 6: 24, 7: 8, 8: 6, 9: 1
* Station counts by length, English: 3: 5, 4: 24, 5: 56, 6: 98, 7: 116, 8: 86, 9: 62, 10: 44, 11: 25, 12: 22, 13: 14, 14: 20, 15: 19, 16: 13, 17: 7, 18: 15, 19: 5, 20: 3, 21: 1, 22: 1, 23: 2, 24: 1, 25: 3, 26: 3, 27: 1, 28: 2, 29: 2, 31: 1, 37: 2, 42: 1
* **Not hard-coded:** the suite injects a synthetic 60-letter station, the maximum and the dropdown follow it (…42 → 60), and removing it restores 42.
* **Every line × every length** (24 lines × 6…max, both languages): the stations shown are exactly the expected set, each row has exactly the selected length, and the count beside the filter matches.
* Real dropdown interaction at 6, the midpoint and the maximum; sorting, transfers-only, search, route order, Korean/English UI toggle; desktop, iPhone and iPhone-landscape layouts (dropdown inside the viewport, touch-sized).
* New suite: **144 / 144 passed**. Existing suites after the change: main 192/192, language 135/135, RC2 317/317, RC4 196/196, travel-times 183/183.

## Notes
* **Digits no longer count in English** (rule: letters only). This changes 8 English names: Jongno 3/5-ga, Euljiro 1/3/4-ga, April 19th National Cemetery, Incheon Int'l Airport Terminal 1/2 (each is 1–2 shorter than before). To count digits again, change `/\p{L}/gu` in `countLen` to `/[\p{L}\p{N}]/gu`.
* The dataset spells the English name as `Dongdaemun History  Culture Park` (the `&` is missing, two spaces). The count is 28 either way.
