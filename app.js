// ============================================================================
// SEOUL METRO HUB — APPLICATION ENGINE
// ============================================================================
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const hub = s => s.ln.length > 1;
const LC = g => D.L[g].c;
const hv = (a, b) => {
  // Never throw on missing/invalid stations: callers treat a non-finite distance as "unusable edge".
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lng) || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return Infinity;
  const p = Math.PI / 180;
  const d = (b.lat - a.lat) * p;
  const e = (b.lng - a.lng) * p;
  const h = Math.sin(d / 2) ** 2 + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(e / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const hs = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const kst = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
const P2 = n => String(n).padStart(2, "0");

const S = {
  tab: "geo",
  sel: null,
  pin: null,
  lang: "en",
  svgLang: "en",
  fav: JSON.parse(localStorage.getItem("smf") || "[]"),
  route: null,
  hubs: 0,
  pickTarget: null, // 'ra' | 'rb' when picking on map
  lines: { g: "1", all: 0, len: "all", q: "", tr: 0, cl: "ko", so: "o" },
  day: "wd"
};

// ---------------------------------------------------------------------------
// i18n: t("English text", {vars}) -> Korean when S.lang === "ko" (table in i18n.js). Missing keys fall back to English
// and are recorded in MISSING so they can be reported.
// ---------------------------------------------------------------------------
const MISSING = new Set();
const t = (k, v) => {
  let out = k;
  if (S.lang === "ko") { const x = (window.KO || {})[k]; if (x !== undefined) out = x; else MISSING.add(k); }
  return v ? out.replace(/\{(\w+)\}/g, (_, n) => (v[n] ?? "")) : out;
};
const LN = g => (S.lang === "ko" ? D.L[g].k : D.L[g].e);          // line label in the current language
// "Isu (이수)" in English mode, "이수" in Korean mode. Names that already contain brackets use " · " instead.
const bi = (en, ko) => (S.lang === "ko" ? ko : (en === ko ? en : (/[()]/.test(en + ko) ? `${en} · ${ko}` : `${en} (${ko})`)));
// primary name first in the current language, other language as secondary text
const nameHTML = (ko, en) => (S.lang === "ko" ? `<b>${esc(ko)}</b> <span class="mu">${esc(en)}</span>` : `<b>${esc(en)}</b> <span class="mu">${esc(ko)}</span>`);
const STATIC_ATTRS = ["placeholder", "title", "aria-label"];
function applyStaticI18n() {
  const skip = el => el.closest("#ib, #rres, #lst, #lgrid, #lban, #cov-body, #route-sum, #pk-list, #pk-line-chips, #mobile-search-results, #fav-list, #lens, #dl, #gl, #gcnt, #cnt, #dnote, #fcnt, #ttl, #sch-lang, #pick-banner-txt, #toast, svg, script, style, [data-noi18n]");
  const tr = (orig) => (S.lang === "ko" ? ((window.KO || {})[orig.trim()] ?? null) : null);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(n => {
    const el = n.parentElement; if (!el || skip(el)) return;
    if (n.__en === undefined) { if (!n.nodeValue.trim()) return; n.__en = n.nodeValue; }
    const k = tr(n.__en);
    if (k !== null) { const lead = n.__en.match(/^\s*/)[0], trail = n.__en.match(/\s*$/)[0]; n.nodeValue = lead + k + trail; }
    else { if (S.lang === "ko" && /[A-Za-z]{3}/.test(n.__en.replace(/[가-힣]+/g, ""))) MISSING.add(n.__en.trim()); n.nodeValue = n.__en; }
  });
  document.querySelectorAll("[placeholder],[title],[aria-label]").forEach(el => {
    if (skip(el)) return;
    el.__en = el.__en || {};
    STATIC_ATTRS.forEach(a => {
      if (!el.hasAttribute(a)) return;
      if (el.__en[a] === undefined) el.__en[a] = el.getAttribute(a);
      const k = tr(el.__en[a]);
      el.setAttribute(a, k !== null ? k : el.__en[a]);
    });
  });
}
const bdg = s => s.ln.map(g => `<span class="bd" style="background:${LC(g)}">${esc(LN(g))}</span>`).join("");
const isMobile = () => window.matchMedia("(max-width: 900px)").matches;
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let toastTimer;
function toast(msg, ms = 2600) {
  const el = $("#toast"); if (!el) return;
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
const lnk = (u, t) => `<a class="lk" target="_blank" rel="noopener" href="${u}">${t}</a>`;

// ---------------------------------------------------------------------------
// Line-specific display names. One station record, several names (e.g. 총신대입구/이수).
// Internal station index/ID is never duplicated or changed.
// ---------------------------------------------------------------------------
const dnames = (s, g) => {
  const o = g && s && s.displayNames && s.displayNames[g];
  return o ? { ko: o.ko, en: o.en } : { ko: s.ko, en: s.en };
};
const dname = (s, g, lang = S.lang) => dnames(s, g)[lang === "ko" ? "ko" : "en"];
const allDisplayNames = s => (s.displayNames ? Object.entries(s.displayNames).map(([g, n]) => ({ g, ko: n.ko, en: n.en })) : []);
// "4호선 총신대입구(이수) · 7호선 이수(총신대입구)" style label for tooltips / headers.
const lineNamesText = s => (s.displayNames
  ? s.ln.map(g => `${LN(g)} ${dnames(s, g)[S.lang === "ko" ? "ko" : "en"]}`).join(" · ")
  : s.ln.map(g => LN(g)).join(" · "));
// One label per station for contexts with no single line (favorites, generic lists): "총신대입구(이수) · 이수(총신대입구)".
const stationLabel = (s, lang = S.lang, g = null) => {
  if (g) return dname(s, g, lang);
  if (!s.displayNames) return lang === "ko" ? s.ko : s.en;
  const seen = [];
  s.ln.forEach(k => { const n = dname(s, k, lang); if (!seen.includes(n)) seen.push(n); });
  return seen.join(" · ");
};
// Same station, name as used on each line: [{g, ko, en}] (one entry per line; a single entry when all lines share a name).
const lineNameRows = s => s.ln.map(g => ({ g, ...dnames(s, g) }));
// Lines that use the SAME name are shown once: [{ko, en, gs:[lines]}] (e.g. 서울역 -> Seoul Station on 4 lines + "Seoul" on GTX-A)
const lineNameGroups = s => { const m = new Map(); lineNameRows(s).forEach(r => { const k = r.ko + "|" + r.en; if (!m.has(k)) m.set(k, { ko: r.ko, en: r.en, gs: [] }); m.get(k).gs.push(r.g); }); return [...m.values()]; };
const badgesFor = gs => gs.map(lineBadge).join(" ");
const lineBadge = g => `<span class="bd" style="background:${LC(g)}">${esc(LN(g))}</span>`;
const tipHTML = (s, g) => {
  const first = S.lang === "ko" ? "ko" : "en", second = first === "ko" ? "en" : "ko";
  if (g || !s.displayNames) return `<b>${esc(dname(s, g, first))}</b> · ${esc(dname(s, g, second))}<br>${g ? esc(LN(g)) : lineNamesText(s)}`;
  return lineNameGroups(s).map(r => `${badgesFor(r.gs)} <b>${esc(r[first])}</b> · ${esc(r[second])}`).join("<br>");
};
// Name to type into route fields for a station seen from line `g` (falls back to the plain name).
const routeFieldName = (s, g) => dnames(s, g || (S.tab === "lines" ? S.lines.g : null) || null).ko;

// Canonical station resolver shared by search, route inputs, and picker flows.
const stationKeys = s => Object.entries(s.cd || {}).map(([line, code]) => `${line}:${code}`);
const normStationText = v => {
  const base = String(v ?? "").trim().toLocaleLowerCase().replace(/[\s()（）·._'’`\-]/g, "");
  const stripped = base.replace(/(station|역)$/, "");
  return stripped || base;
};
function stationSearchValues(s) {
  const names = allDisplayNames(s).flatMap(n => [n.ko, n.en]);
  return [s.ko, s.en, s.ja, ...names, ...stationKeys(s), ...Object.values(s.cd || {}), ...(s.aliases || [])].filter(Boolean);
}
function searchStations(query, limit = 80) {
  const q = normStationText(query);
  if (!q) return ST.slice(0, limit);
  const scored = [];
  for (const s of ST) {
    const values = stationSearchValues(s);
    let best = 0;
    for (const raw of values) {
      const v = normStationText(raw);
      if (!v) continue;
      let sc = 0;
      if (v === q) sc = 100;
      else if (v.startsWith(q)) sc = 60;
      else if (v.includes(q)) sc = 20;
      // Station codes are matched literally (e.g. "222", "K110") and rank like exact names.
      if (sc && /^[a-z]?\d+(-\d+)?$/.test(v) && v === q) sc = 95;
      if (sc > best) best = sc;
    }
    if (best) scored.push({ s, sc: best + Math.min(8, s.ln.length * 2) - Math.min(5, s.ko.length / 4) });
  }
  scored.sort((a, b) => b.sc - a.sc || a.s.i - b.s.i);
  return scored.slice(0, limit).map(x => x.s);
}
function resolveStation(query) { return searchStations(query, 1)[0] || null; }
// Positions come from svg-positions.js (code-verified). The name-matched supplement (svg-positions-extra.js) is accepted
// ONLY when its point lies on a real station symbol of the official artwork (<= 4 units) AND that symbol is not also
// claimed by another station. Anything else is reported as unmatched rather than guessed.
const SVG_SYMBOL_POINTS = (() => {
  const pts = [], walk = v => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") { if (Number.isFinite(v.x) && Number.isFinite(v.y)) pts.push([v.x, v.y]); else Object.values(v).forEach(walk); } };
  if (typeof SVG_ALL_SYMBOLS !== "undefined") SVG_ALL_SYMBOLS.forEach(q => pts.push([q[0], q[1]]));   // all 767 symbols of the artwork
  else if (typeof SVG_SYMBOLS !== "undefined") walk(SVG_SYMBOLS);
  return pts;
})();
const symbolKey = p => Math.round(p.x) + "," + Math.round(p.y);
const nearestSymbol = p => { let b = Infinity; for (const [x, y] of SVG_SYMBOL_POINTS) { const d = Math.hypot(x - p.x, y - p.y); if (d < b) b = d; } return b; };
let SVG_EXTRA_OK = null;
const SVG_REJECTED_EXTRA = [];
function buildExtraOK() {
  SVG_EXTRA_OK = new Map();
  const claimed = new Map();                                   // symbol -> station indexes with a verified position
  const verifiedPos = s => { for (const key of stationKeys(s)) if (SVG_POSITIONS[key]) return SVG_POSITIONS[key]; return null; };
  ST.forEach(s => { const p = verifiedPos(s); if (p) (claimed.get(symbolKey(p)) || claimed.set(symbolKey(p), []).get(symbolKey(p))).push(s.i); });
  const cands = new Map();                                     // symbol -> candidate station indexes
  const pick = new Map(), src = new Map();
  ST.forEach(s => {
    if (verifiedPos(s)) return;
    // 1) label-offset match (validated by leave-one-out on code-verified stations) has priority
    if (typeof SVG_POSITIONS_LABEL !== "undefined") for (const key of stationKeys(s)) { const p = SVG_POSITIONS_LABEL[key]; if (p) { pick.set(s.i, p); src.set(s.i, "label"); break; } }
    // 2) otherwise the older name-matched supplement, only if it lies on a real station symbol
    if (!pick.has(s.i) && typeof SVG_POSITIONS_EXTRA !== "undefined") for (const key of stationKeys(s)) { const p = SVG_POSITIONS_EXTRA[key]; if (!p) continue;
      if (nearestSymbol(p) > 4) { SVG_REJECTED_EXTRA.push({ ko: s.ko, why: "not on an official station symbol" }); break; }
      pick.set(s.i, p); src.set(s.i, "extra"); break; }
  });
  pick.forEach((p, i) => { const k = symbolKey(p); (cands.get(k) || cands.set(k, []).get(k)).push(i); });
  pick.forEach((p, i) => {
    const k = symbolKey(p), mates = cands.get(k);
    const labelMates = mates.filter(j => src.get(j) === "label");
    const clash = claimed.has(k) || mates.length > 1 && !(src.get(i) === "label" && labelMates.length === 1);
    if (clash) { SVG_REJECTED_EXTRA.push({ ko: ST[i].ko, why: "symbol already used by another station" }); return; }
    SVG_EXTRA_OK.set(i, Object.assign({}, p, { approx: true }));
  });
}
// Two different stations can never sit on one symbol. If the code-verified table says they do (a name collision such
// as the two 양평 stations), keep the one whose geographic position best fits a global geo->schematic affine fit and
// report the other as unmatched.
let SVG_CONFLICT_LOSERS = null;
function buildConflictLosers() {
  SVG_CONFLICT_LOSERS = new Set();
  const placed = [], by = new Map();
  ST.forEach(s => { for (const key of stationKeys(s)) if (SVG_POSITIONS[key]) { const p = SVG_POSITIONS[key]; placed.push([s, p]); (by.get(symbolKey(p)) || by.set(symbolKey(p), []).get(symbolKey(p))).push(s); return; } });
  const groups = [...by.values()].filter(g => g.length > 1);
  if (!groups.length) return;
  // least-squares affine: x = a0 + a1*lng + a2*lat ; y likewise (normal equations, 3x3)
  const solve = (vals) => { const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], B = [0, 0, 0];
    placed.forEach(([s, p], k) => { const r = [1, s.lng, s.lat], v = vals(p); for (let i = 0; i < 3; i++) { B[i] += r[i] * v; for (let j = 0; j < 3; j++) A[i][j] += r[i] * r[j]; } });
    const M = A.map((row, i) => [...row, B[i]]);
    for (let i = 0; i < 3; i++) { let m = i; for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[m][i])) m = r; [M[i], M[m]] = [M[m], M[i]];
      for (let r = 0; r < 3; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let c = i; c < 4; c++) M[r][c] -= f * M[i][c]; } }
    return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]]; };
  const cx = solve(p => p.x), cy = solve(p => p.y);
  const resid = s => { const p = SVG_POSITIONS[stationKeys(s).find(k => SVG_POSITIONS[k])]; return Math.hypot(cx[0] + cx[1] * s.lng + cx[2] * s.lat - p.x, cy[0] + cy[1] * s.lng + cy[2] * s.lat - p.y); };
  groups.forEach(g => { const ranked = g.slice().sort((a, b) => resid(a) - resid(b)); ranked.slice(1).forEach(x => SVG_CONFLICT_LOSERS.add(x.i)); });
}
function svgPosition(s) {
  if (!s) return null;
  if (!SVG_CONFLICT_LOSERS) buildConflictLosers();
  if (SVG_CONFLICT_LOSERS.has(s.i)) return null;
  for (const key of stationKeys(s)) if (SVG_POSITIONS[key]) return SVG_POSITIONS[key];
  if (!SVG_EXTRA_OK) buildExtraOK();
  return SVG_EXTRA_OK.get(s.i) || null;
}
const SVG_PATH_POINT_CACHE = new Map();
function svgPathPoints(d) {
  if (SVG_PATH_POINT_CACHE.has(d)) return SVG_PATH_POINT_CACHE.get(d);
  const out = []; const re = /([ML])\s*(-?(?:\d+\.?\d*|\.\d+)),\s*(-?(?:\d+\.?\d*|\.\d+))/g;
  let m; while ((m = re.exec(d))) out.push([+m[2], +m[3]]);
  SVG_PATH_POINT_CACHE.set(d, out);
  return out;
}
// Parsed path + segment lengths are computed once per SVG path string.
const SVG_PATH_DATA_CACHE = new Map();
function svgPathData(d) {
  let c = SVG_PATH_DATA_CACHE.get(d);
  if (c) return c;
  const pts = svgPathPoints(d), lens = []; let total = 0;
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); lens.push(l); total += l; }
  c = { pts, lens, total }; SVG_PATH_DATA_CACHE.set(d, c);
  return c;
}
function projectToSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], den = dx * dx + dy * dy;
  const t = den ? Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / den)) : 0;
  const x = a[0] + t * dx, y = a[1] + t * dy;
  return { x, y, t, d: Math.hypot(p.x - x, p.y - y) };
}
const SVG_SEGMENT_CACHE = new Map();
function svgRouteSegment(line, aIndex, bIndex) {
  const key = line + "|" + aIndex + "|" + bIndex;
  if (SVG_SEGMENT_CACHE.has(key)) return SVG_SEGMENT_CACHE.get(key);
  let out = null;
  try { out = computeSvgRouteSegment(line, aIndex, bIndex); }
  catch (err) { console.warn("SVG route segment failed", key, err); }
  SVG_SEGMENT_CACHE.set(key, out);
  return out;
}
function computeSvgRouteSegment(line, aIndex, bIndex) {
  if (!ST[aIndex] || !ST[bIndex]) return null;
  const a = svgPosition(ST[aIndex]), b = svgPosition(ST[bIndex]);
  if (!a || !b) return null;
  let best = null;
  for (const d of (typeof SVG_ROUTE_PATHS !== "undefined" && SVG_ROUTE_PATHS[line]) || []) {
    const { pts, lens } = svgPathData(d); if (pts.length < 2) continue;
    let pa = null, pb = null, offset = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const len = lens[i];
      const qa = projectToSegment(a, pts[i], pts[i + 1]);
      const qb = projectToSegment(b, pts[i], pts[i + 1]);
      if (!pa || qa.d < pa.d) pa = { ...qa, pos: offset + qa.t * len, index: i };
      if (!pb || qb.d < pb.d) pb = { ...qb, pos: offset + qb.t * len, index: i };
      offset += len;
    }
    if (!pa || !pb || pa.d > 35 || pb.d > 35) continue;
    const start = Math.min(pa.pos, pb.pos), end = Math.max(pa.pos, pb.pos);
    if (!best || pa.d + pb.d < best.error) {
      const forward = pa.pos <= pb.pos, first = forward ? pa : pb, last = forward ? pb : pa;
      const clipped = [[first.x, first.y]]; let walked = 0;
      for (let i = 0; i < lens.length; i++) {
        const next = walked + lens[i];
        if (next > start + 0.001 && next < end - 0.001) clipped.push(pts[i + 1]);
        walked = next;
      }
      clipped.push([last.x, last.y]);
      if (!forward) clipped.reverse();
      best = { error: pa.d + pb.d, d: "M " + clipped.map((p, i) => (i ? "L " : "") + p[0] + "," + p[1]).join(" ") };
    }
  }
  return best ? best.d : null;
}
const GEO_AUDIT = (() => {
  let total=0, invalidPoints=0; const invalidLines=[], suspiciousJumps=[];
  Object.entries(D.G || {}).forEach(([g, segments]) => (segments || []).forEach((seg, si) => {
    let prev=null; (seg || []).forEach((pt, pi) => {
      total++; const [lat,lng] = pt || [];
      const valid=Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180;
      if (!valid) { invalidPoints++; invalidLines.push({line:g,segment:si,index:pi,point:pt}); prev=null; return; }
      if (prev) { const km=hv({lat:prev[0],lng:prev[1]},{lat,lng}); if(km>20) suspiciousJumps.push({line:g,segment:si,from:prev,to:pt,distanceKm:+km.toFixed(2)}); }
      prev=pt;
    });
  }));
  return {totalPoints:total, invalidPoints, invalidLines, suspiciousJumps};
})();
const SVG_MATCH_AUDIT = (() => {
  const pos = ST.map(s => ({ s, p: svgPosition(s) }));
  const verified = pos.filter(x => x.p && !x.p.approx), approx = pos.filter(x => x.p && x.p.approx), un = pos.filter(x => !x.p);
  return { total: ST.length, matched: verified.length + approx.length, verified: verified.length, approximate: approx.length, unmatched: un.length,
    unmatchedStations: un.map(({ s }) => ({ id: s.i, ko: s.ko, en: s.en, lines: s.ln, keys: stationKeys(s) })),
    approximateStations: approx.map(({ s }) => ({ id: s.i, ko: s.ko, en: s.en, lines: s.ln })) };
})();

