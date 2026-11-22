# SEOUL METRO HUB — RC4 Deployment Verification

## 1. Root cause of the English tile failure
English mode requested its base map from the **former English provider** (its Voyager raster style; defined as `TILE_SOURCES.en` at `app.js` line 921 of RC3 and passed to `L.tileLayer` at line 931).
That provider now answers every tile request with a **normal `200 image/png` that is itself a notice reading “API KEY REQUIRED / carto.com/api-keys”**.
Leaflet treats a delivered image as a loaded tile, so it fired **`load`, not `tileerror`**. The switch-over logic in `setTiles()` waits for `load` (success) or four `tileerror`s (failure), so it **accepted the notice image as a working base map** and removed the working layer. The retry/fallback code never triggered because nothing ever errored. Korean mode uses OpenStreetMap, which is unaffected.

## 2. Actual tile configuration BEFORE modification (RC3 `app.js`, lines 914–946: the only runtime tile code in the project)
```js
  914| 
  915| // Base map per language. OpenStreetMap's standard tiles label places in the local language (Korean in Korea); CARTO's
  916| // Voyager tiles label them in English where a name exists. If the wanted tiles cannot load, the current tiles are kept
  917| // (all station labels, markers, tooltips and sheets are localized by the app itself and never depend on the tiles).
  918| const TILE_SOURCES = {
  919|   ko: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", sub: "abc",
  920|         attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' },
  921|   en: { url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", sub: "abcd",
  922|         attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' }
  923| };
  924| let TL_LANG = null;
  925| const TILE_DOWN = {};                                   // lang -> timestamp of the last failed attempt (retry after 60 s)
  926| function setTiles(lang, force) {
  927|   if (!MAP) return;
  928|   if (TL && TL_LANG === lang && !force) return;
  929|   if (TILE_DOWN[lang] && Date.now() - TILE_DOWN[lang] < 60000 && !force) return;
  930|   const c = TILE_SOURCES[lang] || TILE_SOURCES.en, old = TL;
  931|   const next = L.tileLayer(c.url, { maxZoom: 19, subdomains: c.sub, attribution: c.attr });
  932|   next.__lang = lang;
  933|   if (!old) { TL = next; TL_LANG = lang; next.addTo(MAP); return; }
  934|   let errors = 0, done = false;
  935|   const finish = ok => {
  936|     if (done) return; done = true;
  937|     if (ok) { MAP.removeLayer(old); TL = next; TL_LANG = lang; }
  938|     else {
  939|       MAP.removeLayer(next); TILE_DOWN[lang] = Date.now();
  940|       toast(t(lang === "ko" ? "Korean map tiles are unavailable; keeping the current map. Station labels are still in the selected language." : "English map tiles are unavailable; keeping the current map. Station labels are still in the selected language."), 4200);
  941|     }
  942|   };
  943|   next.on("load", () => finish(true));
  944|   next.on("tileerror", () => { if (++errors >= 4) finish(false); });
  945|   next.addTo(MAP);                                      // the old layer stays visible until the new one has loaded
  946| }
```

