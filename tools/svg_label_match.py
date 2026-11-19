#!/usr/bin/env python3
"""Label-offset matcher for the official Seoul subway SVG.
Learns, from stations whose symbol is CODE-VERIFIED (svg-positions.js), how a station's text label sits relative to its
symbol (a few discrete patterns). For an unplaced station it predicts the symbol from the label, then ACCEPTS only if
  1. exactly one real symbol of the artwork matches a learned pattern,
  2. that symbol lies on one of the station's OWN line paths of the artwork,
  3. no other station (verified or candidate) claims the same symbol.
Nothing is interpolated: every output position is an existing symbol centre.
Validated by leave-one-out on the verified stations (precision must be ~100%).
Usage: python3 tools/svg_label_match.py   (run from the project root; needs node)"""
import re,json,math,collections,subprocess,sys,os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)));os.chdir(ROOT)
ko=open('Seoul_subway_linemap_ko.svg',encoding='utf8').read()
labels=[]
for m in re.finditer(r'<text transform="matrix\(([^)]*)\)"([^>]*)>(.*?)</text>',ko,re.S):
    a,b,c,d,e,f=map(float,m.group(1).split());t=re.sub(r'<[^>]+>','',m.group(3));t=re.sub(r'\s+','',t.replace('&amp;','&'))
    if t:labels.append(dict(t=t,e=e,f=f,ang=math.atan2(b,a)))
open('/tmp/dump_lm.js','w').write("""
const fs=require('fs'),vm=require('vm');const c={console,window:{}};vm.createContext(c);
vm.runInContext(fs.readFileSync('data.js','utf8')+'\\n;'+fs.readFileSync('svg-positions.js','utf8')+';globalThis.O={ST:ST.map(s=>({i:s.i,ko:s.ko,en:s.en,cd:s.cd,ln:s.ln,al:s.aliases,dn:s.displayNames||null})),POS:SVG_POSITIONS,SYM:SVG_SYMBOLS,RP:SVG_ROUTE_PATHS};',c);
process.stdout.write(JSON.stringify(c.O));""")
O=json.loads(subprocess.check_output(['node','/tmp/dump_lm.js']))
ST,POS,RP=O['ST'],O['POS'],O['RP']
# Full symbol universe straight from the artwork: transfer <use> symbols + short station tick marks.
# (svg-positions.js SVG_SYMBOLS only held 577 of the 767 symbols in the SVG.)
SYM=[]
_svg=open('Seoul_subway_linemap_ko.svg',encoding='utf8').read()
for _m in re.finditer(r'<use [^>]*transform="matrix\(([^)]*)\)"',_svg):
    _v=list(map(float,_m.group(1).split()));SYM.append((_v[4],_v[5]))
for _m in re.finditer(r'<line class="(S[A-Z0-9]*)" x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/>',_svg):
    _x1,_y1,_x2,_y2=map(float,_m.groups()[1:])
    if math.hypot(_x2-_x1,_y2-_y1)<=40:SYM.append(((_x1+_x2)/2,(_y1+_y2)/2))
sk=lambda p:(round(p[0]),round(p[1]))
SYMIDX={}
for i,p in enumerate(SYM):SYMIDX.setdefault(sk(p),i)
def keys(s):return [f"{g}:{c}" for g,c in s['cd'].items()]
ver={}
for s in ST:
    for k in keys(s):
        if k in POS:ver[s['i']]=(POS[k]['x'],POS[k]['y']);break
# resolve verified conflicts (same symbol claimed by 2 stations): drop both from training
cnt=collections.Counter(sk(p) for p in ver.values());ver={i:p for i,p in ver.items() if cnt[sk(p)]==1}
# ---- path geometry ----
paths={}
for g,lst in RP.items():
    segs=[]
    for d in lst:
        pts=[(float(a),float(b)) for a,b in re.findall(r'(-?\d+\.?\d*),(-?\d+\.?\d*)',d)]
        segs+=list(zip(pts,pts[1:]))
    paths[g]=segs
def dseg(p,a,b):
    dx,dy=b[0]-a[0],b[1]-a[1];l=dx*dx+dy*dy;t=0 if not l else max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l))
    return math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)
def on_line(p,g,tol=16):
    return any(dseg(p,a,b)<=tol for a,b in paths.get(g,[]))
# ---- names -> labels ----
def norm(n):return re.sub(r'\s+','',n)
bylab=collections.defaultdict(list)
for l in labels:bylab[l['t']].append(l)
def namekeys(s):
    out=[s['ko']]+list(s['al'] or [])
    if s['dn']:out+=[v['ko'] for v in s['dn'].values()]
    out+=[re.sub(r'\(.*?\)','',n) for n in list(out)]
    out+=[n[:-1] for n in list(out) if n.endswith('역') and len(n)>2]
    return [norm(n) for n in dict.fromkeys(out) if n]