// Internal constant for the route search cost of an interchange walk. It is NOT shown to users.
const WALK = () => 4;

// "Typical interval (not real-time)": a general guide for metro Lines 2-8 only. Other lines vary too much
// by train type and time of day to state a number honestly, so they say so instead.
const TYPICAL_INTERVAL = { peak: "3–5", off: "6–10" };
const hasTypicalInterval = g => /^[2-8]$/.test(g); // Lines 1 and 9 mix express/regional services, so no single range is stated
function intervalCard(s) {
  const rows = s.ln.slice(0, 6).map(g => `<div style="display:flex;justify-content:space-between;gap:8px;margin:3px 0"><span>${lineBadge(g)}</span><span style="text-align:right">${hasTypicalInterval(g)
    ? `${t("Peak")}: <b>${TYPICAL_INTERVAL.peak} ${t("min")}</b> · ${t("Off-peak")}: <b>${TYPICAL_INTERVAL.off} ${t("min")}</b>`
    : `<span class="mu">${t("Varies by line, train type and time of day")}</span>`}</span></div>`).join("");
  return `<div class="card"><b>🚇 ${t("Typical interval (not real-time)")}</b>${rows}<div class="mu">${t("General guide only. No live arrivals are shown; check the operator for current timetables.")}</div></div>`;
}

