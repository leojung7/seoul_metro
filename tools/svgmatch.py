import re,json,math,collections
s=open('Seoul_subway_linemap_en.svg',encoding='utf-8').read()
sp=open('svg-positions.js',encoding='utf-8').read()
def grab(name):
    m=re.search(r'const %s = (?:Object\.freeze\()?(\{.*?\})\)?;\s*(?:const|$)'%name,sp,re.S);return json.loads(m.group(1))
POS=grab('SVG_POSITIONS');RP=grab('SVG_ROUTE_PATHS')
data=open('data.js',encoding='utf-8').read()
# station table via node
import subprocess
open('dump.js','w').write("const fs=require('fs'),vm=require('vm');const c={};vm.createContext(c);vm.runInContext(fs.readFileSync('data.js','utf8')+';this.ST=ST;',c);console.log(JSON.stringify(c.ST.map(s=>({i:s.i,ko:s.ko,en:s.en,cd:s.cd,ln:s.ln}))))")
ST=json.loads(subprocess.check_output(['node','dump.js']))
# --- labels
labels=[]
for m in re.finditer(r'<text transform="matrix\(([^)]*)\)"([^>]*)>(.*?)</text>',s,re.S):
    a,b,c_,d,e,f=map(float,m.group(1).split());txt=re.sub(r'<[^>]+>','',m.group(3));txt=re.sub(r'\s+',' ',txt.replace('&amp;','&')).strip()
    if txt:labels.append({'x':e,'y':f,'ang':math.atan2(b,a),'t':txt})
print('labels',len(labels))
# --- symbols: transfer uses + short tick lines
sym=[]
for m in re.finditer(r'<use [^>]*transform="matrix\(([^)]*)\)"',s):
    v=list(map(float,m.group(1).split()));sym.append((v[4],v[5],'use'))
for m in re.finditer(r'<line class="(S[A-Z0-9]*)" x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/>',s):
    x1,y1,x2,y2=map(float,m.groups()[1:]);L=math.hypot(x2-x1,y2-y1)
    if L<=40:sym.append(((x1+x2)/2,(y1+y2)/2,'tick'))
for m in re.finditer(r'<circle class="P[A-Z0-9]*" cx="[^"]*" cy="[^"]*" r="[^"]*"/>',s):pass
print('symbols',len(sym),collections.Counter(k for *_,k in sym))
def norm(x):return re.sub(r'[^a-z0-9]','',x.lower().replace("nat`l","natl").replace("nat'l","natl"))
bylabel=collections.defaultdict(list)
for l in labels:bylabel[norm(l['t'])].append(l)
def pdist(p,line):
    best=1e9
    for d in RP.get(line,[]):
        pts=[(float(a),float(b)) for a,b in re.findall(r'(-?[\d.]+),(-?[\d.]+)',d)]
        for i in range(len(pts)-1):
            ax,ay=pts[i];bx,by=pts[i+1];dx,dy=bx-ax,by-ay;den=dx*dx+dy*dy
            t=0 if not den else max(0,min(1,((p[0]-ax)*dx+(p[1]-ay)*dy)/den))
            best=min(best,math.hypot(p[0]-(ax+t*dx),p[1]-(ay+t*dy)))
    return best
def known(s):
    for l,c in s['cd'].items():
        k=f'{l}:{c}'
        if k in POS:
            v=POS[k];v=v if isinstance(v,dict) else v[0] if isinstance(v,list) else v;return (v['x'],v['y'])
    return None
def guess(st,R=260,PD=14,AMB=25):
    cands=bylabel.get(norm(st['en']),[])
    scored=[]
    for lab in cands:
        for sx,sy,k in sym:
            ln=len(lab['t'])*17
            ex,ey=lab['x']+ln*math.cos(lab['ang']),lab['y']+ln*math.sin(lab['ang'])
            dx,dy=ex-lab['x'],ey-lab['y'];den=dx*dx+dy*dy;t=max(0,min(1,((sx-lab['x'])*dx+(sy-lab['y'])*dy)/den)) if den else 0
            d=math.hypot(sx-(lab['x']+t*dx),sy-(lab['y']+t*dy))
            if d>R:continue
            pd=min([pdist((sx,sy),l) for l in st['ln']] or [1e9])
            if pd>PD:continue
            scored.append((d+3*pd,sx,sy,pd,d))
    if not scored:return None
    scored.sort()
    b=scored[0]
    for o in scored[1:]:
        if math.hypot(o[1]-b[1],o[2]-b[2])>45 and o[0]-b[0]<AMB:return None
    return b
# ---- validation on already matched stations
ok=bad=none=0;errs=[]
for st in ST:
    kn=known(st)
    if not kn:continue
    g=guess(st,260,14,25)
    if not g:none+=1;continue
    err=math.hypot(g[1]-kn[0],g[2]-kn[1])
    if err<=40:ok+=1
    else:bad+=1;errs.append((st['en'],round(err)))
print('validation on known: ok',ok,'wrong',bad,'nocandidate',none);print(errs[:15])
# ---- apply to unmatched
res={};unm=[st for st in ST if not known(st)]
for st in unm:
    g=guess(st,260,14,25)
    if g:res[st['i']]=(round(g[1],1),round(g[2],1),round(g[3],1))
print('unmatched',len(unm),'newly matched',len(res))
json.dump(res,open('newpos.json','w'))
miss=[st['en'] for st in unm if st['i'] not in res][:25];print('still missing sample',miss)

print('---- debug')
for en in ('Seoul Station','Sookmyung Women`s Univ.','Dongjak','Chongshin Univ.','Sinchon','Gongdeok'):
    st=[x for x in ST if x['en']==en]
    if not st:print(en,'no ST');continue
    st=st[0];cands=bylabel.get(norm(en),[])
    print(en,'labels',[(round(l['x']),round(l['y']),round(math.degrees(l['ang']))) for l in cands],'lines',st['ln'])
    sc=[]
    for lab in cands:
        for sx,sy,k in sym:
            ln=len(lab['t'])*17;ex,ey=lab['x']+ln*math.cos(lab['ang']),lab['y']+ln*math.sin(lab['ang'])
            dx,dy=ex-lab['x'],ey-lab['y'];den=dx*dx+dy*dy;t=max(0,min(1,((sx-lab['x'])*dx+(sy-lab['y'])*dy)/den)) if den else 0
            d=math.hypot(sx-(lab['x']+t*dx),sy-(lab['y']+t*dy))
            if d>260:continue
            pd=min([pdist((sx,sy),l) for l in st['ln']] or [1e9])
            sc.append((round(d+3*pd),round(sx),round(sy),round(pd,1),k))
    sc.sort();print('  top',sc[:5])
