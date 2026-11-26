#!/usr/bin/env python3
"""Builds travel-times.js from the official CSV files in data-sources/travel-times/.
   Run from the project root:   python3 tools/build_travel_times.py
   Needs: node (to read data.js).  Output: travel-times.js  +  TRAVEL_TIME_DATA_REPORT.md

   Sources (all cp949-encoded CSV, not Excel):
     1. 서울교통공사 역간거리 및 소요시간_240810.csv      -> EXACT running time (10 s steps) + km, Seoul Metro lines 1-8
     2. 서울교통공사_환승역거리 소요시간 정보_20250331.csv -> EXACT transfer walking distance/time (distance / 1.2 m/s)
     3-6. 국가철도공단_{공항철도,수도권9호선,수인분당선,신분당선}_역간거리_20260630.CSV -> official DISTANCE only (km to next station)
   Nothing is interpolated: every ride/transfer value is either a row of these files or is flagged as derived at run time.
"""
import csv,json,collections,math,re,subprocess,os,sys,datetime,statistics as st
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)));os.chdir(ROOT)
SRC='data-sources/travel-times/'
F_SM=SRC+'서울교통공사 역간거리 및 소요시간_240810.csv'
F_TR=SRC+'서울교통공사_환승역거리 소요시간 정보_20250331.csv'
F_NRA={'공항철도':SRC+'국가철도공단_공항철도_역간거리_20260630.CSV','9':SRC+'국가철도공단_수도권9호선_역간거리_20260630.CSV','수인분당선':SRC+'국가철도공단_수인분당선_역간거리_20260630.CSV','신분당선':SRC+'국가철도공단_신분당선_역간거리_20260630.CSV'}
def rd(f):return list(csv.DictReader(open(f,encoding='cp949')))
open('/tmp/_dump_tt.js','w').write("""const fs=require('fs'),vm=require('vm');const c={console,window:{},localStorage:{getItem:()=>null}};vm.createContext(c);
vm.runInContext(fs.readFileSync('data.js','utf8')+';globalThis.O={ST:ST.map(s=>({i:s.i,ko:s.ko,en:s.en,ln:s.ln,cd:s.cd,al:s.aliases||[],dn:s.displayNames||null,lat:s.lat,lng:s.lng})),RT:RT.map(r=>({id:r.id,g:r.g,loop:r.loop,a:r.a}))};',c);process.stdout.write(JSON.stringify(c.O));""")
O=json.loads(subprocess.check_output(['node','/tmp/_dump_tt.js']));ST,RT=O['ST'],O['RT']
def hv(a,b):
    p=math.pi/180;d=(b['lat']-a['lat'])*p;e=(b['lng']-a['lng'])*p
    h=math.sin(d/2)**2+math.cos(a['lat']*p)*math.cos(b['lat']*p)*math.sin(e/2)**2;return 12742*math.asin(math.sqrt(h))
norm=lambda n:re.sub(r'\s+','',n)
def keys(s):
    ks={s['ko'],s['en']}|set(s['al'])
    if s['dn']:ks|={v['ko'] for v in s['dn'].values()}
    ks|={re.sub(r'\(.*?\)','',k) for k in list(ks)}|{m for k in list(ks) for m in re.findall(r'\((.*?)\)',k)}
    ks|={k[:-1] for k in list(ks) if k.endswith('역') and len(k)>2}|{k+'역' for k in list(ks)}
    return {norm(k) for k in ks if k}
online=collections.defaultdict(list)
for s in ST:
    for g in s['ln']:online[g].append(s)
def name_candidates(name):
    """CSV names may carry a subtitle in brackets, e.g. '복정(동서울대학)' or '판교(판교테크노밸리)'.
    Candidates, most specific first: the full text, the text without the bracket, the bracket content."""
    full=norm(name);bare=norm(re.sub(r'\(.*?\)','',name));inner=[norm(m) for m in re.findall(r'\((.*?)\)',name)]
    out=[]
    for c in [full,bare]+inner:
        if c and c not in out:out.append(c)
    return out
def match(name,g):
    for n in name_candidates(name):                       # try the most specific form first, fall back to the bare name
        c=[s for s in online[g] if n in keys(s)]
        if len(c)==1:return c[0]
        ex=[s for s in c if norm(s['ko'])==n]
        if len(ex)==1:return ex[0]
    return None
adj=collections.defaultdict(set)
for r in RT:
    for x,y in zip(r['a'],r['a'][1:]):adj[(r['g'],x)].add(y);adj[(r['g'],y)].add(x)
    if r.get('loop') and r['id']!='6l' and len(r['a'])>1:adj[(r['g'],r['a'][0])].add(r['a'][-1]);adj[(r['g'],r['a'][-1])].add(r['a'][0])