// ============================================================================
// 1. STATION INFO DRAWER
// ============================================================================
const ib = () => $("#ib");
function infoHTML(s) {
  const lat = Number.isFinite(s.lat) ? s.lat.toFixed(5) : "", lng = Number.isFinite(s.lng) ? s.lng.toFixed(5) : "", q = encodeURIComponent(s.ko + "역");
  const codes = Object.entries(s.cd).map(([g, c]) => `<span class="bd" style="background:${LC(g)}">${esc(c)}</span>`).join("");
  const xfer = hub(s) ? `<span class="bd" style="background:#b45309">${t("🔀 Transfer available")}</span>` : "";
  const ja = s.ja && s.ja !== "nan" ? ` · ${esc(s.ja)}` : "";
  // English mode: "Gangnam (강남)"; Korean mode: "강남" with the English name as secondary text.
  const heading = (en, ko, big) => S.lang === "ko"
    ? `<h2 style="margin:0;font-size:${big}px">${esc(ko)}</h2><div class="mu">${esc(en)}${ja}</div>`
    : `<h2 style="margin:0;font-size:${big}px">${esc(bi(en, ko))}</h2>${big > 20 && ja ? `<div class="mu">${ja.slice(3)}</div>` : ""}`;
  const title = s.displayNames
    ? lineNameGroups(s).map((r, k) => `<div style="margin-top:${k ? 8 : 0}px">${badgesFor(r.gs)}${heading(r.en, r.ko, k ? 18 : 22)}</div>`).join("")
    : heading(s.en, s.ko, 22);
  return `<div style="display:flex;justify-content:space-between;gap:8px">
    <div style="min-width:0">${title}</div>
    <div style="display:flex;gap:5px;flex:none">
      <button id="ifav" aria-label="${esc(t("⭐ Favorites"))}">${S.fav.includes(s.ko) ? "⭐" : "☆"}</button>
      <button id="ix" title="${esc(t("Close"))}">✕</button>
    </div>
  </div>
  <div style="margin:6px 0">${bdg(s)} ${xfer}</div>
  <div class="mu">${t("Station codes")} ${codes}</div>
  ${!svgPosition(s) ? `<div class="rs-warn" role="note">⚠ ${t("No position on the schematic map for this station.")} <button type="button" class="mini-btn" id="igeo">${t("🌍 Show on Geo map")}</button></div>` : ""}
  ${s.geoEst ? `<div class="mu" style="margin-top:4px">≈ ${t("Approximate map position (not surveyed).")}</div>` : ""}
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0">
    <button id="io">${t("🟢 Origin")}</button>
    <button id="id">${t("🔴 Destination")}</button>
    <button id="ig">${t("🌍 Show on map")}</button>
  </div>
  ${intervalCard(s)}
  <div class="card station-media">
    <b>${t("📷 Maps & media")}</b>
    <div class="mu">${t("Explore photos, videos and local information for this station.")}</div>
    <div class="media-actions">
      ${lnk(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.ko + "역, Seoul")}`, t("📍 Google Maps & photos (if available)"))}
      ${lnk(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(s.ko + "역 Seoul station")}`, t("🖼️ Google Images"))}
      ${lnk(`https://www.youtube.com/results?search_query=${encodeURIComponent(s.ko + "역 Seoul station")}`, t("▶ YouTube"))}
      ${lnk("https://map.naver.com/p/search/" + q, t("Naver Map"))}
      ${lnk("https://map.kakao.com/link/search/" + q, t("Kakao Map"))}
    </div>
    <div class="media-actions voice-actions">
      <button type="button" id="speak-ko" class="media-btn">${t("🔊 Hear Korean name")}</button>
      <button type="button" id="speak-en" class="media-btn">${t("🔊 Hear English name")}</button>
      <button type="button" id="copy-station" class="media-btn">${t("📋 Copy station names")}</button>
    </div>
    <div id="media-status" class="mu" aria-live="polite"></div>
    <div class="nearby-links">
      <b>${t("Explore near {name}", { name: esc(S.lang === "ko" ? s.ko : s.en) })}</b>
      <div class="media-actions">
        ${lnk(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("attractions near " + s.ko + " station Seoul")}`, t("🏛️ Attractions"))}
        ${lnk(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("restaurants near " + s.ko + " station Seoul")}`, t("🍜 Food"))}
        ${lnk(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("shopping near " + s.ko + " station Seoul")}`, t("🛍️ Shopping"))}
        ${lnk(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("cafes near " + s.ko + " station Seoul")}`, t("☕ Cafés"))}
      </div>
    </div>
  </div>
  <div class="mu">${t("WGS84 {lat}, {lng}", { lat, lng })}</div>`;
}

function wireInfo(s) {
  const $i = x => ib()?.querySelector(x) || null;
  const bind = (selector, handler) => { const el = $i(selector); if (el) el.onclick = handler; return el; };
  bind("#ifav", () => {
    const k = S.fav.indexOf(s.ko);
    k >= 0 ? S.fav.splice(k, 1) : S.fav.push(s.ko);
    localStorage.setItem("smf", JSON.stringify(S.fav));
    favUI();
    const button = $i("#ifav"); if (button) button.textContent = S.fav.includes(s.ko) ? "⭐" : "☆";
  });
  bind("#ix", () => {
    if (isMobile()) setSheet(null);
    else { S.sel = null; S.pin = null; if (ib()) ib().innerHTML = placeholder(); redraw(); }
  });
  bind("#igeo", () => { tab("geo"); if (MAP) MAP.setView([s.lat, s.lng], 14); });
  bind("#io", () => { const field = $("#ra"); if (field) field.value = routeFieldName(s); tab("route"); });
  bind("#id", () => { const field = $("#rb"); if (field) field.value = routeFieldName(s); tab("route"); });
  bind("#ig", () => { tab("geo"); setTimeout(() => MAP && MAP.setView([s.lat, s.lng], 15), 150); });
  const mediaStatus = $i("#media-status");
  const speak = (text, lang) => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      if (mediaStatus) mediaStatus.textContent = t("Speech playback is not available in this browser or device.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.88;
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.toLowerCase().startsWith(lang.toLowerCase()));
    if (voice) utterance.voice = voice;
    utterance.onerror = () => { if (mediaStatus) mediaStatus.textContent = t("The selected device could not play this voice."); };
    window.speechSynthesis.speak(utterance);
    if (mediaStatus) mediaStatus.textContent = lang === "ko-KR" ? t("Playing Korean station name…") : t("Playing English station name…");
  };
  bind("#speak-ko", () => speak(s.ko + "역", "ko-KR"));
  bind("#speak-en", () => speak(s.en, "en-US"));
  bind("#copy-station", async () => {
    const value = `${s.ko}역 / ${s.en}`;
    try {
      await navigator.clipboard.writeText(value);
      if (mediaStatus) mediaStatus.textContent = t("Copied: {v}", { v: value });
    } catch {
      const field = document.createElement("textarea");
      field.value = value; field.style.position = "fixed"; field.style.opacity = "0";
      document.body.appendChild(field); field.select();
      const ok = document.execCommand("copy"); field.remove();
      if (mediaStatus) mediaStatus.textContent = ok ? t("Copied: {v}", { v: value }) : t("Copy is unavailable in this browser.");
    }
  });
}

const placeholder = () => `<div class="card"><b>${t("Station information")}</b><br><span class="mu">${t("Tap a station on the map, the Lines list or a search result to see its lines, codes and transfers.")}</span></div>`;
function render(s) { if (!s) { ib().innerHTML = placeholder(); return; } ib().innerHTML = infoHTML(s); wireInfo(s); }
function setSheet(m) {
  const e = $("#info");
  if (!e) return;
  e.classList.remove("peek", "half", "full");
  e.style.transform = ""; e.style.transition = ""; e.style.height = "";
  if (m) e.classList.add(m);
  document.body.dataset.sheet = m || "hidden";
  e.setAttribute("aria-hidden", (m || !isMobile()) ? "false" : "true");
  const body = $("#ib"); if (body && m === "peek") body.scrollTop = 0;
}

function handleStationClick(i, center) {
  if (!Number.isInteger(i) || !ST[i]) { console.warn("Ignored invalid station selection", i); return; }
  if (S.pickTarget) {
    const s = ST[i];
    $("#" + S.pickTarget).value = routeFieldName(s);
    finishMapPick();
    tab("route");
    doRoute();
    return;
  }
  select(i, center);
}

function select(i, center) {
  const s = ST[i];
  if (!s) { console.warn("Station selection unavailable", i); return false; }
  S.sel = s;
  S.pin = s;
  render(s);
  if (isMobile() && document.body.dataset.sheet === "hidden") setSheet("peek");
  redraw();
  if (center !== false && S.tab === "sch") focusSch(s);
  if (S.tab === "geo" && MAP && center !== false) MAP.panTo([s.lat, s.lng]);
  return true;
}

let pvT;
function preview(i) {
  if (innerWidth <= 900 || !matchMedia("(hover:hover)").matches) return;
  clearTimeout(pvT);
  pvT = setTimeout(() => { if (!S.sel || S.sel.i !== i) render(ST[i]); }, 90);
}
function unpreview() {
  if (innerWidth <= 900) return;
  clearTimeout(pvT);
  pvT = setTimeout(() => { if (S.pin) render(S.pin); else ib().innerHTML = placeholder(); }, 160);
}

// Apple-Maps-style bottom sheet (mobile only): peek / half / full, live finger-follow drag,
// velocity-aware snapping and swipe-down-to-close. One implementation; CSS owns the resting states.
const sheetEl = $("#info"), sheetHandle = $("#sheet-h"), sheetClose = $("#sheet-x");
const sheetStates = ["hidden", "peek", "half", "full"];
function sheetState() { return document.body.dataset.sheet || "hidden"; }
function sheetVisiblePx(st) {
  const cs = getComputedStyle(document.documentElement);
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const full = parseFloat(getComputedStyle(sheetEl).maxHeight) || (vh - 54);
  const peek = parseFloat(cs.getPropertyValue("--sheet-peek")) || 176;
  const half = (parseFloat(cs.getPropertyValue("--sheet-half")) || 0.56) * vh;
  return st === "full" ? full : st === "half" ? Math.min(half, full) : st === "peek" ? Math.min(peek, full) : 0;
}
function cycleSheet(dir) {
  const st = sheetState(), order = ["peek", "half", "full"];
  if (st === "hidden") { setSheet("peek"); return; }
  const i = order.indexOf(st);
  setSheet(dir ? order[Math.max(0, Math.min(2, i + dir))] : order[(i + 1) % 3]);
}
sheetHandle.addEventListener("click", () => { if (!sheetHandle._dragged) cycleSheet(0); sheetHandle._dragged = false; });
sheetHandle.addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cycleSheet(0); }
  else if (e.key === "ArrowUp") { e.preventDefault(); cycleSheet(1); }
  else if (e.key === "ArrowDown") { e.preventDefault(); cycleSheet(-1); }
});
if (sheetClose) sheetClose.addEventListener("click", () => setSheet(null));

// Gesture rules (like Apple Maps): the grab bar always drags the sheet. On the content area in peek/half, swiping UP
// grows the sheet and swiping DOWN at the top shrinks it; in full the content scrolls natively (bar collapses it).
// The sheet follows the finger live by setting its height; on release it snaps (velocity-aware) to hidden/peek/half/full.
let sheetDrag = null;
function sheetStart(e) {
  if (!isMobile() || e.touches.length !== 1) return;
  const st = sheetState();
  if (st === "hidden") return;
  if (e.target.closest("input[type=range], select, textarea, .no-sheet-drag")) return;
  if (e.target.closest("#sheet-x")) return;
  const fromBar = !!e.target.closest("#sheet-bar");
  if (st === "full" && !fromBar) return;   // full: content scrolls natively; the grab bar collapses the sheet
  const y = e.touches[0].clientY;
  sheetDrag = { y0: y, h0: sheetEl.getBoundingClientRect().height, st, fromBar, dragging: fromBar, last: y, lastT: performance.now(), v: 0, moved: false };
}
function sheetMove(e) {
  const d = sheetDrag; if (!d) return;
  const y = e.touches[0].clientY, dy = y - d.y0;
  if (!d.dragging) {
    if (Math.abs(dy) < 6) return;
    const body = $("#ib");
    const atTop = !body || body.scrollTop <= 0;
    if (dy < 0) { d.dragging = true; }                                       // swipe up: grow
    else if (dy > 0 && atTop) { d.dragging = true; }                         // swipe down from top: shrink
    else { sheetDrag = null; return; }                                       // otherwise let the content scroll natively
    d.y0 = y; d.h0 = sheetEl.getBoundingClientRect().height;
  }
  if (e.cancelable) e.preventDefault();
  const now = performance.now();
  d.v = (y - d.last) / Math.max(1, now - d.lastT); d.last = y; d.lastT = now;
  const maxH = sheetVisiblePx("full");
  const h = Math.max(0, Math.min(maxH, d.h0 - (y - d.y0)));
  sheetEl.style.transition = "none";
  sheetEl.style.height = h + "px";
  d.moved = true; sheetHandle._dragged = d.fromBar;
}
function endSheetDrag() {
  const d = sheetDrag; sheetDrag = null;
  if (!d || !d.moved) return;
  const h = sheetEl.getBoundingClientRect().height;
  const projected = h - d.v * 120; // v > 0 = finger moving down
  let best = "peek", bd = Infinity;
  for (const st of sheetStates) { const dist = Math.abs(sheetVisiblePx(st) - projected); if (dist < bd) { bd = dist; best = st; } }
  sheetEl.style.transition = ""; sheetEl.style.height = "";
  void sheetEl.offsetHeight;
  setSheet(best === "hidden" ? null : best);
}
sheetEl.addEventListener("touchstart", sheetStart, { passive: true });
sheetEl.addEventListener("touchmove", sheetMove, { passive: false });
sheetEl.addEventListener("touchend", endSheetDrag);
sheetEl.addEventListener("touchcancel", endSheetDrag);

// ============================================================================
// 2. SCHEMATIC VIEWPORT (KOREAN / ENGLISH SVG TOGGLE WITHOUT RESETTING PAN/ZOOM)
// ============================================================================
const sv = $("#sch");
let VB = [0, 0, 5724, 6516];
const vb = () => sv.setAttribute("viewBox", VB.join(" "));

function updateSchBackground() {
  const file = S.svgLang === "ko" ? "Seoul_subway_linemap_ko.svg" : "Seoul_subway_linemap_en.svg";
  $("#sch-bg").innerHTML = `<image href="${file}" x="0" y="0" width="5724" height="6516" preserveAspectRatio="xMidYMid meet"/>`;
  $("#sch-lang").textContent = S.svgLang === "ko" ? "🌐 SVG: 한국어" : "🌐 SVG: English";
}

// ---- Route overlay (official SVG): computed once per route, cached on S.routeMeta ----
function getRouteOverlay() {
  const path = S.route, meta = S.routeMeta;
  if (!path || path.length < 2) return { parts: [], dashed: [], warnings: [], markers: [], points: [] };
  if (meta && meta.overlay && meta.overlay.pathKey === path.join(",")) return meta.overlay;
  const warnings = [], parts = [], dashed = [], points = [];
  const hops = (meta && meta.hops && meta.hops.length) ? meta.hops : path.slice(0, -1).map((a, i) => ({ a, b: path[i + 1], g: null }));
  // Walk the stations in order. Consecutive positioned stations use the real SVG line segment; stations with no
  // position on the official map are bridged with a dashed straight connector so the route stays continuous.
  let last = -1, skipped = [];
  for (let i = 0; i < path.length; i++) {
    const s = ST[path[i]];
    if (!s) { warnings.push({ from: path[i], to: path[i], reason: "unknown_station_index" }); skipped.push("#" + path[i]); continue; }
    const here = svgPosition(s);
    if (!here) { skipped.push(s.ko); continue; }
    if (last >= 0) {
      const prev = ST[path[last]], pp = svgPosition(prev);
      if (last === i - 1) {
        const h = hops[i - 1] || {}, shared = (prev.ln || []).filter(g => (s.ln || []).includes(g));
        const lines = h.g ? [h.g, ...shared.filter(g => g !== h.g)] : shared;
        let d = null;
        for (const g of lines) { d = svgRouteSegment(g, prev.i, s.i); if (d) break; }
        if (d) parts.push(d);
        else { dashed.push("M " + pp.x + "," + pp.y + " L " + here.x + "," + here.y); warnings.push({ from: prev.i, to: s.i, names: [prev.ko, s.ko], reason: "straight_connector_used" }); }
      } else {
        dashed.push("M " + pp.x + "," + pp.y + " L " + here.x + "," + here.y);
        warnings.push({ from: prev.i, to: s.i, names: [...skipped], reason: "bridged_missing_position" });
      }
    }
    last = i; skipped = [];
  }
  const marker = (idx, color, label, r) => {
    const s = ST[idx], pos = s && svgPosition(s);
    if (!pos) { if (s) warnings.push({ from: idx, to: idx, names: [s.ko], reason: "missing_svg_position" }); return ""; }
    points.push([pos.x, pos.y]);
    return `<g pointer-events="none"><circle cx="${pos.x}" cy="${pos.y}" r="${r}" fill="${color}" stroke="#fff" stroke-width="10"/><circle cx="${pos.x}" cy="${pos.y}" r="${r + 8}" fill="none" stroke="#0f172a" stroke-opacity=".55" stroke-width="4"/><text x="${pos.x}" y="${pos.y}" dy=".36em" text-anchor="middle" font-size="${Math.round(r * 1.15)}" font-weight="800" fill="#fff" font-family="Inter,Arial,sans-serif">${label}</text></g>`;
  };
  const m = meta || { origin: path[0], dest: path[path.length - 1], transfers: [] };
  const markers = [
    ...(m.transfers || []).map(i => marker(i, "#f59e0b", "↔", 30)),
    marker(m.origin, "#16a34a", "A", 38),
    marker(m.dest, "#dc2626", "B", 38)
  ];
  path.forEach(i => { const s = ST[i], pos = s && svgPosition(s); if (pos) points.push([pos.x, pos.y]); });
  const overlay = { pathKey: path.join(","), parts, dashed, warnings, markers, points };
  if (meta) meta.overlay = overlay;
  return overlay;
}

const routeMissing = w => [...new Set((w || []).filter(x => x.reason === "missing_svg_position" || x.reason === "bridged_missing_position").flatMap(x => x.names || []))];
const routeApprox = w => (w || []).filter(x => x.reason === "straight_connector_used" || x.reason === "bridged_missing_position").length;
function drawSch() {
  if (!$("#sch-bg").innerHTML) updateSchBackground();
  const ov = getRouteOverlay();
  const routeWarnings = ov.warnings;
  if (ov.parts.length || ov.dashed.length) {
    // 3 layers so the route reads on any background: dark halo, white outline, red centre line.
    // Bridged (no-position) stretches use a dashed red centre so they are visibly approximate.
    const stroke = (list, w, c, o, dash) => list.map(d => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-opacity="${o}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ""} pointer-events="none"/>`).join("");
    const all = [...ov.parts, ...ov.dashed];
    $("#sch-route").innerHTML = stroke(all, 84, "#0f172a", 0.28) + stroke(all, 66, "#ffffff", 0.97) + stroke(ov.parts, 32, "#e11d2e", 1) + stroke(ov.dashed, 32, "#e11d2e", 1, "52 34") + ov.markers.join("");
  } else {
    $("#sch-route").innerHTML = ov.markers.join("");
  }

  window.SCHEMATIC_ROUTE_WARNINGS = routeWarnings;
  const miss = routeMissing(routeWarnings).length;
  const _A = SVG_MATCH_AUDIT;
  $("#cnt").textContent = miss
    ? t("{m}/{t} on map ({v} verified · {a} approx.) · {u} not placed · {x} on this route", { m: _A.matched, t: ST.length, v: _A.verified, a: _A.approximate, u: _A.unmatched, x: miss })
    : t("{m}/{t} on map ({v} verified · {a} approx.) · {u} not placed", { m: _A.matched, t: ST.length, v: _A.verified, a: _A.approximate, u: _A.unmatched });

  // Interactive clickable hit targets for every station with a verified SVG identity.
  $("#sch-hits").innerHTML = ST.map(s => {
    const p = svgPosition(s);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return "";
    const hb = hub(s);
    const sel = S.sel === s;
    const dim = S.hubs && !hb;
    const rVis = sel ? 22 : hb ? 13 : 8;
    return `<g data-i="${s.i}" style="cursor:pointer;opacity:${dim ? 0.15 : 1}">
      <circle cx="${p.x}" cy="${p.y}" r="28" fill="transparent"/>
      <circle cx="${p.x}" cy="${p.y}" r="${rVis}" fill="${sel ? "#f85149" : hb ? "#ffffff" : LC(s.ln[0])}" fill-opacity="${sel ? 0.9 : 0.45}" stroke="${sel ? "#fff" : "#0f172a"}" stroke-width="${sel ? 5 : 2.5}"${p.approx ? ' stroke-dasharray="6 5"' : ""}/>
    </g>`;
  }).join("");
  renderRouteSummary();
}