## 3. Tile configuration AFTER modification (RC4 `app.js`, lines 915–964)
```js
  915| // Base map per language. Both providers are keyless HTTPS raster tile services that work from any static host
  916| // (GitHub Pages) with plain Leaflet; no API key or token is involved anywhere.
  917| //   ko -> OpenStreetMap standard tiles (UNCHANGED): place labels in the local language (Korean in Korea).
  918| //   en -> Esri World Street Map tiles: place labels in English.
  919| // Station labels, markers, tooltips and sheets are localized by the app itself and never depend on the tiles.
  920| //
  921| // HISTORICAL NOTE (root cause of the "API KEY REQUIRED" map): English mode used to load the Voyager raster tiles from the
  922| // provider that was formerly the "en" entry here. That provider now answers every tile request with a normal 200 PNG that is
  923| // itself a notice reading "API KEY REQUIRED". Leaflet therefore fired "load", not "tileerror", and the switch-over logic
  924| // in setTiles() accepted the notice image as a working base map. Korean mode (OpenStreetMap) was never affected.
  925| const TILE_SOURCES = {
  926|   ko: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", sub: "abc", maxNativeZoom: 19,
  927|         attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' },
  928|   en: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", sub: "", maxNativeZoom: 19,
  929|         attr: 'Tiles &copy; <a href="https://www.esri.com">Esri</a> &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong) and the GIS User Community' }
  930| };
  931| // If the English tiles cannot be loaded at all on first paint, fall back to the Korean (OpenStreetMap) tiles instead of a blank map.
  932| const TILE_FALLBACK = { en: "ko" };
  933| let TL_LANG = null, TL_PENDING = null, TL_TOKEN = 0;    // TL_PENDING / TL_TOKEN: only the newest language switch may change the base map
  934| const TILE_DOWN = {};                                   // lang -> timestamp of the last failed attempt (retry after 60 s)
  935| function cancelPendingTiles() { if (TL_PENDING) { try { MAP.removeLayer(TL_PENDING); } catch (e) {} TL_PENDING = null; } }
  936| function setTiles(lang, force) {
  937|   if (!MAP) return;
  938|   // Already showing this language: just drop any half-finished switch to another language.
  939|   if (TL && TL_LANG === lang && !force) { if (TL_PENDING) { cancelPendingTiles(); TL_TOKEN++; } return; }
  940|   if (TILE_DOWN[lang] && Date.now() - TILE_DOWN[lang] < 60000 && !force) return;
  941|   cancelPendingTiles();
  942|   const c = TILE_SOURCES[lang] || TILE_SOURCES.ko, old = TL, token = ++TL_TOKEN;
  943|   const opts = { maxZoom: 19, maxNativeZoom: c.maxNativeZoom, attribution: c.attr };
  944|   if (c.sub) opts.subdomains = c.sub;
  945|   const next = L.tileLayer(c.url, opts);
  946|   next.__lang = lang;
  947|   let errors = 0, loaded = false, done = false;
  948|   const finish = ok => {
  949|     if (done) return; done = true;
  950|     if (TL_PENDING === next) TL_PENDING = null;
  951|     if (token !== TL_TOKEN) { try { MAP.removeLayer(next); } catch (e) {} return; }       // a newer language switch superseded this one
  952|     if (ok) { if (old && old !== next) MAP.removeLayer(old); TL = next; TL_LANG = lang; return; }
  953|     MAP.removeLayer(next); TILE_DOWN[lang] = Date.now();
  954|     if (TL === next) { TL = null; TL_LANG = null; }
  955|     toast(t(lang === "ko" ? "Korean map tiles are unavailable; keeping the current map. Station labels are still in the selected language." : "English map tiles are unavailable; keeping the current map. Station labels are still in the selected language."), 4200);
  956|     const fb = TILE_FALLBACK[lang];
  957|     if (!TL && fb && fb !== lang) setTiles(fb, true);   // nothing on screen yet: use the fallback provider rather than a blank map
  958|   };
  959|   next.on("load", () => { loaded = true; finish(true); });
  960|   next.on("tileerror", () => { if (!loaded && ++errors >= 4) finish(false); });
  961|   if (!old) TL = next, TL_LANG = lang; else TL_PENDING = next;   // first paint is shown at once; later switches keep the old layer until the new one has loaded
  962|   next.addTo(MAP);
  963| }
  964| const tiles = () => setTiles(S.lang, true);             // used by the theme toggle
```
* **Korean (`ko`) tiles: unchanged**: same OpenStreetMap URL, same subdomains, same attribution.
* **English (`en`): `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}`**: Esri World Street Map. HTTPS, no API key or token, plain Leaflet `L.tileLayer`, labels in English.
* New safety behaviour: only the **newest** language switch may change the base map (`TL_TOKEN`), a half-finished switch is cancelled (`TL_PENDING`), and if the English tiles cannot load on first paint the app falls back to the Korean tiles instead of a blank map (`TILE_FALLBACK`).

## 4. Files changed (exact line ranges, RC3 → RC4)
| File | Change | Lines |
|---|---|---|
| `app.js` | Tile provider table + `setTiles()` rewrite (single layer, newest switch wins, fallback) | RC3 915–945 → RC4 915–962 |
| `app.js` | Removed the Official **SVG** pan/zoom code (`#stim`, `OV`, `ovb`, `#oz`); added `showOfficialPdf()` | RC3 1398–1403 → RC4 1415–1443 |
| `app.js` | `tab()` calls `showOfficialPdf()` when the PDF tab opens | inserted at RC4 1458 |
| `index.html` | Tab label “Official” → **“Official PDF”** (short label “PDF”) | 19 |
| `index.html` | Mobile overflow-menu item → “📄 Official PDF” | 30 |
| `index.html` | Old Official pane (SVG `<image>`, Fit button, PDF side link) replaced by the PDF-only pane (`#pdf-bar`, `#pdf-host`, `#pdf-fallback`) | RC3 175–183 → RC4 175–190 |
| `styles.css` | `#stim` rule replaced by Official-PDF pane styles | RC3 205 → RC4 205–213 |
| `styles.css` | mobile rule no longer references `#stim` | RC3 372 → RC4 380 |
| `i18n.js` | Korean strings for the tab name and PDF pane text | 6, 13 |
| `RELEASE_NOTES_V1_2.md` | old provider description marked HISTORICAL / superseded | 9, 32 |
| `tools/leaflet-shim.js`, `tools/e2e-suite-lang.js`, `tools/e2e.js` | test tooling follows the new provider; request log; GitHub-Pages sub-path serving | shim 37; lang 13, 50, 64, 101; e2e 6–7, 14–15, 19–20 |
| `tools/e2e-suite-rc4.js`, `tools/TEST_RESULTS_RC4.json` (**new**) | RC4 verification suite and results | new |
| `TEST_RESULTS*.json` | regenerated by re-running the suites | n/a |

`data.js`, `svg-positions*.js`, the schematic SVG files, `map_korea.pdf` and all other app code are untouched.