code=lambda s,g:s['cd'][g]
def ekey(g,a,b):
    ca,cb=sorted([code(ST[a],g),code(ST[b],g)]);return f"{g}|{ca}|{cb}"
mm=lambda s:int(s[:2])*60+int(s[3:])
REPORT=[];ride={};dist={};unm=collections.defaultdict(list)
# ---------- 1. Seoul Metro: exact running times ----------
rows=rd(F_SM);byl=collections.OrderedDict()
for r in rows:byl.setdefault(r['호선'],[]).append(r)
jumps=[];bad=[]
for g,rs in byl.items():
    seen=[]
    for k,r in enumerate(rs):
        s=match(r['역명'],g)
        if s is None:unm[F_SM].append((g,r['역명']));seen.append(None);continue
        seen.append(s['i'])
        if k==0:continue
        t=mm(r['소요시간']);d=float(r['역간거리(km)']);prev=seen[k-1]
        if prev is not None and prev in adj[(g,s['i'])]:pred=prev
        else:
            c=[p for p in adj[(g,s['i'])] if p in seen[:-1]]
            if not c:bad.append((g,r['역명']));continue
            pred=min(c,key=lambda p:abs(hv(ST[p],s)-d));jumps.append((g,ST[pred]['ko'],r['역명']))
        ride[ekey(g,pred,s['i'])]=[t,d]
# ---------- 3-6. NRA: official distance only ----------
for g,f in F_NRA.items():
    rs=rd(f);seq=[]
    for r in rs:
        s=match(r['역명'],g)
        if s is None:unm[f].append((g,r['역명']))
        seq.append((s,r['역간거리']))
    for (s1,d1),(s2,_) in zip(seq,seq[1:]):
        if s1 is None or s2 is None or d1=='':continue
        if s2['i'] not in adj[(g,s1['i'])]:bad.append((g,s1['ko']+'->'+s2['ko']));continue
        dist[ekey(g,s1['i'],s2['i'])]=float(d1)
# ---------- 2. transfers ----------
LM={'1호선':'1','2호선':'2','3호선':'3','4호선':'4','5호선':'5','6호선':'6','7호선':'7','8호선':'8','9호선':'9','공항철도':'공항철도','경의중앙선':'경의선','경춘선':'경춘선','수인분당선':'수인분당선','신분당선':'신분당선','우이신설선':'우이신설경전철','김포골드라인':'김포도시철도','서해선':'서해선','신림선':'신림선','경원선':'1'}
xfer={};tunm=[];asym=0
for r in rd(F_TR):
    g1=r['호선'];g2=LM.get(r['환승노선']);s=match(r['환승역명'],g1)
    if s is None or g2 is None or g2 not in s['ln']:tunm.append((r['호선'],r['환승역명'],r['환승노선']));continue
    k='|'.join(sorted([f"{g1}:{code(s,g1)}",f"{g2}:{code(s,g2)}"]));v=[int(r['환승거리']),mm(r['환승소요시간'])]
    if k in xfer and xfer[k]!=v:asym+=1
    xfer[k]=v
# ---------- model ----------
pts=[(v[1],v[0]) for v in ride.values() if v[1]>0 and v[0]>0]   # (km, sec)
n=len(pts);mx=sum(p[0] for p in pts)/n;my=sum(p[1] for p in pts)/n
b=sum((x-mx)*(y-my) for x,y in pts)/sum((x-mx)**2 for x,_ in pts);a=my-b*mx
res=[y-(a+b*x) for x,y in pts];sd=math.sqrt(sum(e*e for e in res)/(n-2));r2=1-sum(e*e for e in res)/sum((y-my)**2 for _,y in pts)
# leave-one-line-out cross validation
cv=[]
for g in sorted({k.split('|')[0] for k in ride}):
    tr=[(v[1],v[0]) for k,v in ride.items() if k.split('|')[0]!=g and v[1]>0];te=[(v[1],v[0]) for k,v in ride.items() if k.split('|')[0]==g and v[1]>0]
    m1=sum(p[0] for p in tr)/len(tr);m2=sum(p[1] for p in tr)/len(tr);b1=sum((x-m1)*(y-m2) for x,y in tr)/sum((x-m1)**2 for x,_ in tr);a1=m2-b1*m1
    err=[(a1+b1*x)-y for x,y in te];cv.append((g,len(te),sum(abs(e) for e in err)/len(err),sum(err)/len(err),(sum(a1+b1*x for x,_ in te)-sum(y for _,y in te))/sum(y for _,y in te)))
# kappa: official km / straight-line km
rat=[]
for k,v in ride.items():
    g,c1,c2=k.split('|');A=[s for s in online[g] if s['cd'][g]==c1][0];B=[s for s in online[g] if s['cd'][g]==c2][0]
    if v[1]>0:rat.append(v[1]/hv(A,B))