function fitRouteSch() {
  const ov = getRouteOverlay();
  if (!ov.points.length) { toast(t("This route has no stations on the official map. Try the Geo map."), 3600); return false; }
  const xs = ov.points.map(p => p[0]), ys = ov.points.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const r = (sv.clientHeight / sv.clientWidth) || 1.1;
  const pad = 260, topExtra = isMobile() ? 380 : 120;
  let w = Math.max(900, x1 - x0 + pad * 2, (y1 - y0 + pad * 2 + topExtra) / r), h = w * r;
  VB = [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2 - topExtra / 2, w, h];
  vb();
  return true;
}
function routeHops() {
  const m0 = S.routeMeta;
  if (m0 && m0.hops && m0.hops.length) return m0.hops;
  return S.route.slice(1).map((b, k) => ({ a: S.route[k], b, g: ST[b].ln.find(x => ST[S.route[k]].ln.includes(x)) }));
}
function fitRouteGeo() {
  if (!MAP || !S.route) return;
  const pts = geoRoutePath(routeHops().filter(h => h.g)).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  // Keep the route clear of the floating summary card (top on mobile) and the layer controls.
  // Keep the route clear of the floating summary card, wherever it sits (top on phones, bottom-left on desktop).
  const sum = $("#route-sum"), mapEl = $("#map");
  let padTop = 70, padBottom = isMobile() ? 130 : 40;
  if (sum && !sum.hidden && mapEl) {
    const c = sum.getBoundingClientRect(), m = mapEl.getBoundingClientRect();
    if (c.top - m.top < m.height / 2) padTop = Math.max(padTop, c.bottom - m.top + 24); else padBottom = Math.max(padBottom, m.bottom - c.top + 24);
  }
  if (pts.length) MAP.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [40, padTop], paddingBottomRight: [40, padBottom], padding: [60, 60], maxZoom: 15 });
}

// ---- Route summary card shown over either map ----
function renderRouteSummary() {
  const box = $("#route-sum"); if (!box) return;
  const m = S.routeMeta;
  if (!m || !S.route || !(S.tab === "sch" || S.tab === "geo")) { box.hidden = true; return; }
  const w = window.SCHEMATIC_ROUTE_WARNINGS || [];
  const names = routeMissing(w), approx = routeApprox(w);
  const a = ST[m.origin], b = ST[m.dest];
  box.hidden = false;
  box.innerHTML = `<div class="rs-head"><b>🟢 ${a ? esc(snm(a, m.firstLine)) : ""} → 🔴 ${b ? esc(snm(b, m.lastLine)) : ""}</b><button type="button" id="rs-clear" class="mini-btn" aria-label="${esc(t("Clear route"))}">✕</button></div>
    <div class="rs-metrics">🔄 ${t(m.tr === 1 ? "{n} transfer" : "{n} transfers", { n: m.tr })} · 🚉 ${t("{n} stops", { n: m.stops })} · 📏 ≈ ${m.km.toFixed(1)} km</div>
    <div class="rs-legend"><span><i style="background:#16a34a"></i>${t("Start")}</span><span><i style="background:#f59e0b"></i>${t("Transfer")}</span><span><i style="background:#dc2626"></i>${t("End")}</span></div>
    ${S.tab === "sch" && names.length ? `<div class="rs-warn" role="status">⚠ ${t("{n} station(s) on this route have no position on the official map ({names}). The red line is bridged with a dashed connector; the Geo map shows the full path.", { n: names.length, names: esc(names.slice(0, 5).join(", ")) + (names.length > 5 ? "…" : "") })}</div>` : ""}
    ${S.tab === "sch" && approx && !names.length ? `<div class="mu">${t("{n} segment(s) drawn as a straight connector.", { n: approx })}</div>` : ""}
    <div class="rs-actions"><button type="button" id="rs-results">${t("← Route results")}</button><button type="button" id="rs-switch">${S.tab === "sch" ? t("🌍 Geo map") : t("🗺️ Schematic")}</button></div>`;
}
if ($("#route-sum")) $("#route-sum").addEventListener("click", e => {
  if (e.target.closest("#rs-clear")) { S.route = null; S.routeMeta = null; renderRouteSummary(); redraw(); return; }
  if (e.target.closest("#rs-results")) {
    tab("route");
    const sel = document.querySelector("#p-route .route-option.selected") || document.querySelector("#p-route .route-option");
    if (sel) sel.scrollIntoView({ block: "start", behavior: "smooth" });
    return;
  }
  if (e.target.closest("#rs-switch")) showRouteOnMap(S.routeIdx || 0, S.tab === "sch" ? "geo" : "sch");
});

function makeRouteMeta(route, idx) {
  const hops = route.hops || [];
  return { idx, origin: route.path[0], dest: route.path[route.path.length - 1], hops,
    transfers: route.SG.filter(x => x.t).map(x => x.s.i), tr: route.tr, stops: route.stops, km: route.km,
    label: route.label, firstLine: hops.length ? hops[0].g : null, lastLine: hops.length ? hops[hops.length - 1].g : null };
}
// One call does everything: switch to the map, highlight, zoom, summary, toast.
function showRouteOnMap(idx, view) {
  const r = S.routes && S.routes[idx];
  if (!r) { toast(t("Calculate a route first.")); return; }
  S.routeIdx = idx; S.route = r.path; S.routeMeta = makeRouteMeta(r, idx);
  if (isMobile() && sheetState() !== "hidden") setSheet(null);
  tab(view === "geo" ? "geo" : "sch");
  requestAnimationFrame(() => {
    renderRouteSummary();
    if (view === "geo") { drawGeo(); fitRouteGeo(); } else fitRouteSch();
    const miss = routeMissing(window.SCHEMATIC_ROUTE_WARNINGS).length;
    toast(view !== "geo" && miss ? t("Displaying route ({n} station(s) approximated on this map)", { n: miss }) : t("Displaying route"));
  });
}

function fitSch() { VB = [0, 0, 5724, 6516]; vb(); }
function focusSch(s) {
  const p = svgPosition(s);
  if (!p) { console.warn("Schematic coordinate unavailable", s.ko, stationKeys(s)); return false; }
  const w = Math.min(VB[2], 1800);
  const r = (sv.clientHeight / sv.clientWidth) || 1.1;
  VB = [p.x - w / 2, p.y - (w * r) / 2, w, w * r];
  vb();
  return true;
}
function zoom(k, cx, cy) {
  const r = sv.getBoundingClientRect();
  cx = cx ?? r.width / 2;
  cy = cy ?? r.height / 2;
  const mx = VB[0] + (cx / r.width) * VB[2];
  const my = VB[1] + (cy / r.height) * VB[3];
  const nw = Math.max(400, Math.min(7200, VB[2] * k));
  const nk = nw / VB[2];
  VB = [mx - (mx - VB[0]) * nk, my - (my - VB[1]) * nk, nw, VB[3] * nk];
  vb();
}

function panzoom(el, getVB, setVB) {
  const pts = new Map();
  let moved = 0, pd = 0;
  el.addEventListener("wheel", e => {
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const v = getVB();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    const k = e.deltaY > 0 ? 1.15 : 0.87;
    const mx = v[0] + (cx / r.width) * v[2], my = v[1] + (cy / r.height) * v[3];
    const nw = Math.max(400, Math.min(7200, v[2] * k)), nk = nw / v[2];
    setVB([mx - (mx - v[0]) * nk, my - (my - v[1]) * nk, nw, v[3] * nk]);
  }, { passive: false });

  el.addEventListener("pointerdown", e => {
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    moved = 0;
    pd = 0;
  });
  el.addEventListener("pointermove", e => {
    if (!pts.has(e.pointerId)) return;
    const o = pts.get(e.pointerId), n = [e.clientX, e.clientY];
    if (pts.size === 1) {
      const v = getVB(), r = el.getBoundingClientRect();
      const dx = n[0] - o[0], dy = n[1] - o[1];
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 6) setVB([v[0] - (dx * v[2]) / r.width, v[1] - (dy * v[3]) / r.height, v[2], v[3]]);
    }
    pts.set(e.pointerId, n);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pd) {
        const v = getVB(), r = el.getBoundingClientRect();
        const cx = (a[0] + b[0]) / 2 - r.left, cy = (a[1] + b[1]) / 2 - r.top;
        const k = pd / d;
        const mx = v[0] + (cx / r.width) * v[2], my = v[1] + (cy / r.height) * v[3];
        const nw = Math.max(400, Math.min(7200, v[2] * k)), nk = nw / v[2];
        setVB([mx - (mx - v[0]) * nk, my - (my - v[1]) * nk, nw, v[3] * nk]);
      }
      pd = d;
      moved = 99;
    }
  });
  const up = e => { pts.delete(e.pointerId); pd = 0; };
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("click", e => { if (moved > 6) { e.stopPropagation(); e.preventDefault(); } }, true);
}

panzoom(sv, () => VB, v => { VB = v; vb(); });