## 5. Exact Official tab changes
* **Removed:** the SVG schematic (`<image href="Seoul_subway_linemap_en.svg">` inside `#stim`), its pan/zoom code, the Fit button (`#oz`) and the “PDF (한국어)” side link.
* **Now shown (only):** `map_korea.pdf`.
  * **Desktop:** embedded in the page as `<object data="map_korea.pdf#view=FitH&navpanes=0" type="application/pdf">` with an `<iframe>` fallback, filling the view. The browser's own PDF viewer provides scrolling, zoom and page navigation. A slim bar offers “Open in new tab” and “Download”.
  * **Phones/tablets (and desktop browsers without a built-in PDF viewer):** embedding is unreliable on iOS/Android, so the tab **opens `map_korea.pdf` in a new tab automatically** and keeps a visible “Open PDF” card on screen (never blank; also covers blocked pop-ups).
* The tab is named **Official PDF** (Korean: 공식 PDF).

## 6. Verification
**CARTO is no longer active.** `grep -RniI "carto|cartocdn|voyager" .` returns exactly two lines, both historical notes:
```
./app.js:921:// HISTORICAL NOTE (root cause of the "API KEY REQUIRED" map): English mode used to load the Voyager raster tiles from the
./RELEASE_NOTES_V1_2.md:9:- *(HISTORICAL, superseded in RC4: the English provider described here was removed because it now requires an API key; ...
```
No active line, tile source, URL, test expectation or network request references it.

**Automated results** (headless Chromium: desktop, iPhone, iPhone landscape and the GitHub-Pages sub-path `/seoul-metro-hub/`; Leaflet replaced by the project's shim):

| Suite | Checks | Passed | Failed |
|---|---|---|---|
| RC4 suite (new): tiles, switching, Official PDF, Pages sub-path | 194 | 194 | 0 |
| Language suite (EN/한, bilingual Geo map) | 147 | 147 | 0 |
| Main suite (schematic, routes, sheet, search) | 192 | 192 | 0 |
| RC2 suite (audit / mobile / accessibility) | 317 | 317 | 0 |
| **Total** | **850** | **850** | **0** |

| Requirement | Result |
|---|---|
| English mode: single Esri tile layer, well-formed keyless HTTPS URL | ✅ (4 checks) / ✅ (4 checks) |
| No request to the former provider in any profile | ✅ (8 checks) |
| EN → 한 → EN → 한 → EN: one tile layer, route visible, station selected, sheet open, centre/zoom unchanged, markers intact | ✅ (104 checks) |
| Rapid toggling (6×): no duplicate layers, newest language wins | ✅ (4 checks) |
| Stations selectable after switching (hit-testing) | ✅ (2 checks) |
| English tiles failing → graceful fallback, route and markers untouched | ✅ (8 checks) |
| Korean mode / Korean tiles unchanged | ✅ (source check + the switches above) |
| Official PDF embedded, nothing else shown (desktop) | ✅ (2 checks) / ✅ (2 checks) |
| Server serves a real PDF | ✅ (2 checks) |
| Official PDF on mobile: new tab + visible button, not blank | ✅ (8 checks) |
| Official PDF Korean labels | ✅ (4 checks) |
| Schematic, Geo map, route search, station selection, bottom sheet, language toggle | ✅ (RC4 smoke checks + the existing suites) |
| Works from a GitHub Pages project sub-path | ✅ (`desktop@/seoul-metro-hub/` profile) |

## 7. What could NOT be verified in this environment
* **Live tile download.** The sandbox has no internet (DNS fails for both tile hosts, see below), so tile loading is verified through Leaflet's `load`/`tileerror` logic, the exact URL templates and the request log, **not** by seeing real images. After deploying, open the site once in English mode and confirm the Esri base map draws without any notice image. If you ever want a different English provider, change only `TILE_SOURCES.en`.
* **English labels on the Esri tiles** rely on the provider's documentation. Station labels, markers, tooltips and sheets are localized by the app itself, independent of the tiles.
* **Embedded PDF pixels in a real desktop browser.** The sandbox Chromium has no PDF viewer (`navigator.pdfViewerEnabled === false`), so it takes the “new tab” path there (also tested). The `<object>` embed is standard and works in current Chrome, Edge, Firefox and desktop Safari. `map_korea.pdf` itself is a valid 1-page PDF (1491 × 1491 pt, starts with `%PDF-`).
* **A real iPhone**: covered by emulation only.
```
$ curl https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/11/794/1745
curl: (6) Could not resolve host: server.arcgisonline.com
$ curl https://tile.openstreetmap.org/11/1745/794.png
curl: (6) Could not resolve host: tile.openstreetmap.org
```

## 8. Deploying to GitHub Pages
Upload the contents of `seoul-metro-hub/` to the repository root (keep `map_korea.pdf` next to `index.html`; all URLs are relative, which the sub-path test confirms). After the deploy, hard-refresh once (Ctrl/Cmd-Shift-R) so browsers drop the cached `app.js`.
