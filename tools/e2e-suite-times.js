// Travel-time / multi-route suite.   Run: node tools/e2e-suite-times.js
// Part A (static, no browser): the generated data against the RAW CSV files + structural integrity.
// Part B (browser, desktop + iPhone + iPhone landscape): engine, cards, breakdown, selection, links, localization, fallback.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { open } = require('./e2e.js');
const ROOT = path.resolve(__dirname, '..');
const results = [];
const mk = prof => (name, pass, detail = '') => { results.push({ prof, name, pass: !!pass, detail: String(detail).slice(0, 240) }); console.log((pass ? 'PASS ' : 'FAIL ') + `[${prof}] ${name}${detail ? ' — ' + String(detail).slice(0, 240) : ''}`); };

// ------------------------------------------------------------------ Part A
function partA() {
  const ok = mk('static');
  const ctx = { console, window: {}, localStorage: { getItem: () => null } }; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'travel-times.js'), 'utf8') + ';globalThis.X={ST,RT,D,TT};', ctx);
  const { ST, RT, TT } = ctx.X;
  const dec = new TextDecoder('euc-kr');
  const csv = f => { const t = dec.decode(fs.readFileSync(path.join(ROOT, 'data-sources/travel-times', f))).replace(/^\uFEFF/, ''); const rows = t.split(/\r?\n/).filter(Boolean).map(l => { const o = []; let c = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(c); c = ''; } else c += ch; } o.push(c); return o; }); const h = rows.shift(); return rows.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
  const files = fs.readdirSync(path.join(ROOT, 'data-sources/travel-times'));
  const F = s => files.find(f => f.includes(s));
  ok('all six source CSV files are shipped in data-sources/travel-times/', ['역간거리 및 소요시간', '환승역거리', '공항철도', '9호선', '수인분당선', '신분당선'].every(s => F(s)), files.join(', '));
  // ---- structure
  ok('travel-times.js: 270 exact running times, 125 official distances, 101 transfer pairs', Object.keys(TT.ride).length === 270 && Object.keys(TT.dist).length === 125 && Object.keys(TT.xfer).length === 101, `${Object.keys(TT.ride).length}/${Object.keys(TT.dist).length}/${Object.keys(TT.xfer).length}`);
  ok('time model is seconds = 23.9 + 63.27 x km (fitted on the exact segments)', TT.meta.model.fixedSec === 23.9 && TT.meta.model.secPerKm === 63.27, JSON.stringify(TT.meta.model));
  // ---- integrity: every key points at real, adjacent stations (no missing / duplicated stations)
  const byLine = {}; ST.forEach(s => s.ln.forEach(g => { byLine[g] = byLine[g] || {}; byLine[g][s.cd[g]] = s; }));
  const adj = new Set(); RT.forEach(r => { for (let i = 1; i < r.a.length; i++) { const a = ST[r.a[i - 1]], b = ST[r.a[i]]; const [x, y] = [a.cd[r.g], b.cd[r.g]].sort(); adj.add(`${r.g}|${x}|${y}`); } if (r.loop && r.id !== '6l' && r.a.length > 1) { const a = ST[r.a[0]], b = ST[r.a[r.a.length - 1]]; const [x, y] = [a.cd[r.g], b.cd[r.g]].sort(); adj.add(`${r.g}|${x}|${y}`); } });
  const badKeys = [...Object.keys(TT.ride), ...Object.keys(TT.dist)].filter(k => { const [g, a, b] = k.split('|'); return !(byLine[g] && byLine[g][a] && byLine[g][b] && adj.has(k)); });
  ok('every exact / distance edge connects two real stations that are adjacent on that line in the app graph', badKeys.length === 0, badKeys.slice(0, 5).join(' '));
  const badX = Object.keys(TT.xfer).filter(k => { const [p, q] = k.split('|').map(x => x.split(':')); const s = byLine[p[0]] && byLine[p[0]][p[1]]; return !(s && byLine[q[0]] && byLine[q[0]][q[1]] === s); });
  ok('every transfer pair joins two lines of the SAME station (no missing / wrong transfers)', badX.length === 0, badX.slice(0, 5).join(' '));
  const dupCode = []; const seen = new Set(); ST.forEach(s => Object.entries(s.cd).forEach(([g, c]) => { const k = g + '|' + c; if (seen.has(k)) dupCode.push(k); seen.add(k); }));
  ok('no duplicated stations / duplicated (line, station code) in data.js', dupCode.length === 0 && new Set(ST.map(s => s.i)).size === ST.length && ST.length === 654, `${ST.length} stations`);
  const hubs = ST.filter(s => s.ln.length > 1).length;
  ok(`transfer stations unchanged: ${hubs} multi-line stations`, hubs > 100);
  ok('all numeric values are positive and finite', Object.values(TT.ride).every(v => v[0] > 0 && v[1] >= 0 && isFinite(v[1])) && Object.values(TT.dist).every(v => v > 0) && Object.values(TT.xfer).every(v => v[0] > 0 && v[1] > 0));
  // ---- independent re-check against the RAW Seoul Metro CSV
  const mm = s => +s.slice(0, 2) * 60 + +s.slice(3);
  const sm = csv(F('역간거리 및 소요시간')); const lines = {}; sm.forEach(r => (lines[r['호선']] = lines[r['호선']] || []).push(r));
  let cmp = 0, bad = [];
  for (const [g, rs] of Object.entries(lines)) for (let k = 1; k < rs.length; k++) {
    const a = ST.filter(s => s.ko === rs[k - 1]['역명'] && s.ln.includes(g)), b = ST.filter(s => s.ko === rs[k]['역명'] && s.ln.includes(g));
    if (a.length !== 1 || b.length !== 1) continue; const [x, y] = [a[0].cd[g], b[0].cd[g]].sort(), key = `${g}|${x}|${y}`; if (!adj.has(key)) continue;
    cmp++; const o = TT.ride[key], t = mm(rs[k]['소요시간']), d = +rs[k]['역간거리(km)'];
    if (!o || o[0] !== t || Math.abs(o[1] - d) > 1e-9) bad.push(`${g}:${rs[k - 1]['역명']}→${rs[k]['역명']} csv ${t}s/${d}km vs ${o}`);
  }
  ok(`raw Seoul Metro CSV re-read independently: ${cmp} consecutive rows compared, every running time and km equal to the generated value`, cmp >= 200 && bad.length === 0, bad.slice(0, 3).join(' | '));
  // ---- transfers vs the RAW transfer CSV
  const LM = { '1호선': '1', '2호선': '2', '3호선': '3', '4호선': '4', '5호선': '5', '6호선': '6', '7호선': '7', '8호선': '8', '9호선': '9', '공항철도': '공항철도', '경의중앙선': '경의선', '경춘선': '경춘선', '수인분당선': '수인분당선', '신분당선': '신분당선', '우이신설선': '우이신설경전철', '김포골드라인': '김포도시철도', '서해선': '서해선', '신림선': '신림선' };
  let xc = 0, xb = [];
  csv(F('환승역거리')).forEach(r => { const g1 = r['호선'], g2 = LM[r['환승노선']], s = ST.filter(x => x.ko === r['환승역명'] && x.ln.includes(g1)); if (!g2 || s.length !== 1 || !s[0].ln.includes(g2)) return; const k = [g1 + ':' + s[0].cd[g1], g2 + ':' + s[0].cd[g2]].sort().join('|'); xc++; const o = TT.xfer[k], t = mm(r['환승소요시간']); if (!o || o[0] !== +r['환승거리'] || o[1] !== t) xb.push(`${r['환승역명']} ${g1}→${r['환승노선']}: ${r['환승거리']}m ${t}s vs ${o}`); });
  ok(`raw transfer CSV re-read independently: ${xc} rows compared, distance and walking time equal`, xc >= 120 && xb.length === 0, xb.slice(0, 3).join(' | '));
  ok('transfer walking time = distance / 1.2 m/s in the source (rounded to the second)', Object.values(TT.xfer).every(v => Math.abs(v[1] - v[0] / 1.2) <= 1.5));
  // ---- NRA distance files vs generated distances
  const nra = { '공항철도': '공항철도', '9': '9호선', '수인분당선': '수인분당선', '신분당선': '신분당선' };
  let nb = [], nc = 0;
  for (const [g, tag] of Object.entries(nra)) { const rows = csv(F(tag)); for (let i = 0; i + 1 < rows.length; i++) { const nm = n => { n = n.trim(); const c = [n, n.replace(/\(.*?\)/g, '')]; return ST.filter(s => s.ln.includes(g) && (c.includes(s.ko) || c.some(x => s.ko === x))); }; const a = nm(rows[i]['역명']), b = nm(rows[i + 1]['역명']); if (a.length !== 1 || b.length !== 1 || rows[i]['역간거리'] === '') continue; const [x, y] = [a[0].cd[g], b[0].cd[g]].sort(), key = `${g}|${x}|${y}`; if (!adj.has(key)) continue; nc++; if (TT.dist[key] !== +rows[i]['역간거리']) nb.push(`${g}:${rows[i]['역명']}→${rows[i + 1]['역명']} ${rows[i]['역간거리']} vs ${TT.dist[key]}`); } }
  ok(`raw 국가철도공단 distance files re-read independently: ${nc} segments compared, all equal`, nc >= 100 && nb.length === 0, nb.slice(0, 3).join(' | '));
  // ---- name normalization (Issue #3)
  const want = ['복정', '이매', '수내', '미금', '죽전', '기흥', '상갈', '영통', '수원시청', '숭의', '판교'];
  const covered = want.filter(n => { const s = ST.find(x => x.ko === n && x.ln.some(g => ['수인분당선', '신분당선'].includes(g))); return s && Object.keys(TT.dist).some(k => { const [g, a, b] = k.split('|'); return (s.cd[g] === a || s.cd[g] === b); }); });
  ok(`bracketed station names now mapped (${covered.length}/${want.length} of the examples have official distances attached)`, covered.length === want.length, 'missing: ' + want.filter(n => !covered.includes(n)).join(','));
  ok('only 당고개 and 능길 stay unmapped (they do not exist in data.js; no placeholder stations were invented)', !ST.some(s => s.ko === '당고개' || s.ko === '능길'));
  const rep = fs.readFileSync(path.join(ROOT, 'TRAVEL_TIME_DATA_REPORT.md'), 'utf8');
  ok('TRAVEL_TIME_DATA_REPORT.md contains the before/after coverage and the Issue #11 audit', /before vs after/i.test(rep) && /Issue #11/.test(rep) && /GTX-A/.test(rep));
  return { ST, RT, TT };
}