// Hover tooltip + click on SVG schematic
const tip = $("#sch-tip");
sv.addEventListener("click", e => {
  const g = e.target.closest("[data-i]");
  if (g) handleStationClick(+g.dataset.i, false);
});
sv.addEventListener("mousemove", e => {
  const g = e.target.closest("[data-i]");
  if (!g) { tip.hidden = true; return; }
  const s = ST[+g.dataset.i];
  tip.hidden = false;
  tip.style.left = Math.min(innerWidth - 220, e.clientX + 14) + "px";
  tip.style.top = Math.max(62, e.clientY - 28) + "px";
  tip.innerHTML = tipHTML(s, null);
  preview(s.i);
});
sv.addEventListener("mouseleave", () => { tip.hidden = true; unpreview(); });

// Toggle KO / EN SVG WITHOUT resetting VB (pan/zoom preserved!)
$("#sch-lang").onclick = () => {
  S.svgLang = S.svgLang === "en" ? "ko" : "en";
  S.lang = S.svgLang;
  $("#ttl").textContent = S.lang === "en" ? "Seoul Metro Hub" : "서울 지하철 허브";
  updateSchBackground();
  if (S.tab === "lines") drawLines();
};
$("#zi").onclick = () => zoom(0.8);
$("#zo").onclick = () => zoom(1.25);
$("#fit").onclick = fitSch;
$("#hubs").onclick = e => { S.hubs ^= 1; e.currentTarget.classList.toggle("on", !!S.hubs); drawSch(); };

// ============================================================================
// GEO COORDINATES: data.js is authoritative (coordinates from the master station CSV). Nothing is interpolated or
// repaired here. `ap` (approximation flag) is 0 for every station in the current data; if a future data build sets it,
// those stations are flagged as approximate on the map.
// ============================================================================
const GEO_TRUST = { total: ST.length, verified: 0, estimated: 0, estimatedNames: [], repaired: [] };
ST.forEach(s => { s.geoEst = !!s.ap; if (s.geoEst) { GEO_TRUST.estimated++; GEO_TRUST.estimatedNames.push(s.ko); } else GEO_TRUST.verified++; });

// Geographic path between two consecutive stations of one line. Uses the hand-drawn D.G curve ONLY when both
// stations really sit on it (<80 m) and neither position is an estimate; otherwise a straight chord — so the
// drawn line always passes through the station markers.
const GEO_SEG_CACHE = new Map(), GEO_PATH_CACHE = new Map();
function geoSegs(g) {
  if (GEO_SEG_CACHE.has(g)) return GEO_SEG_CACHE.get(g);
  const segs = ((D.G || {})[g] || []).map(seg => {
    const pts = (seg || []).filter(p => p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hv({ lat: pts[i - 1][0], lng: pts[i - 1][1] }, { lat: pts[i][0], lng: pts[i][1] }));
    return { pts, cum };
  }).filter(sg => sg.pts.length > 1);
  GEO_SEG_CACHE.set(g, segs); return segs;
}
function projectOnSeg(seg, p) {
  const kx = 111.32 * Math.cos(p.lat * Math.PI / 180), ky = 110.574; let best = { d: Infinity };
  for (let i = 1; i < seg.pts.length; i++) {
    const a = seg.pts[i - 1], b = seg.pts[i];
    const ax = (a[1] - p.lng) * kx, ay = (a[0] - p.lat) * ky, bx = (b[1] - p.lng) * kx, by = (b[0] - p.lat) * ky;
    const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; let u = l ? (-ax * dx - ay * dy) / l : 0; u = Math.max(0, Math.min(1, u));
    const d = Math.hypot(ax + u * dx, ay + u * dy);
    if (d < best.d) best = { d, i, t: seg.cum[i - 1] + u * (seg.cum[i] - seg.cum[i - 1]) };
  }
  return best;
}
function geoPathBetween(g, A, B) {
  const key = g + "|" + A.i + "|" + B.i;
  if (GEO_PATH_CACHE.has(key)) return GEO_PATH_CACHE.get(key);
  let out = [[A.lat, A.lng], [B.lat, B.lng]];
  if (!A.geoEst && !B.geoEst) {
    for (const seg of geoSegs(g)) {
      const pa = projectOnSeg(seg, A), pb = projectOnSeg(seg, B);
      if (pa.d > 0.08 || pb.d > 0.08 || Math.abs(pa.t - pb.t) < 1e-6) continue;
      const lo = Math.min(pa.t, pb.t), hi = Math.max(pa.t, pb.t), mid = [];
      seg.pts.forEach((pt, j) => { if (seg.cum[j] > lo + 1e-6 && seg.cum[j] < hi - 1e-6) mid.push(pt); });
      if (pa.t > pb.t) mid.reverse();
      out = [[A.lat, A.lng], ...mid, [B.lat, B.lng]]; break;
    }
  }
  GEO_PATH_CACHE.set(key, out); return out;
}
// Ordered geographic polyline for one route (RT entry) or an explicit hop list [{a,b,g}].
function geoRoutePath(hops) {
  const pts = [];
  hops.forEach(h => { const A = ST[h.a], B = ST[h.b]; if (!A || !B) return; const seg = geoPathBetween(h.g, A, B); (pts.length ? seg.slice(1) : seg).forEach(p => pts.push(p)); });
  return pts;
}

// ============================================================================
// 3. GEO MAP (OPENSTREETMAP + CONTINUOUS ORDERED STATION POLYLINES)
// ============================================================================
let MAP = null, GL, TL;

// Base map per language. Both providers are keyless HTTPS raster tile services that work from any static host
// (GitHub Pages) with plain Leaflet; no API key or token is involved anywhere.
//   ko -> OpenStreetMap standard tiles (UNCHANGED): place labels in the local language (Korean in Korea).
//   en -> Esri World Street Map tiles: place labels in English.
// Station labels, markers, tooltips and sheets are localized by the app itself and never depend on the tiles.
//
// HISTORICAL NOTE (root cause of the "API KEY REQUIRED" map): English mode used to load the Voyager raster tiles from the
// provider that was formerly the "en" entry here. That provider now answers every tile request with a normal 200 PNG that is
// itself a notice reading "API KEY REQUIRED". Leaflet therefore fired "load", not "tileerror", and the switch-over logic
// in setTiles() accepted the notice image as a working base map. Korean mode (OpenStreetMap) was never affected.
const TILE_SOURCES = {
  ko: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", sub: "abc", maxNativeZoom: 19,
        attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' },
  en: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", sub: "", maxNativeZoom: 19,
        attr: 'Tiles &copy; <a href="https://www.esri.com">Esri</a> &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong) and the GIS User Community' }
};
// If the English tiles cannot be loaded at all on first paint, fall back to the Korean (OpenStreetMap) tiles instead of a blank map.
const TILE_FALLBACK = { en: "ko" };
let TL_LANG = null, TL_PENDING = null, TL_TOKEN = 0;    // TL_PENDING / TL_TOKEN: only the newest language switch may change the base map
const TILE_DOWN = {};                                   // lang -> timestamp of the last failed attempt (retry after 60 s)
function cancelPendingTiles() { if (TL_PENDING) { try { MAP.removeLayer(TL_PENDING); } catch (e) {} TL_PENDING = null; } }
function setTiles(lang, force) {
  if (!MAP) return;
  // Already showing this language: just drop any half-finished switch to another language.
  if (TL && TL_LANG === lang && !force) { if (TL_PENDING) { cancelPendingTiles(); TL_TOKEN++; } return; }
  if (TILE_DOWN[lang] && Date.now() - TILE_DOWN[lang] < 60000 && !force) return;
  cancelPendingTiles();
  const c = TILE_SOURCES[lang] || TILE_SOURCES.ko, old = TL, token = ++TL_TOKEN;
  const opts = { maxZoom: 19, maxNativeZoom: c.maxNativeZoom, attribution: c.attr };
  if (c.sub) opts.subdomains = c.sub;
  const next = L.tileLayer(c.url, opts);
  next.__lang = lang;
  let errors = 0, loaded = false, done = false;
  const finish = ok => {
    if (done) return; done = true;
    if (TL_PENDING === next) TL_PENDING = null;
    if (token !== TL_TOKEN) { try { MAP.removeLayer(next); } catch (e) {} return; }       // a newer language switch superseded this one
    if (ok) { if (old && old !== next) MAP.removeLayer(old); TL = next; TL_LANG = lang; return; }
    MAP.removeLayer(next); TILE_DOWN[lang] = Date.now();
    if (TL === next) { TL = null; TL_LANG = null; }
    toast(t(lang === "ko" ? "Korean map tiles are unavailable; keeping the current map. Station labels are still in the selected language." : "English map tiles are unavailable; keeping the current map. Station labels are still in the selected language."), 4200);
    const fb = TILE_FALLBACK[lang];
    if (!TL && fb && fb !== lang) setTiles(fb, true);   // nothing on screen yet: use the fallback provider rather than a blank map
  };
  next.on("load", () => { loaded = true; finish(true); });
  next.on("tileerror", () => { if (!loaded && ++errors >= 4) finish(false); });
  if (!old) TL = next, TL_LANG = lang; else TL_PENDING = next;   // first paint is shown at once; later switches keep the old layer until the new one has loaded
  next.addTo(MAP);
}
const tiles = () => setTiles(S.lang, true);             // used by the theme toggle

function rebuildGeoSelect() {
  const sel = $("#gl"); if (!sel) return;
  const keep = sel.value || "*";
  sel.querySelectorAll("option:not([value='*'])").forEach(o => o.remove());
  LO.forEach(g => sel.insertAdjacentHTML("beforeend", `<option value="${g}">${esc(S.lang === "ko" ? D.L[g].k + " · " + D.L[g].e : D.L[g].e + " · " + D.L[g].k)}</option>`));
  sel.value = keep;
}
function initGeo() {
  if (MAP) { setTimeout(() => MAP.invalidateSize(), 80); return; }
  MAP = L.map("map").setView([37.5547, 126.9707], 11);
  L.control.scale({ imperial: false }).addTo(MAP);
  setTiles(S.lang);
  GL = L.layerGroup().addTo(MAP);

  rebuildGeoSelect();
  $("#gl").onchange = drawGeo;
  $("#loc").onclick = () => navigator.geolocation && navigator.geolocation.getCurrentPosition(p => {
    let b = null, m = 1e9;
    ST.forEach(s => {
      const d = hv(s, { lat: p.coords.latitude, lng: p.coords.longitude });
      if (d < m) { m = d; b = s; }
    });
    if (b) { MAP.setView([b.lat, b.lng], 14); handleStationClick(b.i, false); }
  });
  drawGeo();
}

