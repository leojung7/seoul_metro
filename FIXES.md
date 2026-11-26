# FIXES.md — superseded
Current documentation: **IMPLEMENTATION_REPORT_V1_3.md** (latest: English map fix, travel times, multi-route), **RELEASE_NOTES_V1_3.md**, **TRAVEL_TIME_DATA_REPORT.md** (generated), earlier notes RELEASE_NOTES_V1_1/V1_2/RC4 and AUDIT_REPORT_RC2.md (historical).
Tests: `node tools/e2e-suite.js`, `e2e-suite-rc2.js`, `e2e-suite-lang.js`, `e2e-suite-rc4.js`, `e2e-suite-times.js`.
Data: `python3 tools/build_travel_times.py` regenerates `travel-times.js` and `TRAVEL_TIME_DATA_REPORT.md` from `data-sources/travel-times/*.csv`.
