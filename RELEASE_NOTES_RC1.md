# Seoul Metro Hub — Release Notes, RC1

Package: `SEOUL_METRO_HUB_RC1.zip`
Automated result: **192 / 192 tests pass** (desktop 58, iPhone portrait 67, iPhone landscape 67).

---

## 1. Fixed issues

| Area | What was wrong | What changed |
|---|---|---|
| Station sheet (iPhone) | Content clipped in peek/half, not scrollable, drawer felt broken | Sheet now resizes by height with states hidden / peek / half / full; drag, snap, scroll inside the sheet, close button. A full sheet no longer covers the Route, Guide or Official tabs |
| Header (mobile) | Controls overflowed; search and ⋯ were off-screen | Single-row header on every size; tabs share the middle; search, EN/한 and ⋯ are always visible |
| EN/한 toggle | Hidden inside the overflow menu | Top-level button on desktop and mobile; stays functional after tab changes |
| Overflow ⋯ menu | Expanded inside the header and shifted layout; did nothing on mobile | Floating popup outside the header (no layout shift); outside click and Esc close it; also lists Official, Guide, theme and favorites |
| 이수 / 총신대입구 naming | Same name shown for every line | Line 4: 총신대입구(이수) / Chongshin Univ.(Isu). Line 7: 이수(총신대입구) / Isu(Chongshin Univ.). Applied to popup, tooltips, search, Lines tab, picker, favorites, route steps |
| Route "Show on map" | Opened the schematic, route unclear | Opens the Geo map, red highlight, A / B / transfer pins, zoom to route, route kept after tab switches. Schematic remains available as a second button |
| Geo alignment | Hand-drawn line geometry did not match station markers | Lines are drawn from each route's ordered stations, so markers sit on their lines. Hand-drawn curves are used only where both stations lie on them |
| Station picker | Schematic picking failed on iPhone after a route was shown | The route summary card was covering the map and swallowing taps; it is now hidden while picking. Search, line, schematic and geo picking all pass |
| Schematic coverage | Missing stations were not reported | "📊 Coverage" panel: counts, list of unplaced stations, jump to Geo map, per-station warning, CSV export |

---

## 2. Remaining limitations

- **215 geo positions are estimates**, not measured coordinates (see section 4).
- **150 stations have no position on the schematic**, including several major interchanges. Label matching was not improved in this release.
- **Not verified on real iPhone Safari or Edge.** Testing used Chromium only.
- **Real Leaflet was not exercised.** See section 6.
- The Gyeongui-Jungang east branch (구리 → 지평) is re-spaced between two trustworthy stations, so it is plausible, not exact.

---

## 3. SVG coverage statistics (schematic)

| Status | Stations |
|---|---|
| Total | 654 |
| Verified position | 285 |
| **ESTIMATED** position (dashed ring) | 219 |
| **UNMATCHED** (listed, never hidden) | 150 |
| On the map (verified + estimated) | 504 |

Every station is accounted for. Unmatched stations are listed in the Coverage panel, show a warning in their details, and remain visible on the Geo map. Full per-station list: `SVG_COVERAGE.csv` or the in-app "Export CSV".

---

## 4. Geo coordinate statistics

| Status | Stations |
|---|---|
| Total | 654 |
| Verified | 439 |
| **ESTIMATED** | 215 |
| of which re-spaced on the Gyeongui-Jungang east branch | 14 |

- ESTIMATED means the stored lat/lng sits exactly on an evenly spaced run between neighbouring stations, which indicates interpolation by the data build rather than a measurement.
- Estimated stations are drawn with a dashed ring, and the tooltip says "approximate position".
- 83 stations are estimated on both the schematic and the Geo map.
- The `서울시 역사마스터 정보.csv` named in the `data.js` header is not part of this package, and the supplied 서울교통공사 CSV has no coordinates. Replacing the estimated positions requires a real coordinate table.

---

## 5. Test coverage

Run with `node tools/e2e-suite.js`. Results are in `TEST_RESULTS.json`; screenshots are in `evidence/`.

| Profile | Tests | Passed |
|---|---|---|
| Desktop 1366×800 | 58 | 58 |
| iPhone 14 portrait (touch emulation) | 67 | 67 |
| iPhone 14 landscape | 67 | 67 |
| **Total** | **192** | **192** |

Covered: header single-row and no overflow; EN/한 visibility, toggling and persistence across tabs; ⋯ menu open, Esc, outside click and no layout shift; the three required routes shown on the Geo map (highlight follows the drawn network, pins, fit, survives tab switch); search, line, schematic and geo pickers plus cancel; coverage panel counts, list, CSV download, Geo jump-to and details warning; bottom sheet tap-to-peek, swipe to half and full, content scroll, swipe-down, ✕, and the Route / Guide / Official tabs staying unblocked; schematic zoom, language, hubs-only and fit; geo line filter; favorites; no console or page errors.

---

## 6. Known risks

1. **Browser engine.** Tests ran in headless Chromium only. iPhone Safari (WebKit) can differ in touch, scrolling, viewport-height and safe-area behaviour, which are exactly the areas the sheet and header rely on. Test on a real iPhone before release.
2. **Map library.** Sandbox testing used a minimal stand-in for Leaflet (`tools/leaflet-shim.js`). Real fitBounds, zoom, tile loading and marker behaviour are unverified.
3. **Data accuracy.** 215 geo positions and 219 schematic positions are estimates; routes through them are drawn correctly relative to each other but may not match true geography.
4. **Coverage gaps.** 150 stations cannot be tapped on the schematic. Users must reach them through search, lists or the Geo map.
5. **Edge** was not tested.
6. **Estimates in routes.** A route can pass through estimated stations (for example, five on the Seoul → Incheon Airport route), so its Geo drawing is approximate.