function drawGeo() {
  if (!MAP) return;
  GL.clearLayers();
  const f = $("#gl").value;
  const on = g => f === "*" || f === g;

  // Network lines are built from each route's ORDERED stations (RT), so every marker lies on its line by construction.
  // The hand-drawn D.G curve is used between two stations only where both really sit on it (see geoPathBetween).
  RT.forEach(r => {
    if (!on(r.g) || !D.L[r.g]) return;
    const hops = []; for (let k = 1; k < r.a.length; k++) hops.push({ a: r.a[k - 1], b: r.a[k], g: r.g });
    const pts = geoRoutePath(hops);
    if (pts.length > 1) L.polyline(pts, { color: LC(r.g), weight: f === "*" ? 3.5 : 5.5, opacity: S.route ? 0.45 : 0.88, lineJoin: "round", lineCap: "round", interactive: false }).addTo(GL);
  });

  if (S.route && S.route.length > 1) {
    const m0 = S.routeMeta;
    const hops = (m0 && m0.hops && m0.hops.length) ? m0.hops : S.route.slice(1).map((b, k) => ({ a: S.route[k], b, g: (ST[b].ln.find(x => ST[S.route[k]].ln.includes(x))) }));
    const ll = geoRoutePath(hops.filter(h => h.g));
    if (ll.length > 1) {
      const o = { lineCap: "round", lineJoin: "round", interactive: false };
      L.polyline(ll, { ...o, color: "#0f172a", weight: 17, opacity: 0.3 }).addTo(GL);
      L.polyline(ll, { ...o, color: "#ffffff", weight: 13, opacity: 0.97 }).addTo(GL);
      L.polyline(ll, { ...o, color: "#e11d2e", weight: 6, opacity: 1 }).addTo(GL);
    }
    const pin = (idx, color, label, tip) => {
      const s = ST[idx]; if (!s || !Number.isFinite(s.lat)) return;
      L.marker([s.lat, s.lng], { zIndexOffset: 1000, interactive: false, keyboard: false, icon: L.divIcon({ className: "rt-pin-wrap", html: `<div class="rt-pin" style="background:${color}">${label}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }) })
        .addTo(GL).bindTooltip(tip + ": " + esc(dname(s, null)));
    };
    const m = S.routeMeta || { origin: S.route[0], dest: S.route[S.route.length - 1], transfers: [] };
    (m.transfers || []).forEach(i => pin(i, "#f59e0b", "↔", "Transfer"));
    pin(m.origin, "#16a34a", "A", "Origin");
    pin(m.dest, "#dc2626", "B", "Destination");
  }

  let n = 0;
  // Stations on the displayed route are drawn LAST (on top) and slightly larger, so they stay selectable even when the
  // route is zoomed out and neighbouring markers overlap.
  const onRoute = new Set(S.route || []);
  const rm = S.routeMeta || {};
  const rank = i => (i === rm.origin || i === rm.dest) ? 3 : (rm.transfers || []).includes(i) ? 2 : onRoute.has(i) ? 1 : 0;   // start/end on top
  const ordered = ST.slice().sort((a, b) => rank(a.i) - rank(b.i));
  ordered.forEach(s => {
    if (f !== "*" && !s.ln.includes(f)) return;
    n++;
    const h = hub(s);
    const m = L.circleMarker([s.lat, s.lng], {
      sid: s.i,
      radius: onRoute.has(s.i) ? 8 : h ? 6.5 : 4,
      color: s === S.sel ? "#f85149" : "#111",
      weight: s === S.sel ? 3 : h ? 2 : s.geoEst ? 1.5 : 1,
      dashArray: s.geoEst ? "2 2" : null,
      fillColor: h ? "#fff" : LC(s.ln[0]),
      fillOpacity: s.geoEst ? 0.55 : 1
    }).addTo(GL);
    m.bindTooltip(tipHTML(s, f !== "*" ? f : null) + (s.geoEst ? "<br><i>≈ approximate position</i>" : ""));
    m.on("click", () => handleStationClick(s.i, false));
    m.on("mouseover", () => preview(s.i));
    m.on("mouseout", unpreview);
  });
  renderRouteSummary();
  $("#gcnt").textContent = t("{n} stations · {v} verified", { n, v: GEO_TRUST.verified });
}

// ============================================================================
// 4. LINES TAB (CONNECTED TRUNKS & BRANCHES)
// ============================================================================
// Length filters/statistics ignore any parenthetical text, including the parentheses: "Isu(Chongshin Univ.)" -> "Isu" (3),
// "총신대입구(이수)" -> "총신대입구" (5). Only the COUNT changes; the displayed name is untouched.
const nameForLength = name => String(name).replace(/\s*\([^)]*\)/g, "");
const cl = (s, g) => { const n = dnames(s, g); return S.lines.cl === "ko" ? nameForLength(n.ko).replace(/\s/g, "").length : nameForLength(n.en).replace(/[^A-Za-z0-9]/g, "").length; };
const lineRow = (s, g, cls = "") => { const n = dnames(s, g); return `<div class="row ${cls}" data-i="${s.i}" role="button" tabindex="0"><div class="trk" style="--c:${LC(g)}"><b class="${hub(s) ? "h" : ""}"></b></div><div style="flex:1;min-width:0">${nameHTML(n.ko, n.en)} <span class="mu">${cl(s, g)}${S.lang === "ko" ? "자" : ""}</span><br>${bdg(s)}</div></div>`; };

function drawLines() {
  const g = S.lines.g, A = S.lines.all;
  $("#lgrid").innerHTML = LO.map(k => `<button data-g="${k}" class="${!A && g === k ? "on" : ""}" style="text-align:left;display:flex;gap:8px;align-items:center">
    <span class="bd" style="background:${LC(k)};min-width:26px;text-align:center">${/^\d$/.test(k) ? k : k.slice(0, 3)}</span>
    <span style="min-width:0"><b style="font-size:12px">${LN(k)}</b><br><span class="mu">${t("{n} stations",{n:GS[k].length})}</span></span>
  </button>`).join("");

  const q = S.lines.q.trim().toLowerCase();
  const matchFn = s => {
    if (S.lines.tr && !hub(s)) return false;
    const L = cl(s, g), m = S.lines.len;
    if (m !== "all" && (m === "6+" ? L < 6 : L !== +m)) return false;
    return !q || s.ko.includes(q) || s.en.toLowerCase().includes(q) || allDisplayNames(s).some(n => n.ko.includes(q) || n.en.toLowerCase().includes(q)) || s.ln.some(k => D.L[k].k.toLowerCase().includes(q) || D.L[k].e.toLowerCase().includes(q));
  };

  $("#lens").innerHTML = ["all", "2", "3", "4", "5", "6+"].map(x => `<button data-len="${x}" class="${S.lines.len == x ? "on" : ""}">${x === "all" ? t("All") : t("{n} letters",{n:x})}</button>`).join("");
  $("#lban").innerHTML = `<span class="bd" style="background:${LC(g)}">${LN(g)}</span> <b>${esc(S.lang === "ko" ? D.L[g].e : D.L[g].k)}</b> <span class="mu">${t("{n} stops",{n:GS[g].length})}${D.L[g].x ? " · " + t("express service") : ""}</span>`;

  // Group into connected Trunk & Branch sections in route order
  const branches = RT.filter(r => r.g === g && r.id !== "5a");
  let totalShown = 0;

  if (S.lines.so === "o") {
    $("#lst").classList.remove("flat");
    $("#lst").innerHTML = branches.map(br => {
      const sts = br.a.map(i => ST[i]).filter(matchFn);
      totalShown += sts.length;
      if (!sts.length) return "";
      const title = S.lang === "ko" ? br.label.ko : br.label.en;
      const rows = sts.map((s, idx) => lineRow(s, g, idx === 0 ? "first" : idx === sts.length - 1 ? "last" : "")).join("");
      return `<div class="branch-hdr" style="--c:${LC(g)}"><span>${title}</span><span class="mu">${t("{n} stations",{n:sts.length})}</span></div>${rows}`;
    }).join("") || `<div class="mu" style="padding:30px;text-align:center">${t("No stations match.")}</div>`;
  } else {
    const f = GS[g].map(i => ST[i]).filter(matchFn);
    totalShown = f.length;
    if (S.lines.so === "en") f.sort((a, b) => dname(a, g, "en").localeCompare(dname(b, g, "en"), "en"));
    else f.sort((a, b) => dname(a, g, "ko").localeCompare(dname(b, g, "ko"), "ko"));
    $("#lst").classList.add("flat");
    $("#lst").innerHTML = f.map(s => lineRow(s, g)).join("");
  }
  $("#fcnt").textContent = t("{n} stations",{n:totalShown});
}

$("#lgrid").onclick = e => { const b = e.target.closest("[data-g]"); if (b) { S.lines.g = b.dataset.g; S.lines.all = 0; drawLines(); } };
$("#lens").onclick = e => { const b = e.target.closest("[data-len]"); if (b) { S.lines.len = b.dataset.len; drawLines(); } };
$("#so").onchange = e => { S.lines.so = e.target.value; drawLines(); };
$("#cl").onchange = e => { S.lines.cl = e.target.value; drawLines(); };
$("#lf").oninput = e => { S.lines.q = e.target.value; drawLines(); };
$("#tr").onchange = e => { S.lines.tr = e.target.checked ? 1 : 0; drawLines(); };
$("#lst").addEventListener("click", e => { const r = e.target.closest("[data-i]"); if (r) select(+r.dataset.i); });
$("#lst").addEventListener("mouseover", e => { const r = e.target.closest("[data-i]"); if (r) preview(+r.dataset.i); });
$("#lst").addEventListener("mouseout", e => { if (e.target.closest("[data-i]")) unpreview(); });

// ============================================================================
// 5. ROUTE PLANNER & STATION PICKER MODAL (TYPING / LINE LIST / PICK ON MAP)
// ============================================================================
const SPD = { "GTX-A": 75, "공항철도": 70, "신분당선": 48, "경의선": 42, "수인분당선": 42, "경춘선": 42, "경강선": 42, "4": 36, "9": 36, "1": 36 };

const ROUTE_DATA_WARNINGS = [];
function validRouteStationIndex(i) {
  const s = Number.isInteger(i) ? ST[i] : null;
  return !!s && Number.isFinite(s.lat) && Number.isFinite(s.lng) && s.lat >= -90 && s.lat <= 90 && s.lng >= -180 && s.lng <= 180;
}
function plan(a, b, pri, ex) {
  if (!validRouteStationIndex(a) || !validRouteStationIndex(b)) {
    ROUTE_DATA_WARNINGS.push({type:"invalid-endpoint", from:a, to:b});
    return null;
  }
  const ride = (g, km) => ((km * 1.25) / ((ex === "x" && SPD[g]) || (["우이신설경전철", "의정부경전철", "용인경전철", "김포도시철도", "신림선"].includes(g) ? 26 : 32))) * 60 + 0.6;
  const adj = {}, add = (u, v, c, t) => { (adj[u] = adj[u] || []).push([v, c, t]); };
  RT.forEach(r => {
    if (!r || typeof r !== "object") { ROUTE_DATA_WARNINGS.push({type:"invalid-route-record"}); return; }
    if (!Array.isArray(r.a)) { ROUTE_DATA_WARNINGS.push({type:"invalid-route-stations", route:r.id}); return; }
    const A = r.a;
    if (!D.L[r.g]) { ROUTE_DATA_WARNINGS.push({type:"unknown-line", route:r.id, line:r.g}); return; }
    for (let i = 0; i < A.length - 1; i++) {
      if (!validRouteStationIndex(A[i]) || !validRouteStationIndex(A[i + 1])) {
        ROUTE_DATA_WARNINGS.push({type:"invalid-station-reference", route:r.id, index:i, from:A[i], to:A[i+1]});
        continue;
      }
      if (A[i] !== A[i + 1]) {
        const km = hv(ST[A[i]], ST[A[i + 1]]), t = ride(r.g, km);
        if (!Number.isFinite(km)) { ROUTE_DATA_WARNINGS.push({type:"invalid-distance", route:r.id, index:i}); continue; }
        add(A[i] + "|" + r.id, A[i + 1] + "|" + r.id, t, { k: "r", km, t, r, a: A[i], b: A[i + 1] });
        add(A[i + 1] + "|" + r.id, A[i] + "|" + r.id, t, { k: "r", km, t, r, a: A[i + 1], b: A[i] });
      }
    }
    if (r.loop && r.id !== "6l" && A.length > 1) {
      const u = A[A.length - 1], v = A[0];
      if (validRouteStationIndex(u) && validRouteStationIndex(v)) {
        const km = hv(ST[u], ST[v]), t = ride(r.g, km);
        if (Number.isFinite(km))
        add(u + "|" + r.id, v + "|" + r.id, t, { k: "r", km, t, r, a: u, b: v });
        add(v + "|" + r.id, u + "|" + r.id, t, { k: "r", km, t, r, a: v, b: u });
      } else ROUTE_DATA_WARNINGS.push({type:"invalid-loop-endpoint", route:r.id, from:u, to:v});
    }
  });
  ST.filter(s => validRouteStationIndex(s.i)).forEach(s => {
    const rs = RT.filter(r => r && Array.isArray(r.a) && r.a.includes(s.i) && D.L[r.g]);
    rs.forEach(r1 => rs.forEach(r2 => {
      if (r1 === r2) return;
      const same = r1.g === r2.g, w = same ? 0.2 : WALK(s), c = same ? 0.2 : w + (pri === "t" ? 18 : 4);
      add(s.i + "|" + r1.id, s.i + "|" + r2.id, c, { k: "t", w: same ? 0 : w, s, g1: r1.g, g2: r2.g });
    }));
  });
  const dist = {}, prev = {}, done = new Set();
  RT.filter(r => r.a.includes(a)).forEach(r => (dist[a + "|" + r.id] = 0));
  let end = null;
  for (;;) {
    let bk = null, bv = 1e9;
    for (const k in dist) if (!done.has(k) && dist[k] < bv) { bv = dist[k]; bk = k; }
    if (!bk) break;
    done.add(bk);
    if (+bk.split("|")[0] === b) { end = bk; break; }
    (adj[bk] || []).forEach(([v, c, t]) => {
      if (!done.has(v) && (dist[v] == null || bv + c < dist[v])) { dist[v] = bv + c; prev[v] = [bk, t]; }
    });
  }
  if (!end) return null;
  const edges = [];
  for (let k = end; prev[k]; k = prev[k][0]) edges.unshift(prev[k][1]);
  return edges;
}

function summarizeRoute(a, E, b) {
  let km = 0, tr = 0, walk = 0, min = 0, stops = 0;
  const gs = new Set(), SG = [], path = [a.i], hops = [];
  E.forEach(e => {
    if (e.k === "r") {
      km += e.km; min += e.t; stops++; gs.add(e.r.g); path.push(e.b); hops.push({ a: e.a, b: e.b, g: e.r.g });
      const last = SG[SG.length - 1];
      if (last && !last.t && last.g === e.r.g) { last.to = e.b; last.c++; }
      else SG.push({ g: e.r.g, from: e.a, to: e.b, c: 1 });
    } else if (e.g1 !== e.g2) {
      tr++; walk += e.w; SG.push({ t: 1, s: e.s, w: e.w, g1: e.g1, g2: e.g2 });
    }
  });
  return { km, tr, walk, min, stops, gs, SG, path, hops };
}

// Transfer label uses each line's own naming when they differ (e.g. 총신대입구(이수) → 이수(총신대입구)).
function stepStation(s, g1, g2) {
  const a = dnames(s, g1), b = dnames(s, g2);
  if (a.ko === b.ko && a.en === b.en) return bi(a.en, a.ko);
  return S.lang === "ko" ? `${a.ko} → ${b.ko}` : `${a.en} → ${b.en} (${a.ko} → ${b.ko})`;
}
const snm = (s, g) => { const n = dnames(s, g); return bi(n.en, n.ko); };   // "Seoul Station (서울역)" / "서울역"
function routeOptionHTML(route, a, b, index, selected) {
  const rides = route.SG.filter(x => !x.t);
  const steps = route.SG.map(x => x.t
    ? `<div class="route-step transfer-step">🔄 <b>${esc(t("Transfer at {name}", { name: stepStation(x.s, x.g1, x.g2) }))}</b> <span class="mu">${esc(LN(x.g1))} → ${esc(LN(x.g2))}</span></div>`
    : `<div class="route-step" style="border-left-color:${LC(x.g)}"><span class="bd" style="background:${LC(x.g)}">${esc(LN(x.g))}</span> <b>${esc(t("Board {line}", { line: LN(x.g) }))}</b><br>${esc(snm(ST[x.from], x.g))} → ${esc(snm(ST[x.to], x.g))} <span class="mu">${esc(t("{n} stops", { n: x.c }))}</span></div>`
  ).join("") + (rides.length ? `<div class="route-step">🏁 <b>${esc(t("Exit at {name}", { name: snm(ST[rides[rides.length - 1].to], rides[rides.length - 1].g) }))}</b></div>` : "");
  return `<article class="route-option ${selected ? "selected" : ""}">
    <div class="route-option-head"><b>${esc(t(route.label))}</b>${selected ? `<span class="route-tag">${t("Matches your preference")}</span>` : ""}</div>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin:6px 0">${rides.map(x => lineBadge(x.g)).join('<span class="mu">→</span>')}</div>
    <div class="route-metrics"><span>🚉 ${t("Stops")}: ${route.stops}</span><span>🔄 ${t("Transfers")}: ${route.tr}</span><span>📏 ${t("Distance")}: ≈ ${route.km.toFixed(1)} km</span></div>
    <div class="mu">${t("Route path and distance are calculated from station positions. No live service information (arrivals, delays) is shown.")}</div>
    <div class="route-actions"><button type="button" class="on" data-route-geo="${index}">${t("🌍 Show on map")}</button><button type="button" data-route-map="${index}">${t("🗺️ Schematic")}</button><button type="button" data-route-steps="${index}" aria-expanded="false" aria-controls="route-steps-${index}">${t("Show / hide steps")}</button></div>
    <div class="route-steps" id="route-steps-${index}" hidden>${steps}</div>
  </article>`;
}

function doRoute(keepSelection) {
  const prev = keepSelection ? { route: S.route, meta: S.routeMeta, idx: S.routeIdx } : null;
  const a = resolveStation($("#ra").value);
  const b = resolveStation($("#rb").value);
  const o = $("#rres");
  if (!a || !b || a === b) {
    o.innerHTML = `<div class="card mu">${t("Choose two different stations (type, browse by line, or pick on map).")}</div>`;
    return;
  }
  ROUTE_DATA_WARNINGS.length = 0;
  S.route = null; S.routeMeta = null; S.routes = [];
  const express = $("#rx").value;
  const candidates = [
    { key: "f", label: "📏 Shortest route", edges: plan(a.i, b.i, "f", express) },
    { key: "t", label: "🔄 Fewer transfers", edges: plan(a.i, b.i, "t", express) }
  ].filter(x => x.edges);
  if (!candidates.length) {
    const warningCount = ROUTE_DATA_WARNINGS.length;
    o.innerHTML = `<div class="card">${t("No route found.")}${warningCount ? ` <span class="mu">${t("{n} route-data issue(s) were skipped safely; check the validation report.", { n: warningCount })}</span>` : ""}</div>`;
    return;
  }
  const routes = [];
  candidates.forEach(candidate => {
    const summary = summarizeRoute(a, candidate.edges, b);
    const signature = summary.path.join(",") + "|" + summary.SG.map(x => x.t ? `${x.g1}>${x.g2}@${x.s.i}` : x.g).join(",");
    const existing = routes.find(r => r.signature === signature);
    if (existing) existing.label = "📏 Shortest and fewest transfers (same route)";
    else routes.push({ ...summary, label: candidate.label, key: candidate.key, signature });
  });
  const preferred = $("#rp").value;
  const preferredRoute = routes.find(r => r.key === preferred) || routes[0];
  S.routes = routes; S.routeIdx = Math.max(0, routes.indexOf(preferredRoute));
  const typedLine = (st, text) => st.displayNames ? (Object.keys(st.displayNames).find(g => st.displayNames[g].ko === String(text).trim()) || null) : null;
  const fl = typedLine(a, $("#ra").value) || (preferredRoute.hops[0] ? preferredRoute.hops[0].g : null), ll = typedLine(b, $("#rb").value) || (preferredRoute.hops.length ? preferredRoute.hops[preferredRoute.hops.length - 1].g : null);
  o.innerHTML = `<div class="route-intro"><b>${esc(snm(a, fl))} → ${esc(snm(b, ll))}</b><div class="mu">${t("Compare the calculated alternatives below. This is a planning aid, not live train information.")}</div>
    ${lnk(`https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&travelmode=transit`, t("🗺️ Open directions in Google Maps"))}</div>
    <div class="route-compare">${routes.map((r, i) => routeOptionHTML(r, a, b, i, r === preferredRoute)).join("")}</div>`;
  o.querySelectorAll("[data-route-map]").forEach(button => {
    button.onclick = () => showRouteOnMap(+button.dataset.routeMap, "sch");
  });
  o.querySelectorAll("[data-route-geo]").forEach(button => {
    button.onclick = () => showRouteOnMap(+button.dataset.routeGeo, "geo");
  });
  o.querySelectorAll("[data-route-steps]").forEach(button => {
    button.onclick = () => {
      const panel = $("#route-steps-" + button.dataset.routeSteps);
      panel.hidden = !panel.hidden;
      button.setAttribute("aria-expanded", String(!panel.hidden));
    };
  });
  if (prev && prev.route && prev.idx < routes.length) { S.route = prev.route; S.routeMeta = prev.meta; S.routeIdx = prev.idx; }
  warnRouteData();
}
function warnRouteData() { if (ROUTE_DATA_WARNINGS.length) console.warn(ROUTE_DATA_WARNINGS.length + " route-data issue(s) skipped safely", ROUTE_DATA_WARNINGS.slice(0, 10)); }

$("#go").onclick = doRoute;
$("#sw").onclick = () => { const t = $("#ra").value; $("#ra").value = $("#rb").value; $("#rb").value = t; doRoute(); };

// Station Picker Modal (Typing / Browse by Line / Pick on Map)
let pkTarget = "ra", pkLine = "1";
let modalOpener = null;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function openModal(el, focusSel) {
  modalOpener = document.activeElement;
  el.hidden = false;
  const f = (focusSel && el.querySelector(focusSel)) || el.querySelector(FOCUSABLE);
  if (f) f.focus();
}
function closeModal(el) {
  el.hidden = true;
  if (modalOpener && document.contains(modalOpener) && typeof modalOpener.focus === "function") modalOpener.focus();
  modalOpener = null;
}
// Focus trap: Tab / Shift+Tab never leave the open modal.
document.addEventListener("keydown", e => {
  if (e.key !== "Tab") return;
  const m = [...document.querySelectorAll(".modal")].find(x => !x.hidden); if (!m) return;
  const f = [...m.querySelectorAll(FOCUSABLE)].filter(x => x.offsetParent !== null); if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (!m.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
function openStationPicker(targetField) {
  pkTarget = targetField;
  $("#picker-title").textContent = targetField === "ra" ? t("🟢 Select Origin Station") : t("🔴 Select Destination Station");
  $("#pk-q").value = "";
  openModal($("#picker-modal"), "#pk-q");
  setPickerMode("search");
}

function setPickerMode(mode) {
  $$(".pk-mode").forEach(b => b.classList.toggle("on", b.dataset.mode === mode));
  if (mode === "sch" || mode === "geo") {
    $("#picker-modal").hidden = true;
    S.pickTarget = pkTarget;
    document.body.classList.add("picking");
    $("#pick-banner").hidden = false;
    $("#pick-banner-txt").textContent = t(pkTarget === "ra" ? "Tap any station on the map to set Origin (🟢)" : "Tap any station on the map to set Destination (🔴)");
    tab(mode);
    return;
  }
  $("#pk-search-box").hidden = mode !== "search";
  $("#pk-line-box").hidden = mode !== "line";
  if (mode === "line") {
    $("#pk-line-chips").innerHTML = LO.map(g => `<button type="button" data-g="${g}" class="mini-btn ${pkLine === g ? "on" : ""}" style="border-left:4px solid ${LC(g)}">${LN(g)}</button>`).join("");
  }
  renderPickerList(mode);
}

function renderPickerList(mode) {
  const q = $("#pk-q").value.trim();
  const list = mode === "line"
    ? (GS[pkLine] || []).map(i => ST[i]).filter(Boolean)
    : searchStations(q, 80);

  const rows = [];
  list.forEach(s => {
    if (mode === "line" || !s.displayNames) { const n = dnames(s, mode === "line" ? pkLine : null); rows.push({ s, n, badge: bdg(s) }); }
    else lineNameGroups(s).forEach(r => rows.push({ s, n: { ko: r.ko, en: r.en }, badge: badgesFor(r.gs) }));
  });
  $("#pk-list").innerHTML = rows.map(({ s, n, badge }) => `<div class="pk-row" data-i="${s.i}" data-name="${esc(n.ko)}" role="button" tabindex="0">
    <div>${nameHTML(n.ko, n.en)}</div>
    <div>${badge}</div>
  </div>`).join("") || `<div class="mu" style="padding:16px;text-align:center">${t("No matching stations.")}</div>`;
}

function finishMapPick() {
  S.pickTarget = null;
  document.body.classList.remove("picking");
  $("#pick-banner").hidden = true;
}

// ---- Schematic coverage report: nothing is silently hidden; unplaced stations are listed and still reachable ----
const covModal = $("#cov-modal");
function renderCoverage() {
  const A = SVG_MATCH_AUDIT;
  const lineTxt = x => x.lines.map(g => LN(g)).join(" · ");
  $("#cov-body").innerHTML = `<div class="card">${t("{t} stations in total",{t:A.total})}<br>
    ${t("✅ {v} verified positions on the official map",{v:A.verified})}<br>
    ${t("🟡 {a} approximate positions (dashed ring on the map)",{a:A.approximate})}<br>
    ${t("⛔ {u} have no position on the schematic (listed below; still shown on the Geo map)",{u:A.unmatched})}</div>
    <div style="display:flex;gap:8px;align-items:center;margin:6px 0"><button type="button" id="cov-csv">${t("⬇ Export CSV")}</button><span class="mu">${t("Tap a station below to see it on the Geo map.")}</span></div>
    <div style="max-height:46vh;overflow-y:auto;border-top:1px solid var(--bd)">${A.unmatchedStations.map(x => `<div class="pk-row" data-cov="${x.id}" role="button" tabindex="0"><div>${nameHTML(x.ko, x.en)}</div><div class="mu">${esc(lineTxt(x))}</div></div>`).join("")}</div>`;
}
function coverageCSV() {
  const rows = ST.map(s => { const q = svgPosition(s); return [s.i, s.ko, s.en, s.ln.map(g => D.L[g].e).join("/"), q ? (q.approx ? "ESTIMATED" : "verified") : "UNMATCHED", s.geoEst ? "ESTIMATED" : "verified"]
    .map(v => `"${String(v).replace(/"/g, '""')}"`).join(","); });
  return "\ufeffid,ko,en,lines,schematic_position,geo_position\n" + rows.join("\n") + "\n";
}
$("#cov-body").addEventListener("click", e => {
  if (!e.target.closest("#cov-csv")) return;
  const csv = coverageCSV(); window.__lastCoverageCSV = csv;
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = "seoul-metro-coverage.csv";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$("#cov-btn").onclick = () => { renderCoverage(); openModal(covModal, "#cov-close"); };
$("#cov-close").onclick = () => closeModal(covModal);
$("#cov-body").onclick = e => { const r = e.target.closest("[data-cov]"); if (!r) return; closeModal(covModal); tab("geo"); select(+r.dataset.cov, true); };
$("#cov-body").addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.closest("[data-cov]")) { e.preventDefault(); e.target.closest("[data-cov]").click(); } });

$("#pick-a-btn").onclick = () => openStationPicker("ra");
$("#pick-b-btn").onclick = () => openStationPicker("rb");
$("#picker-close").onclick = () => closeModal($("#picker-modal"));
$("#pick-cancel").onclick = finishMapPick;
$$(".pk-mode").forEach(b => { b.onclick = () => setPickerMode(b.dataset.mode); });
$("#pk-q").oninput = () => renderPickerList("search");
$("#pk-line-chips").onclick = e => {
  const b = e.target.closest("[data-g]");
  if (b) { pkLine = b.dataset.g; setPickerMode("line"); }
};
$("#pk-list").onclick = e => {
  const r = e.target.closest("[data-i]");
  if (!r) return;
  const s = ST[+r.dataset.i]; if (!s) return;
  $("#" + pkTarget).value = r.dataset.name || s.ko;
  closeModal($("#picker-modal"));
  doRoute();
};
$("#pk-list").addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.closest("[data-i]")) { e.preventDefault(); e.target.closest("[data-i]").click(); } });
$("#lst").addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.closest("[data-i]")) { e.preventDefault(); select(+e.target.closest("[data-i]").dataset.i); } });