def frame(l,p):  # label->symbol offset in the label's own rotated frame
    dx,dy=l['e']-p[0],l['f']-p[1];c,s_=math.cos(l['ang']),math.sin(l['ang'])
    return (dx*c+dy*s_,-dx*s_+dy*c)
MINSUP=1;TOL=3.0
def learn(excl=None):
    pts=[]
    for i,p in ver.items():
        if i==excl:continue
        ls=[l for k in namekeys(ST[i]) for l in bylab.get(k,[])]
        if len(ls)!=1:continue
        pts.append(frame(ls[0],p))
    modes=[]
    for o in pts:
        for m in modes:
            if math.hypot(o[0]-m[0],o[1]-m[1])<2.0:m[2]+=1;m[0]+=(o[0]-m[0])/m[2];m[1]+=(o[1]-m[1])/m[2];break
        else:modes.append([o[0],o[1],1])
    return [(m[0],m[1]) for m in modes if m[2]>=MINSUP]
def predict(i,modes,claimed):
    s=ST[i];ls=[l for k in namekeys(s) for l in bylab.get(k,[])]
    if not ls:return None,'no label'
    found=set()
    for l in ls:
        c,s_=math.cos(l['ang']),math.sin(l['ang'])
        for ox,oy in modes:
            # label = symbol + R^-1*(ox,oy)  ->  symbol = label - R^-1*(ox,oy)
            px=l['e']-(ox*c-oy*s_);py=l['f']-(ox*s_+oy*c)
            for j,(x,y) in enumerate(SYM):
                if abs(x-px)<=TOL and abs(y-py)<=TOL and sk((x,y)) not in claimed:found.add(j)
    own=[j for j in found if any(on_line(SYM[j],g) for g in s['ln'])]
    if len(own)==1:return own[0],'ok'
    return None,('ambiguous' if len(own)>1 else 'no symbol on own line')
if __name__=='__main__':
    # ---- leave-one-out validation on verified stations ----
    modes_all=learn();print('modes',len(modes_all),'verified training stations',len(ver))
    res=collections.Counter();wrong=[]
    for i,p in ver.items():
        modes=learn(excl=i);claimed={sk(q) for k,q in ver.items() if k!=i}
        j,why=predict(i,modes,claimed)
        if j is None:res[why]+=1
        elif sk(SYM[j])==sk(p):res['correct']+=1
        else:res['WRONG']+=1;wrong.append((ST[i]['ko'],SYM[j],p))
    print('LOO:',dict(res));acc=res['correct']/max(1,res['correct']+res['WRONG']);print('LOO precision %.1f%% coverage %.1f%%'%(100*acc,100*(res['correct']+res['WRONG'])/len(ver)));print('wrong',wrong[:8])
    # ---- apply to unplaced stations ----
    claimed={sk(q) for q in ver.values()};cand={}
    for s in ST:
        if s['i'] in ver:continue
        j,why=predict(s['i'],modes_all,claimed)
        if j is not None:cand[s['i']]=j
    byj=collections.defaultdict(list)
    for i,j in cand.items():byj[j].append(i)
    final={i:j for i,j in cand.items() if len(byj[j])==1}
    print('unplaced',len(ST)-len(ver),'candidates',len(cand),'unique',len(final))
    out={}
    for i,j in final.items():
        s=ST[i];k=keys(s)[0];out[k]={'x':SYM[j][0],'y':SYM[j][1],'approx':True,'method':'label-offset'}
    json.dump(out,open('/tmp/labelmatch.json','w'),ensure_ascii=False)
    if '--emit' in sys.argv:
        js='// Generated by tools/svg_label_match.py (leave-one-out precision %.1f%% on %d code-verified stations).\n'%(100*acc,len(ver))
        js+='// SVG_ALL_SYMBOLS: every station symbol in the official artwork (transfer <use> + tick marks). SVG_POSITIONS_LABEL: unplaced stations whose\n// label implies exactly ONE symbol on their own line that no other station claims. No position is interpolated.\n'
        js+='const SVG_ALL_SYMBOLS = Object.freeze('+json.dumps([[round(x,2),round(y,2)] for x,y in SYM])+');\n'
        js+='const SVG_POSITIONS_LABEL = Object.freeze('+json.dumps(out,ensure_ascii=False)+');\n'
        open('svg-positions-labelmatch.js','w',encoding='utf8').write(js);print('wrote svg-positions-labelmatch.js',len(out),'positions',len(SYM),'symbols')
    json.dump({ST[i]['ko']:SYM[j] for i,j in final.items()},open('/tmp/labelmatch_names.json','w'),ensure_ascii=False)
