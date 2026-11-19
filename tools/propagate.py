import re,json,math,subprocess,collections
exec(open('svgmatch.py').read().split('# ---- validation')[0])   # reuse parsing, labels, sym, pdist, guess, POS, RP, ST
open('dump2.js','w').write("const fs=require('fs'),vm=require('vm');const c={};vm.createContext(c);vm.runInContext(fs.readFileSync('data.js','utf8')+';this.RT=RT;',c);console.log(JSON.stringify(c.RT))")
RT=json.loads(subprocess.check_output(['node','dump2.js'],cwd='/tmp/p'))
def pts_of(d):return [(float(a),float(b)) for a,b in re.findall(r'(-?[\d.]+),(-?[\d.]+)',d)]
PATHS={l:[pts_of(d) for d in ds] for l,ds in RP.items()}
def proj(P,p):
    best=(1e9,0);off=0
    for i in range(len(P)-1):
        ax,ay=P[i];bx,by=P[i+1];dx,dy=bx-ax,by-ay;L=math.hypot(dx,dy);den=dx*dx+dy*dy
        t=0 if not den else max(0,min(1,((p[0]-ax)*dx+(p[1]-ay)*dy)/den))
        d=math.hypot(p[0]-(ax+t*dx),p[1]-(ay+t*dy))
        if d<best[0]:best=(d,off+t*L)
        off+=L
    return best[1],best[0]
base={}
for st in ST:
    k=known(st)
    if k:base[st['i']]=(k[0],k[1])
def infer(pos,only=None):
    """return dict i->(x,y) inferred from neighbours; only: restrict to these station idx"""
    out={}
    for r in RT:
        g=r['g'];a=r['a']
        if g not in PATHS:continue
        n=len(a);j=0
        while j<n:
            if a[j] in pos or a[j] in out:j+=1;continue
            # gap [j..k)
            k=j
            while k<n and a[k] not in pos and a[k] not in out:k+=1
            if j==0 or k>=n:j=k;continue
            pa,pb=a[j-1],a[k]
            if pa not in pos and pa not in out:j=k;continue
            A=pos.get(pa) or out[pa];B=pos.get(pb) or out[pb]
            need=a[j:k]
            if only is not None and not any(x in only for x in need):j=k;continue
            for P in PATHS[g]:
                sa,da=proj(P,A);sb,db=proj(P,B)
                if da>14 or db>14 or abs(sa-sb)<20:continue
                lo,hi=min(sa,sb),max(sa,sb)
                cand=[]
                for sx,sy,kk in sym:
                    s_,d_=proj(P,(sx,sy))
                    if d_<=8 and lo+12<s_<hi-12:cand.append((s_,sx,sy))
                cand.sort(key=lambda c:c[0])
                # drop near-duplicates (a transfer symbol and a tick at the same spot)
                ded=[]
                for c in cand:
                    if not ded or abs(c[0]-ded[-1][0])>25:ded.append(c)
                if len(ded)==len(need):
                    seq=ded if sa<sb else ded[::-1]
                    for s_i,c in zip(need,seq):out[s_i]=(c[1],c[2])
                    break
            j=k
    return out
# leave-one-out validation on known stations
ok=bad=skip=0
for st in ST:
    i=st['i']
    if i not in base:continue
    pos={k:v for k,v in base.items() if k!=i}
    r=infer(pos,only={i})
    if i in r:
        e=math.hypot(r[i][0]-base[i][0],r[i][1]-base[i][1]);ok+=e<=40;bad+=e>40
    else:skip+=1
print('leave-one-out: ok',ok,'wrong',bad,'abstained',skip)
# apply: start from base + name-matched, iterate
extra={int(k):(v[0],v[1]) for k,v in json.load(open('newpos.json')).items()}
pos=dict(base)
for _ in range(4):
    r=infer(pos)
    if not r:break
    pos.update(r)
inferred={i:v for i,v in pos.items() if i not in base}
print('inferred by neighbour propagation',len(inferred))
# merge: propagation first, then name-matched for the rest
final=dict(inferred)
for i,v in extra.items():
    if i not in base and i not in final:final[i]=(v[0],v[1])
print('total extra',len(final),'overall matched',len(base)+len(final),'of',len(ST))
json.dump({str(k):v for k,v in final.items()},open('final_extra.json','w'))
print('names missing:',[st['en'] for st in ST if st['i'] not in base and st['i'] not in final][:40])