// ============================================================================
// 6. OFFICIAL VIEW & SHELL INITIALIZATION
// ============================================================================
// ---- Official PDF tab: shows map_korea.pdf and nothing else (no SVG, image or alternate schematic) ----
const PDF_URL = "map_korea.pdf";
const pdfNeedsNewTab = () => isMobile() || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "")
  || ((navigator.maxTouchPoints || 0) > 1 && /Macintosh/.test(navigator.userAgent || ""))      // iPadOS reports a Mac user agent
  || navigator.pdfViewerEnabled === false;                                                       // desktop browser without a built-in PDF viewer
let PDF_EMBEDDED = false, PDF_OPENED_AT = 0;
function showOfficialPdf() {
  const host = $("#pdf-host"), fb = $("#pdf-fallback"), bar = $("#pdf-bar");
  if (!host || !fb) return;
  if (!pdfNeedsNewTab()) {
    // Desktop: embed the PDF in the page; the browser's own viewer provides scrolling, zoom and page navigation.
    fb.hidden = true; host.hidden = false; if (bar) bar.hidden = false;
    if (!PDF_EMBEDDED) {
      host.innerHTML = `<object id="pdf-obj" data="${PDF_URL}#view=FitH&amp;navpanes=0" type="application/pdf" aria-label="${esc(t("Official PDF map"))}">
        <iframe id="pdf-frame" src="${PDF_URL}#view=FitH&amp;navpanes=0" title="${esc(t("Official PDF map"))}"></iframe></object>`;
      PDF_EMBEDDED = true;
    }
    return;
  }
  // Phones / tablets: a PDF embedded in a page is unreliable (iOS shows page 1 only, no scrolling). Open it in a new tab
  // automatically, and keep a visible button on screen so the view is never blank (also covers blocked pop-ups).
  host.hidden = true; host.innerHTML = ""; PDF_EMBEDDED = false; fb.hidden = false; if (bar) bar.hidden = true;
  if (Date.now() - PDF_OPENED_AT > 1500) {
    PDF_OPENED_AT = Date.now();
    let w = null; try { w = window.open(PDF_URL, "_blank"); if (w) w.opener = null; } catch (e) { w = null; }
    const msg = $("#pdf-fb-msg");
    if (msg) msg.textContent = w ? t("The official PDF map was opened in a new tab.") : t("Tap the button to open the official PDF map.");
  }
}