for k,v in dist.items():
    g,c1,c2=k.split('|');A=[s for s in online[g] if s['cd'][g]==c1][0];B=[s for s in online[g] if s['cd'][g]==c2][0];rat.append(v/hv(A,B))
rat.sort();kappa=rat[len(rat)//2]
# ---------- coverage by line ----------
cov=collections.OrderedDict()
for g in sorted({r['g'] for r in RT},key=lambda x:(len(x)>1,x)):
    pairs={tuple(sorted((x,y))) for r in RT if r['g']==g for x,y in zip(r['a'],r['a'][1:])}
    if any(r['g']==g and r.get('loop') and r['id']!='6l' for r in RT):
        for r in RT:
            if r['g']==g and r.get('loop') and r['id']!='6l':pairs.add(tuple(sorted((r['a'][0],r['a'][-1]))))
    o=sum(1 for x,y in pairs if ekey(g,x,y) in ride);d=sum(1 for x,y in pairs if ekey(g,x,y) in dist and ekey(g,x,y) not in ride)
    cov[g]=(len(pairs),o,d)
out={'meta':{'generated':datetime.date.today().isoformat(),'sources':[
  {'file':os.path.basename(F_SM),'kind':'exact running time + km (Seoul Metro lines 1-8)','rows':len(rows),'used':len(ride)},
  {'file':os.path.basename(F_TR),'kind':'exact transfer walking distance/time','rows':len(rd(F_TR)),'used':len(xfer)}]+
  [{'file':os.path.basename(f),'kind':'official distance only (km)','rows':len(rd(f)),'used':sum(1 for k in dist if k.split('|')[0]==g)} for g,f in F_NRA.items()],
 'model':{'fixedSec':round(a,1),'secPerKm':round(b,2),'cruiseKmh':round(3600/b,1),'n':n,'r2':round(r2,3),'residSdSec':round(sd,1),'kappa':round(kappa,3)}},
 'ride':ride,'dist':dist,'xfer':xfer}
js='// GENERATED by tools/build_travel_times.py from data-sources/travel-times/*.csv - do not edit by hand.\n// ride: "line|codeA|codeB" -> [exact running seconds, km]   dist: official km only   xfer: "g1:c1|g2:c2" -> [metres, walking seconds]\nconst TT = '+json.dumps(out,ensure_ascii=False,separators=(',',':'))+';\n'
open('travel-times.js','w',encoding='utf8').write(js)
# ---------- report ----------
L=[]
L.append('# Travel-time data report (generated)\n')
L.append('| file | kind | rows | values used |\n|---|---|---|---|')
for s in out['meta']['sources']:L.append(f"| {s['file']} | {s['kind']} | {s['rows']} | {s['used']} |")
L.append('\nNote: all six files are **CSV (cp949)**, not Excel workbooks; there are no sheets.\n')
L.append('## Mapping onto data.js')
L.append(f"- Exact running-time edges: **{len(ride)}** (branch jumps resolved by adjacency + km check: {len(jumps)}: {jumps[:8]})")
L.append(f"- Distance-only edges (not overlapping an exact one): **{len([k for k in dist if k not in ride])}**")
L.append(f"- Transfer pairs: **{len(xfer)}** (conflicting duplicates: {asym}); unmapped transfer rows: {tunm}")
L.append(f"- Unmapped station names: { {os.path.basename(k):v for k,v in unm.items()} or 'none'}")
L.append(f"- Rows that could not be attached to an adjacent pair: {bad or 'none'}")
L.append('\n## Coverage of the app graph (adjacent station pairs)\n| line | pairs in app | exact time | distance only | neither |\n|---|---|---|---|---|')
for g,(p,o,d) in cov.items():L.append(f"| {g} | {p} | {o} | {d} | {p-o-d} |")
tp=sum(v[0] for v in cov.values());to=sum(v[1] for v in cov.values());td=sum(v[2] for v in cov.values())
L.append(f"| **all** | {tp} | {to} ({100*to/tp:.0f}%) | {td} ({100*td/tp:.0f}%) | {tp-to-td} ({100*(tp-to-td)/tp:.0f}%) |")
L.append('\n## Time model for distance-only segments\n`seconds = %.1f + %.2f x km`  (cruise %.1f km/h, n=%d exact segments, R2=%.3f, residual sd %.1f s)\n'%(a,b,3600/b,n,r2,sd))
L.append(f"Route distance without an official km: straight-line km x **{kappa:.3f}** (median of official km / straight-line km over {len(rat)} segments; p5 {rat[len(rat)//20]:.2f}, p95 {rat[-len(rat)//20]:.2f}).\n")
L.append('Leave-one-line-out cross-validation (fit on the other lines, predict this line):\n\n| line | segments | mean abs error (s) | mean bias (s) | bias on line total |\n|---|---|---|---|---|')
for g,nn,mae,bi,tb in cv:L.append(f"| {g} | {nn} | {mae:.1f} | {bi:+.1f} | {100*tb:+.1f}% |")
# ---------- before/after the parenthetical-name normalization ----------
BF=SRC+'coverage_before_name_fix.json'
if os.path.exists(BF):
    B=json.load(open(BF,encoding='utf8'))
    L.append('\n## Coverage before vs after the station-name normalization (Issue #3)\n')
    L.append('Cause: data.js stores plain names (복정, 판교, 죽전 ...) while the National Railway Authority files add the station subtitle in brackets (복정(동서울대학), 판교(판교테크노밸리) ...). Only the app side was being stripped of brackets, never the CSV side. `name_candidates()` now tries full text, text without brackets, then the bracket content.\n')
    L.append('| line | distance-only before | distance-only after | neither before | neither after |\n|---|---|---|---|---|')
    for g,(p_,o_,d_) in cov.items():
        b=B['lines'].get(g)
        if b and (b['dist']!=d_ or b['neither']!=p_-o_-d_):L.append(f"| {g} | {b['dist']} | {d_} | {b['neither']} | {p_-o_-d_} |")
    b=B['lines']['all']
    L.append(f"| **all lines** | {b['dist']} ({100*b['dist']/b['pairs']:.0f}%) | {td} ({100*td/tp:.0f}%) | {b['neither']} ({100*b['neither']/b['pairs']:.0f}%) | {tp-to-td} ({100*(tp-to-td)/tp:.0f}%) |")
    L.append(f"\nExact running-time segments: {b['exact']} before, {to} after (unchanged - the Seoul Metro file had no bracketed names). Transfer pairs: {B['transfer_pairs']} before, {len(xfer)} after (140 file rows describe both directions of the same interchange, so rows > unique pairs).")
# ---------- Issue #11: audit of the lines that have no dedicated file ----------
AUD=[('GTX-A','GTX-A'),('경강선','경강선'),('경의선 (경의중앙선)','경의선'),('경춘선','경춘선'),('김포골드라인','김포도시철도'),('서해선','서해선'),('신림선','신림선'),('용인경전철','용인경전철'),('우이신설경전철','우이신설경전철'),('의정부경전철','의정부경전철'),('인천1호선','인천선'),('인천2호선','인천2호선')]
L.append('\n## Coverage audit: lines without their own distance/time file (Issue #11)\n')
L.append('| line | adjacent pairs in the app | exact time | official distance | neither (estimated at run time) |\n|---|---|---|---|---|')
for nm,g in AUD:
    p_,o_,d_=cov[g];L.append(f"| {nm} | {p_} | {o_} | {d_} | {p_-o_-d_} |")
L.append("""
**What the current files can still improve:** nothing more for these lines. Every row of the six files is already used (see the table of sources); the bracket-name fix was the last gain available. The remaining gaps are lines for which no supplied file contains a single row, plus two stations that exist in the source files but not in data.js: **당고개** (Seoul Metro file, Line 4, which also leaves 상계-불암산 without an exact time) and **능길** (Suin-Bundang file). Neither is added here - no placeholder stations or coordinates are invented.

**Additional datasets that would be required (nothing below has been fabricated; the app flags these segments as *estimated*):**

| need | for which lines | likely source (not verified to exist for every line) |
|---|---|---|
| inter-station **running times** (best) | all lines above, and the uncovered parts of Lines 1, 3, 4, 7, 8, 9, 수인분당선, 신분당선, 공항철도 | the operator's own published standard running times, in the same form as the Seoul Metro "역간거리 및 소요시간" file; or operator timetables (successive station departure times of one train) |
| inter-station **distances** | the 12 lines above | the 국가철도공단 `역간거리` series on data.go.kr - the four supplied files (공항철도, 9호선, 수인분당선, 신분당선) belong to it; check for `국가철도공단_<노선명>_역간거리` for the other lines |
| **transfer walking times** for non-Seoul-Metro interchanges (경의선, 서해선, GTX-A, 신분당선 ...) | 경의선 x 서해선/경춘선/공항철도/수인분당선, GTX-A x any, 4 x 수인분당선, ... | operator station-guide data, or the Seoul Metro transfer file extended to those operators |
| the missing stations **당고개, 능길** (with coordinates) | Line 4 / 수인분당선 | the master station list used to generate data.js (서울시 역사마스터 정보) |
""")
open('TRAVEL_TIME_DATA_REPORT.md','w',encoding='utf8').write('\n'.join(L)+'\n')
print('\n'.join(L))