// ------------------------------------------------------------------ independent shortest-path (plain O(n^2) Dijkstra over the engine's own graph weights)
const INDEP = `(a,b,ex)=>{
  const G=RouteEngine._graph(ex),N=G.adj.length,dist=new Array(N).fill(Infinity),done=new Array(N).fill(false);
  (G.stationRoutes[a]||[]).forEach(r=>{const n=G.ids.get(a+'|'+r.id+'|0');if(n!=null)dist[n]=0});
  const ends=new Set((G.stationRoutes[b]||[]).map(r=>G.ids.get(b+'|'+r.id+'|1')).filter(x=>x!=null));
  for(;;){let u=-1,bd=Infinity;for(let i=0;i<N;i++)if(!done[i]&&dist[i]<bd){bd=dist[i];u=i}
    if(u<0)return null;if(ends.has(u))return dist[u];done[u]=true;
    for(const [v,c] of G.adj[u])if(dist[u]+c<dist[v])dist[v]=dist[u]+c}}`;

async function suite(prof, A) {
  const ok = mk(prof), mobile = prof !== 'desktop';
  const t = await open(prof), p = t.page;
  const tap = sel => mobile ? p.tap(sel) : p.click(sel);
  const wait = ms => p.waitForTimeout(ms);
  const safe = async (name, fn) => { try { await fn(); } catch (e) { ok(name, false, 'EXCEPTION ' + e.message.split('\n')[0]); } };
  const route = async (a, b) => { await p.evaluate(() => tab('route')); await p.fill('#ra', a); await p.fill('#rb', b); await p.click('#go'); await wait(300); };

  // ---------- engine: official first, derived, estimated ----------
  await safe('tiers', async () => {
    const r = await p.evaluate(() => {
      const f = n => ST.find(s => s.ko === n), seg = (g, a, b, ex) => { const s = RouteEngine.rideSegment(g, f(a), f(b), ex || 'l'); return { sec: s.sec, km: +s.km.toFixed(3), tier: s.tier }; };
      const M = RouteEngine.model;
      return { off: seg('2', '강남', '교대'), offKey: TT.ride[(() => { const g = '2', a = f('강남').cd[g], b = f('교대').cd[g]; return a < b ? g + '|' + a + '|' + b : g + '|' + b + '|' + a; })()],
        der: seg('9', '샛강', '여의도'), derKey: (() => { const g = '9', a = f('여의도'), b = f('당산'); return null; })(),
        est: seg('GTX-A', '서울역', '연신내'), M, kappa: M.kappa, hv: (() => { const a = f('서울역'), b = f('연신내'); const d = (b.lat - a.lat) * Math.PI / 180, e = (b.lng - a.lng) * Math.PI / 180, h = Math.sin(d / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(e / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); })() };
    });
    ok('official segment: Line 2 강남→교대 uses the exact CSV seconds (tier "official", no model)', r.off.tier === 'official' && r.offKey && r.off.sec === r.offKey[0] && Math.abs(r.off.km - r.offKey[1]) < 1e-3, JSON.stringify(r.off));
    ok('distance-only segment: Line 9 uses the official NRA km and the model (tier "derived")', r.der.tier === 'derived' && r.der.sec === Math.round(r.M.fixedSec + r.M.secPerKm * r.der.km), JSON.stringify(r.der));
    ok('no-data segment: GTX-A uses straight-line km x kappa and the same model (tier "estimated")', r.est.tier === 'estimated' && Math.abs(r.est.km - r.hv * r.kappa) < 0.01 && r.est.sec === Math.round(r.M.fixedSec + r.M.secPerKm * r.est.km), JSON.stringify({ ...r.est, hv: r.hv }));
    const cnt = await p.evaluate(() => { const o = { official: 0, derived: 0, estimated: 0 }; RT.forEach(r => { for (let i = 1; i < r.a.length; i++) o[RouteEngine.rideSegment(r.g, ST[r.a[i - 1]], ST[r.a[i]], 'l').tier]++; }); return o; });
    ok('whole graph: exact + derived + estimated segments = all adjacent pairs, exact first', cnt.official + cnt.derived + cnt.estimated > 700 && cnt.official >= 269 && cnt.derived >= 120, JSON.stringify(cnt));
    const ex = await p.evaluate(() => { const f = n => ST.find(s => s.ko === n); const a = RouteEngine.rideSegment('공항철도', f('서울역'), f('공덕'), 'l'), b = RouteEngine.rideSegment('공항철도', f('서울역'), f('공덕'), 'x'), c = RouteEngine.rideSegment('2', f('강남'), f('교대'), 'x'), d = RouteEngine.rideSegment('2', f('강남'), f('교대'), 'l'); return { aSec: a.sec, bSec: b.sec, exactSame: c.sec === d.sec }; });
    ok('"Include express lines" speeds up derived airport-type segments but never touches exact official times', ex.bSec <= ex.aSec && ex.exactSame, JSON.stringify(ex));
    // route level (this caught a bug: the express setting was not reaching the graph)
    const rl = await p.evaluate(() => { const f = n => ST.find(s => s.ko === n).i, go = (a, b, ex) => RouteEngine.options(f(a), f(b), ex)[0].T.totalMin; return { airL: go('서울역', '인천공항1터미널', 'l'), airX: go('서울역', '인천공항1터미널', 'x'), l2L: go('홍대입구', '잠실', 'l'), l2X: go('홍대입구', '잠실', 'x'), sbL: go('강남', '판교', 'l'), sbX: go('강남', '판교', 'x') }; });
    ok('route level: "Include express lines" makes the airport route faster (70 km/h class) …', rl.airX < rl.airL && rl.airX >= 50 && rl.airX <= 66, JSON.stringify(rl));
    ok('… and never changes a route made only of official times (Line 2), nor slows a line below the data-calibrated model', rl.l2L === rl.l2X && rl.sbX <= rl.sbL, JSON.stringify(rl));
  });

  // ---------- transfers ----------
  await safe('transfers', async () => {
    const r = await p.evaluate(() => { const f = n => ST.find(s => s.ko === n); const off = RouteEngine.transferTime(f('서울역'), '1', '4'); const def = RouteEngine.transferTime(f('수서'), '3', '수인분당선'); const cfg = RouteEngine.config; return { off, def, defaults: cfg.transferDefaultsMin }; });
    ok('official transfer: 서울역 Line 1 → Line 4 = 2:13 (133 s) over 159 m walking, source "official", plus the configured connecting-train wait (120 s)', r.off.src === 'official' && r.off.walkSec === 133 && r.off.meters === 159 && r.off.waitSec === 120 && r.off.sec === 253, JSON.stringify(r.off));
    ok('no official transfer time → configurable default class (Easy 2 / Medium 4 / Long 7 min)', r.def.src === 'default' && [120, 240, 420].includes(r.def.walkSec) && r.defaults.easy === 2 && r.defaults.medium === 4 && r.defaults.long === 7, JSON.stringify({ def: r.def, defaults: r.defaults }));
    const cfg = await p.evaluate(() => { const f = n => ST.find(s => s.ko === n); const c = RouteEngine.config; const old = c.transferDefaultsMin.long; c.transferClassOverrides['수서|3|수인분당선'] = 'long'; c.transferDefaultsMin.long = 9; const x = RouteEngine.transferTime(f('수서'), '3', '수인분당선'); c.transferDefaultsMin.long = old; delete c.transferClassOverrides['수서|3|수인분당선']; return x; });
    ok('transfer defaults and per-interchange overrides are configurable', cfg.walkSec === 540 && cfg.cls === 'long', JSON.stringify(cfg));
  });

  // ---------- multi-route generation: invariants over many origin/destination pairs ----------
  await safe('multi', async () => {
    const r = await p.evaluate(() => {
      const rnd = (() => { let x = 12345; return () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
      const out = { n: 0, noRoute: 0, bad: [], labels: {}, withAlt: 0, withFewest: 0, maxMs: 0, sumOk: 0 };
      for (let q = 0; q < 60; q++) {
        const a = Math.floor(rnd() * ST.length), b = Math.floor(rnd() * ST.length); if (a === b) continue;
        const t0 = performance.now(); const o = RouteEngine.options(a, b, 'x'); out.maxMs = Math.max(out.maxMs, performance.now() - t0);
        if (!o) { out.noRoute++; continue; } out.n++;
        const sigs = new Set(o.map(x => x.sig)), why = [];
        if (sigs.size !== o.length) why.push('duplicate routes');
        const fast = o[0]; if (!/^FASTEST/.test(fast.label)) why.push('first is not FASTEST');
        if (o.some(x => x.T.totalSec < fast.T.totalSec - 1e-6)) why.push('a route is faster than FASTEST');
        const minTr = Math.min(...o.map(x => x.tr)); const fw = o.find(x => /FEWEST/.test(x.label)); if (!fw || fw.tr !== minTr) why.push('FEWEST TRANSFERS is not the minimum'); else out.withFewest++;
        if (o.length > 2) out.withAlt++;
        if (new Set(o.map(x => x.rank)).size !== o.length) why.push('ranks not unique');
        o.forEach(x => { const s = x.T.legs.reduce((u, l) => u + l.min, 0); if (s === x.T.totalMin) out.sumOk++; else why.push(`legs ${s} != total ${x.T.totalMin}`); if (x.T.legs.some(l => !(l.min >= 1))) why.push('leg < 1 min'); out.labels[x.label] = (out.labels[x.label] || 0) + 1; });
        if (why.length) out.bad.push(`${ST[a].ko}→${ST[b].ko}: ${why.join('; ')}`);
      }
      return out;
    });
    ok(`${r.n} random origin/destination pairs: no duplicate routes, FASTEST really fastest, FEWEST TRANSFERS really fewest, unique ranks`, r.n >= 40 && r.bad.length === 0, r.bad.slice(0, 3).join(' | '));
    ok('every route\'s displayed leg minutes add up exactly to its displayed total', r.sumOk > 100 && !r.bad.some(x => /legs/.test(x)), `${r.sumOk} routes checked`);
    ok('alternates are produced for many pairs; labels are FASTEST / FEWEST TRANSFERS / ALTERNATE', r.withAlt >= 10 && r.labels['ALTERNATE'] > 0, JSON.stringify(r.labels));
    ok('route search stays fast (worst case of the sample)', r.maxMs < 1500, Math.round(r.maxMs) + ' ms');
    // independent search: same weights, different algorithm
    const cmpR = await p.evaluate(({ INDEP }) => {
      const f = eval(INDEP); const rnd = (() => { let x = 777; return () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
      let ok = 0, bad = [];
      for (let q = 0; q < 40; q++) { const a = Math.floor(rnd() * ST.length), b = Math.floor(rnd() * ST.length); if (a === b) continue; const o = RouteEngine.options(a, b, 'x'); const d = f(a, b, 'x'); if (!o || d == null) continue; if (Math.abs(o[0].T.totalSec - d) < 1e-6) ok++; else bad.push(`${ST[a].ko}→${ST[b].ko} engine ${o[0].T.totalSec} vs independent ${d}`); }
      return { ok, bad };
    }, { INDEP });
    ok(`FASTEST time equals an independent shortest-path search (${cmpR.ok} pairs)`, cmpR.ok >= 30 && cmpR.bad.length === 0, cmpR.bad.slice(0, 2).join(' | '));
  });

  // ---------- coverage of every supported line family ----------
  await safe('lines', async () => {
    const cases = [['사당', '동대문역사문화공원', '1-8 (Line 4+2)'], ['김포공항', '여의도', 'Line 9'], ['서울역', '인천공항1터미널', 'Airport Railroad'], ['수원', '왕십리', 'Suin-Bundang'], ['강남', '판교', 'Shinbundang'], ['홍대입구', '잠실', 'Line 2'], ['동작', '남성', '4→7'], ['서울역', '수서', 'GTX-A'], ['신림', '샛강', 'Sillim']];
    for (const [a, b, name] of cases) {
      const r = await p.evaluate(([a, b]) => { const o = RouteEngine.options(ST.find(s => s.ko === a).i, ST.find(s => s.ko === b).i, 'x'); return o && { n: o.length, min: o[0].T.totalMin, q: o[0].T.quality, basis: o[0].T.basis, km: +o[0].T.km.toFixed(1) }; }, [a, b]);
      ok(`${name}: ${a} → ${b} gets a time (${r && r.min} min, ${r && r.q})`, !!r && r.min > 0 && r.km > 0, JSON.stringify(r && r.basis));
    }
    const q9 = await p.evaluate(() => { const o = RouteEngine.options(ST.find(s => s.ko === '김포공항').i, ST.find(s => s.ko === '여의도').i, 'x')[0].T; return o.basis; });
    ok('Line 9 times are flagged "derived from official distance" (never "official running time")', q9.official === 0 && q9.derived > 0 && q9.estimated === 0, JSON.stringify(q9));
    const q2 = await p.evaluate(() => RouteEngine.options(ST.find(s => s.ko === '홍대입구').i, ST.find(s => s.ko === '잠실').i, 'x')[0].T);
    ok('Line 2 route is 100% official running times and says so', q2.basis.derived === 0 && q2.basis.estimated === 0 && q2.quality.startsWith('official'), q2.quality);
  });

  // ---------- UI: cards, breakdown, selection ----------
  await safe('cards', async () => {
    await route('사당', '동대문역사문화공원');
    const c = await p.evaluate(() => ({ n: document.querySelectorAll('#rres .route-option').length, labels: [...document.querySelectorAll('#rres .rt-type')].map(e => e.textContent), times: [...document.querySelectorAll('#rres .rt-time')].map(e => e.textContent), stats: [...document.querySelectorAll('#rres .rt-stats')].map(e => e.innerText.replace(/\s+/g, ' ')), sel: [...document.querySelectorAll('#rres .route-option')].map(e => e.classList.contains('selected')), diff: [...document.querySelectorAll('#rres .rt-diff')].map(e => e.textContent), idx: S.routeIdx }));
    ok(`route cards: ${c.n} options with type, time, transfers, stations, distance`, c.n >= 2 && c.times.every(x => /^\d+ min$/.test(x)) && c.stats.every(x => /\d+ transfers?/.test(x) && /\d+ stations/.test(x) && /\d+(\.\d)? km/.test(x)), JSON.stringify({ labels: c.labels, times: c.times, stats: c.stats[0] }));
    ok('FASTEST is the first card and is selected by default', /FASTEST/.test(c.labels[0]) && c.sel[0] && c.sel.filter(Boolean).length === 1 && c.idx === 0, JSON.stringify(c.sel));
    ok('other cards show how they differ from the fastest (time / transfers / km)', c.diff.length === c.n - 1 && c.diff.every(x => /vs fastest/.test(x) && /min|same time/.test(x)), c.diff.join(' | '));
    const d = await p.evaluate(() => { const T = S.routes[0].time, el = document.querySelector('#route-detail'); return { legs: el.querySelectorAll('.rd-leg').length, total: +el.querySelector('.rd-total .rd-min').dataset.totalMin, sum: [...el.querySelectorAll('.rd-leg .rd-min')].reduce((u, e) => u + parseInt(e.textContent), 0), text: el.innerText.replace(/\n+/g, ' | ').slice(0, 330), want: T.totalMin, stations: el.querySelectorAll('.rd-st-leg li').length, stops: S.routes[0].stops, rides: T.legs.filter(l => l.type === 'ride').length }; });
    ok('breakdown panel: line segment durations + transfers + total; the parts add up to the total', d.legs >= 1 && d.total === d.want && d.sum === d.total, JSON.stringify({ legs: d.legs, total: d.total, sum: d.sum }));
    ok('breakdown shows the origin → destination of each leg and where the time comes from', /→/.test(d.text) && /running/.test(d.text) && /official|derived|estimated/.test(d.text), d.text);
    ok('station-by-station list has every station of every leg', d.stations === d.stops + d.rides, `${d.stations} vs ${d.stops + d.rides}`);
  });
  await safe('selection', async () => {
    await route('서울역', '강남');
    const n = await p.evaluate(() => S.routes.length); if (n < 2) { ok('selection needs 2+ options', false, 'only ' + n); return; }
    const before = await p.evaluate(() => ({ det: document.querySelector('#route-detail').dataset.routeIdx, t: document.querySelector('#route-detail .rd-total .rd-min').dataset.totalMin }));
    await p.evaluate(() => document.querySelectorAll('#rres .route-option')[1].scrollIntoView());
    await p.click('#rres .route-option:nth-child(2) .rt-type'); await wait(200);
    const a = await p.evaluate(() => ({ idx: S.routeIdx, sel: [...document.querySelectorAll('#rres .route-option')].map(e => e.classList.contains('selected')), det: document.querySelector('#route-detail').dataset.routeIdx, t: +document.querySelector('#route-detail .rd-total .rd-min').dataset.totalMin, want: S.routes[1].time.totalMin, tags: document.querySelectorAll('#rres .route-tag').length, head: document.querySelector('#route-detail .rd-head').innerText }));
    ok('clicking a route makes it active: card highlighted, one "Selected" tag, details switch to it', a.idx === 1 && a.sel[1] && a.sel.filter(Boolean).length === 1 && a.det === '1' && a.t === a.want && a.tags === 1 && before.det === '0', JSON.stringify(a));
    await p.focus('#rres .route-option:nth-child(1)'); await p.keyboard.press('Enter'); await wait(150);
    ok('keyboard (Enter on a focused card) selects it too', await p.evaluate(() => S.routeIdx === 0 && document.querySelector('#route-detail').dataset.routeIdx === '0'));
    await p.click('#rres .route-option:nth-child(2) [data-route-geo]'); await wait(600);
    const m = await p.evaluate(() => ({ tab: S.tab, idx: S.routeIdx, meta: S.routeMeta && S.routeMeta.minutes, want: S.routes[1].time.totalMin, red: [...window.__LMAP.svg.querySelectorAll('polyline')].some(q => q.getAttribute('stroke') === '#e11d2e'), sum: document.querySelector('#route-sum').innerText.replace(/\n/g, ' ') }));
    ok('"Show on map" selects that route and highlights IT on the Geo map; the on-map summary shows its time', m.tab === 'geo' && m.idx === 1 && m.meta === m.want && m.red && new RegExp(m.want + ' min').test(m.sum), JSON.stringify(m));
    await p.evaluate(() => tab('route')); await wait(150);
    await p.click('#rres .route-option:nth-child(3) .rt-type').catch(() => {}); await wait(150);
    ok('selecting another option while a route is drawn on the map moves the map route with it', await p.evaluate(() => !S.route || (S.routeMeta.minutes === S.routes[S.routeIdx].time.totalMin)));
    await p.evaluate(() => { document.querySelector('#rp').value = 't'; }); await p.click('#go'); await wait(250);
    ok('preference "Fewest transfers" opens with that option selected', await p.evaluate(() => /FEWEST/.test(S.routes[S.routeIdx].label) || S.routeIdx === 0));
    await p.evaluate(() => { document.querySelector('#rp').value = 'f'; }); await p.click('#go'); await wait(250);
  });

  // ---------- honesty labels ----------
  await safe('labels', async () => {
    await route('홍대입구', '잠실');
    const a = await p.evaluate(() => document.querySelector('#rres .rt-basis').innerText);
    ok('fully official route says "Official running times for all N segments"', /Official running times for all \d+ segments/.test(a), a);
    await route('서울역', '인천공항1터미널');
    const b = await p.evaluate(() => ({ basis: document.querySelector('#rres .rt-basis').innerText, cav: document.querySelector('#route-detail').innerText }));
    ok('airport route (distance-only line) is labelled "derived from official distances"', /derived from official distances/.test(b.basis) && !/for all \d+ segments/.test(b.basis), b.basis);
    ok('the estimate caveat states: running + station stops + transfer walking, no waiting, not real-time', /standing at each intermediate station/.test(b.cav) && /not real-time/.test(b.cav) && /Waiting for the first train is not included/.test(b.cav) && /waiting for the connecting train/.test(b.cav));
    const tr = await p.evaluate(async () => { for (const [a, b] of [['강남', '서울역'], ['동작', '남성'], ['신도림', '공덕']]) { document.querySelector('#ra').value = a; document.querySelector('#rb').value = b; document.querySelector('#go').click(); const x = document.querySelector('#route-detail .rd-xfer'); if (x) return x.innerText.replace(/\n/g, ' | '); } return ''; });
    ok('transfer rows show duration and whether it is official or a default', /\d+ min/.test(tr) && /official walking time|default/.test(tr) && (/waiting for the connecting train/.test(tr) || /default/.test(tr)), tr);
  });

  // ---------- external map links ----------
  await safe('links', async () => {
    await route('사당', '동대문역사문화공원');
    const l = await p.evaluate(() => [...document.querySelectorAll('#route-detail .rd-links a, .route-intro a')].map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href'), target: a.target, rel: a.rel })));
    const g = l.find(x => /Google/.test(x.text) && x.href.startsWith('https://www.google.com'));
    const u = new URL(g.href);
    ok('Google Maps link: https://www.google.com/maps/dir/?api=1&origin=…&destination=…&travelmode=transit', u.pathname === '/maps/dir/' && u.searchParams.get('api') === '1' && u.searchParams.get('travelmode') === 'transit', g.href);
    ok('…origin / destination are the selected stations, properly URL-encoded', u.searchParams.get('origin') === '사당역' && u.searchParams.get('destination') === '동대문역사문화공원역' && /origin=%EC%82%AC%EB%8B%B9%EC%97%AD/.test(g.href) && !/[가-힣 ]/.test(g.href), u.searchParams.get('origin') + ' → ' + u.searchParams.get('destination'));
    ok('…opens in a new tab safely (target=_blank, rel=noopener)', g.target === '_blank' && /noopener/.test(g.rel));
    ok('Kakao Map link uses the documented route URL (public transit, lat,lng pairs)', l.some(x => /Kakao/.test(x.text) && /^https:\/\/m\.map\.kakao\.com\/scheme\/route\?sp=[\d.]+,[\d.]+&ep=[\d.]+,[\d.]+&by=publictransit$/.test(x.href) && x.target === '_blank'), JSON.stringify(l.filter(x => /Kakao/.test(x.text))));
    const naver = l.find(x => /Naver/.test(x.text));
    ok(mobile ? 'Naver Map (app link nmap://route/public…) is offered on phones/tablets' : 'Naver Map app link is hidden on desktop (it only works in the Naver app)', mobile ? !!naver && /^nmap:\/\/route\/public\?slat=/.test(naver.href) && /dname=/.test(naver.href) : !naver, naver ? naver.href.slice(0, 80) : 'none');
    await route('강남', '서울역');
    const g2 = await p.evaluate(() => new URL([...document.querySelectorAll('#route-detail .rd-links a')].find(a => /Google/.test(a.textContent)).href).searchParams.get('origin'));
    ok('the link follows a new search (강남 → 강남역)', g2 === '강남역', g2);
  });

  // ---------- localization ----------
  await safe('i18n', async () => {
    await route('사당', '동대문역사문화공원');
    await p.evaluate(() => document.querySelectorAll('#rres .route-option')[1] && document.querySelectorAll('#rres .route-option')[1].click());
    const idx = await p.evaluate(() => S.routeIdx);
    await tap('#lg'); await wait(450);
    const k = await p.evaluate(() => ({ labels: [...document.querySelectorAll('#rres .rt-type')].map(e => e.textContent), times: [...document.querySelectorAll('#rres .rt-time')].map(e => e.textContent), det: document.querySelector('#route-detail').innerText, idx: S.routeIdx, sel: [...document.querySelectorAll('#rres .route-option')].findIndex(e => e.classList.contains('selected')), links: [...document.querySelectorAll('#route-detail .rd-links a, .route-intro a')].map(a => a.textContent.trim()) }));
    ok('Korean mode: route types, times (분), breakdown and links are localized', /가장 빠름|가장 빠른 경로/.test(k.labels[0]) && k.times.every(x => /^\d+분$/.test(x)) && /합계/.test(k.det) && /운행/.test(k.det) && k.links.some(x => /Google 지도/.test(x)) && k.links.some(x => /카카오맵/.test(x)), JSON.stringify({ l: k.labels, t: k.times, links: k.links }));
    ok('language switch keeps the selected route', k.idx === idx && k.sel === idx, `${idx} → ${k.idx}`);
    const lat = await p.evaluate(() => /[A-Za-z]{4,}/.test(document.querySelector('#route-detail').innerText.replace(/[가-힣]+/g, ' ').replace(/Google|Kakao|Naver|GTX|AREX|km/g, '').replace(/\([^)]*\)/g, '')));
    await tap('#lg'); await wait(350);
    ok('English mode restored: "FASTEST", "N min"', await p.evaluate(() => /FASTEST/.test(document.querySelector('#rres .rt-type').textContent) && /min$/.test(document.querySelector('#rres .rt-time').textContent)));
    ok('Korean breakdown has no leftover English sentences (station English names aside)', !lat);
  });

  // ---------- fallback + regressions ----------
  await safe('fallback', async () => {
    const r = await p.evaluate(() => { const E = window.RouteEngine; window.RouteEngine = undefined; document.querySelector('#ra').value = '강남'; document.querySelector('#rb').value = '서울역'; document.querySelector('#go').click(); const out = { cards: document.querySelectorAll('#rres .route-option').length, metrics: document.querySelectorAll('#rres .route-metrics').length, time: document.querySelectorAll('#rres .rt-time').length, text: document.querySelector('#rres').innerText.slice(0, 80) }; window.RouteEngine = E; return out; });
    ok('if the travel-time engine is unavailable the ORIGINAL planner still produces routes (no times shown, no errors)', r.cards >= 1 && r.metrics >= 1 && r.time === 0, JSON.stringify(r));
    await p.evaluate(() => document.querySelector('#go').click()); await wait(200);
    await p.evaluate(() => { const o = document.querySelector('#rx'); o.value = o.value === 'x' ? 'l' : 'x'; }); await p.click('#go'); await wait(200);
    ok('route search works with both express settings', await p.evaluate(() => document.querySelectorAll('#rres .route-option').length >= 1));
    await p.evaluate(() => { document.querySelector('#ra').value = 'Seoul'; document.querySelector('#rb').value = '평택지제'; document.querySelector('#go').click(); });
    ok('station search aliases still work in the planner (Seoul, aliases)', await p.evaluate(() => document.querySelectorAll('#rres .route-option').length >= 1));
    await p.evaluate(() => { document.querySelector('#ra').value = '서울'; document.querySelector('#rb').value = '서울'; document.querySelector('#go').click(); });
    ok('same origin and destination is rejected politely', await p.evaluate(() => /different/i.test(document.querySelector('#rres').innerText) || /다른/.test(document.querySelector('#rres').innerText)));
  });
  ok('no console / page errors', t.errors.length === 0, t.errors.join(' | '));
  await t.close();
}

(async () => {
  const A = partA();
  for (const prof of ['desktop', 'iphone', 'iphone-land']) await suite(prof, A);
  const pass = results.filter(r => r.pass).length, fail = results.length - pass;
  console.log(`\nTIMES TOTAL ${results.length}  PASS ${pass}  FAIL ${fail}`);
  fs.writeFileSync(path.join(ROOT, 'TEST_RESULTS_TIMES.json'), JSON.stringify({ run: new Date().toISOString(), total: results.length, pass, fail, results }, null, 1));
  process.exit(fail ? 1 : 0);
})();