const redraw = () => { if (S.tab === "sch") drawSch(); else if (S.tab === "geo") drawGeo(); };
function tab(t) {
  S.tab = t;
  // A tall station sheet must never cover another view: hide it for Route/Official/Guide, shrink it to a peek elsewhere.
  if (isMobile() && sheetState() !== "hidden") {
    if (t === "route" || t === "off" || t === "guide") setSheet(null);
    else if (sheetState() === "full" || sheetState() === "half") setSheet("peek");
  }
  $$("[data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  $$(".pane").forEach(p => p.classList.toggle("on", p.id === "p-" + t));
  if (t === "geo") initGeo();
  if (t === "lines") drawLines();
  if (t === "sch") drawSch();
  if (t === "off") showOfficialPdf();
  renderRouteSummary();
  closeMoreMenu();
}
$$("[data-tab]").forEach(b => { b.onclick = () => tab(b.dataset.tab); });

const favUI = () => { $("#fc").textContent = S.fav.length; renderFavList(); };
function renderFavList() {
  const box = $("#fav-list"); if (!box) return;
  const k = S.fav.map(n => ST.find(s => s.ko === n)).filter(Boolean);
  box.innerHTML = k.length
    ? k.map(s => `<button type="button" role="menuitem" data-fav="${s.i}">${nameHTML(stationLabel(s, "ko"), stationLabel(s, "en"))}</button>`).join("")
    : `<div class="mu">${t("No saved stations yet. Open a station and tap ☆.")}</div>`;
}
$("#fav-list").onclick = e => { const b = e.target.closest("[data-fav]"); if (!b) return; closeMoreMenu(); select(+b.dataset.fav); };

// ---- Overflow (⋯) menu: floating popup, closes on outside click / Esc / selection; never touches header layout ----
const moreBtn = $("#more-btn"), moreMenu = $("#more-menu");
function openMoreMenu() { renderFavList(); moreMenu.hidden = false; moreBtn.setAttribute("aria-expanded", "true"); }
function closeMoreMenu() { if (!moreMenu || moreMenu.hidden) return; moreMenu.hidden = true; moreBtn.setAttribute("aria-expanded", "false"); }
moreBtn.addEventListener("click", e => { e.stopPropagation(); moreMenu.hidden ? openMoreMenu() : closeMoreMenu(); });
document.addEventListener("pointerdown", e => { if (!moreMenu.hidden && !moreMenu.contains(e.target) && !moreBtn.contains(e.target)) closeMoreMenu(); }, true);
moreMenu.addEventListener("click", e => { if (e.target.closest("#th")) return; if (e.target.closest("button")) closeMoreMenu(); });
function updateCounters() {
  $("#dnote").textContent = t("Source records: {n}. Schematic matches: {m}/{t}.", { n: D.S.length, m: SVG_MATCH_AUDIT.matched, t: ST.length });
}
// Re-renders EVERY piece of UI text in the current language (static HTML via the dictionary, dynamic panels via t()).
function applyLanguage() {
  $("#ttl").textContent = S.lang === "en" ? "Seoul Metro Hub" : "서울 지하철 허브";
  document.documentElement.lang = S.lang === "ko" ? "ko" : "en";
  document.title = S.lang === "ko" ? "서울 지하철 허브" : "Seoul Metro Hub";
  $("#lg").setAttribute("aria-pressed", S.lang === "ko" ? "true" : "false");
  applyStaticI18n();
  $("#lg").title = S.lang === "ko" ? "Switch to English" : "한국어로 전환";
  const sl = $("#sch-lang"); if (sl) sl.textContent = S.svgLang === "ko" ? "🌐 SVG: 한국어" : "🌐 SVG: English";
  updateSchBackground();
  rebuildGeoSelect();
  updateCounters();
  setTiles(S.lang);                           // base-map labels follow the language (current tiles kept if unavailable)
  const _sc = $("#ib").scrollTop;
  redraw();                                   // schematic + geo (incl. counters)
  if (typeof drawGeo === "function" && MAP) drawGeo();
  if (S.tab === "lines" || $("#lst").innerHTML) drawLines();
  if (S.sel) render(S.sel); else $("#ib").innerHTML = placeholder();
  $("#ib").scrollTop = _sc;
  renderFavList();
  $("#fc").textContent = S.fav.length;
  if (!$("#picker-modal").hidden) { $("#picker-title").textContent = pkTarget === "ra" ? t("🟢 Select Origin Station") : t("🔴 Select Destination Station"); setPickerMode($(".pk-mode.on") ? $(".pk-mode.on").dataset.mode : "search"); }
  if (!$("#search-modal").hidden) renderMobileSearch();
  if (!$("#cov-modal").hidden) renderCoverage();
  if (!$("#pick-banner").hidden) $("#pick-banner-txt").textContent = t(pkTarget === "ra" ? "Tap any station on the map to set Origin (🟢)" : "Tap any station on the map to set Destination (🔴)");
  if (S.route && S.route.length && $("#rres") && $("#rres").innerHTML) { try { doRoute(true); } catch (e) { console.warn(e); } }
  renderRouteSummary();
}
$("#lg").onclick = () => { S.lang = S.lang === "en" ? "ko" : "en"; S.svgLang = S.lang; applyLanguage(); };
$("#th").onclick = e => {
  const h = document.documentElement, d = h.classList.contains("dark");
  h.classList.toggle("dark", !d);
  h.classList.toggle("light", d);
  e.currentTarget.textContent = d ? "☀️" : "🌙";
  tiles();
};
// Search prefers the Geo map: it covers every station, the schematic does not.
function goStation(i) {
  const s = ST[i]; if (!s) return;
  tab("geo");
  select(i, true);
  if (MAP && Number.isFinite(s.lat) && Number.isFinite(s.lng)) MAP.setView([s.lat, s.lng], Math.max(MAP.getZoom ? MAP.getZoom() : 14, 14));
}
$("#q").onchange = e => {
  const s = resolveStation(e.target.value);
  if (s) { goStation(s.i); e.target.value = ""; }
};

const searchModal = $("#search-modal");
function renderMobileSearch() {
  const q = $("#mobile-q").value.trim();
  const results = q ? searchStations(q, 30) : [];
  $("#mobile-search-results").innerHTML = results.flatMap(s => (s.displayNames ? lineNameGroups(s).map(r => ({ s, ko: r.ko, en: r.en, g: r.gs.length === 1 ? r.gs[0] : null })) : [{ s, ko: s.ko, en: s.en, g: null }]))
    .map(({ s, ko, en, g }) => `<button type="button" class="search-result" data-station="${s.i}"><b>${esc(S.lang === "ko" ? ko : en)}</b><span>${esc(S.lang === "ko" ? en : ko)} · ${g ? esc(LN(g)) : esc(stationKeys(s).join(", "))}</span></button>`).join("")
    || (q ? `<div class="mu" style="padding:10px">${t("No matching stations.")}</div>` : "");
}
$("#mobile-search").onclick = () => openModal(searchModal, "#mobile-q");
$("#search-close").onclick = () => closeModal(searchModal);
window.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  const m = [...document.querySelectorAll(".modal")].find(x => !x.hidden);
  if (m) { closeModal(m); return; }
  if (!$("#pick-banner").hidden) { finishMapPick(); return; }
  if (!moreMenu.hidden) { closeMoreMenu(); moreBtn.focus(); return; }
  if (isMobile() && sheetState() !== "hidden") setSheet(null);
});
$("#mobile-q").addEventListener("input", renderMobileSearch);
$("#mobile-q").addEventListener("keydown", e => { if (e.key === "Enter") { const s = resolveStation(e.target.value); if (s) { closeModal(searchModal); select(s.i); } } });
$("#mobile-search-results").onclick = e => { const b = e.target.closest("[data-station]"); if (!b) return; closeModal(searchModal); goStation(+b.dataset.station); };
// Intentionally do not dismiss on backdrop taps: accidental taps must not discard the search context.
// Keep modals inside the *visible* viewport when the iOS keyboard is open.
if (window.visualViewport) {
  const syncVV = () => document.documentElement.style.setProperty("--vvh", window.visualViewport.height + "px");
  window.visualViewport.addEventListener("resize", syncVV); syncVV();
}

$("#p-guide").addEventListener("click", e => {
  const button = e.target.closest("[data-say]");
  if (!button) return;
  const status = $("#guide-voice-status");
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    status.textContent = "Speech playback is not available in this browser or device.";
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(button.dataset.say);
  utterance.lang = "ko-KR"; utterance.rate = 0.88;
  const voice = window.speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith("ko"));
  if (voice) utterance.voice = voice;
  utterance.onerror = () => { status.textContent = "This device could not play the Korean voice."; };
  window.speechSynthesis.speak(utterance);
  status.textContent = "Playing Korean phrase…";
});

$("#dl").innerHTML = ST.flatMap(s => [`<option value="${esc(s.ko)}">${esc(s.en)}</option>`, ...allDisplayNames(s).filter(n => n.ko !== s.ko).map(n => `<option value="${esc(n.ko)}">${esc(n.en)}</option>`)]).join("");
$("#ra").value = "서울역";
$("#rb").value = "강남";
$("#ib").innerHTML = placeholder();
updateCounters();
favUI();
updateSchBackground();
drawSch();
fitSch();
applyStaticI18n();
tab("geo");   // Geo map is the landing view; the schematic stays available as a secondary tab
