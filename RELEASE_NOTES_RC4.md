# RC4 release notes
* **Fixed: English Geo Map showed "API KEY REQUIRED".** The former English base-map provider now requires a key and returns a notice image that looks like a successful tile. Replaced by Esri World Street Map (keyless, HTTPS, Leaflet-compatible). Korean tiles unchanged. Language switching is race-safe (one tile layer, newest switch wins) and falls back to the Korean tiles if the English tiles cannot load.
* **Changed: "Official" tab -> "Official PDF".** Shows `map_korea.pdf` only: embedded on desktop (browser viewer: scroll + zoom), opened in a new tab on phones/tablets with a visible button (never blank). The old SVG-based Official content was removed.
* Tests: new `tools/e2e-suite-rc4.js`; all suites pass. Details: `DEPLOYMENT_VERIFICATION_RC4.md`.
