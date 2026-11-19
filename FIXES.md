# FIXES.md — superseded
Current status: **AUDIT_REPORT_RC2.md** (per-priority audit), **RELEASE_NOTES_V1_1.md**, **RELEASE_NOTES_V1_2.md** (latest; SVG coverage is now 472 placed / 182 unmatched — older figures in earlier notes are historical).
Tests: `node tools/e2e-suite.js`, `node tools/e2e-suite-rc2.js`, `node tools/e2e-suite-lang.js`. Reports: `SVG_COVERAGE.csv`, `SVG_MISSING_STATIONS.csv`. Matcher: `python3 tools/svg_label_match.py --emit`.
