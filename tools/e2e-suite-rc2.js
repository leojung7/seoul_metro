// RC2 suite: Geo-first UX, route overlays, hit-testing, search aliases, header widths, localization, honesty (no simulated data).
// Run: node tools/e2e-suite-rc2.js
const {open}=require('./e2e.js');const fs=require('fs'),path=require('path');
const results=[];
const mk=(prof)=>(name,pass,detail='')=>{results.push({prof,name,pass:!!pass,detail:String(detail).slice(0,200)});console.log((pass?'PASS ':'FAIL ')+`[${prof}] ${name}${detail?' — '+String(detail).slice(0,200):''}`)};
const ROOT=path.resolve(__dirname,'..');
async function suite(prof){
 const ok=mk(prof);const mobile=prof!=='desktop';
 const t=await open(prof);const p=t.page;
 const tap=sel=>mobile?p.tap(sel):p.click(sel);
 const at=async(x,y)=>mobile?p.touchscreen.tap(x,y):p.mouse.click(x,y);
 const safe=async(name,fn)=>{try{await fn()}catch(e){ok(name,false,'EXCEPTION '+e.message.split('\n')[0])}};
 const W=await p.evaluate(()=>innerWidth),H=await p.evaluate(()=>innerHeight);
 // ---------- A. landing view ----------
 await safe('landing',async()=>{
  const r=await p.evaluate(()=>({tab:S.tab,geo:document.querySelector('#p-geo').classList.contains('on'),sch:document.querySelector('#p-sch').classList.contains('on'),btn:[...document.querySelectorAll('#tabs button.on')].map(b=>b.dataset.tab).join(','),m:document.querySelectorAll('#map svg circle[data-st]').length,first:document.querySelector('#tabs button').dataset.tab,second:document.querySelectorAll('#tabs button')[1].dataset.tab}));
  ok('fresh load opens Geo map',r.tab==='geo'&&r.geo&&!r.sch&&r.btn==='geo',JSON.stringify(r));
  ok('Geo map shows all 654 stations',r.m===654,'markers='+r.m);
  ok('Schematic remains a secondary tab',r.second==='sch');
 });
 // ---------- B. search -> Geo, aliases ----------
 await safe('search',async()=>{
  await p.evaluate(()=>tab('sch'));
  if(mobile){await tap('#mobile-search');await p.fill('#mobile-q','강남');await p.waitForTimeout(200);await p.click('.search-result');}
  else{await p.fill('#q','강남');await p.dispatchEvent('#q','change');}
  await p.waitForTimeout(400);
  const r=await p.evaluate(()=>({tab:S.tab,sel:S.sel&&S.sel.ko,c:window.__LMAP&&window.__LMAP.c,z:window.__LMAP&&window.__LMAP.z}));
  ok('search from Schematic jumps to Geo map and selects station',r.tab==='geo'&&r.sel==='강남',JSON.stringify(r));
  const g=await p.evaluate(()=>{const s=ST.find(x=>x.ko==='강남');return Math.abs(window.__LMAP.c[0]-s.lat)<0.002&&Math.abs(window.__LMAP.c[1]-s.lng)<0.002&&window.__LMAP.z>=14});
  ok('Geo map centres and zooms on the station',g);
  ok('station info opens from Geo map search',await p.evaluate(()=>document.querySelector('#ib').innerText.includes('Gangnam')||document.querySelector('#ib').innerText.includes('강남')));
  const al=await p.evaluate(()=>{const o={};const pairs=[['서울','서울역'],['지제','평택지제'],['뚝섬유원지','자양'],['원곡','시우'],['서구청','서해구청'],['화전','한국항공대'],['Seoul','서울역'],['Jije','평택지제'],['Gangnam','강남'],['Isu','총신대입구']];
   pairs.forEach(([q,e])=>{const r=searchStations(q,3).map(s=>s.ko);o[q]=r[0]===e||(r[0]!==e&&r.includes(e))?(r[0]===e?'ok':'lowrank:'+r.join('|')):'FAIL:'+r.join('|')});
   const s=ST.find(x=>x.cd&&Object.values(x.cd)[0]);const code=Object.values(s.cd)[0];o['code '+code]=searchStations(code,3).map(x=>x.ko).includes(s.ko)?'ok':'FAIL';
   return o});
  for(const [q,v] of Object.entries(al))ok(`search "${q}"`,v==='ok',v);
  const fld=await p.evaluate(()=>{tab('route');const o={};['서울','지제','원곡'].forEach(q=>{document.querySelector('#ra').value=q;const s=resolveStation(q);o[q]=s&&s.ko});return o});
  ok('route fields resolve aliases (서울→서울역, 지제→평택지제, 원곡→시우)',fld['서울']==='서울역'&&fld['지제']==='평택지제'&&fld['원곡']==='시우',JSON.stringify(fld));
 });
 // ---------- C. route highlighting ----------
 const routeEvidence=async(a,b,label)=>{
  await p.evaluate(()=>tab('route'));await p.fill('#ra',a);await p.fill('#rb',b);await p.click('#go');await p.waitForTimeout(250);
  const btn=await p.$('[data-route-geo="0"]');if(!btn){ok(`${label}: route found`,false);return null}
  await btn.scrollIntoViewIfNeeded();await btn.click();await p.waitForTimeout(600);
  return p.evaluate(()=>{const svg=document.querySelector('#map svg'),m=window.__LMAP;const pl=[...svg.querySelectorAll('polyline')];const red=pl.filter(q=>q.getAttribute('stroke')==='#e11d2e');
   const R=red[0]?red[0].getAttribute('points').split(' ').map(s=>s.split(',').map(Number)):[];
   const dist=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy;let t=l?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l:0;t=Math.max(0,Math.min(1,t));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)};
   const off=S.route.map(i=>m._P([ST[i].lat,ST[i].lng])).filter(pt=>{let b=1e9;for(let i=1;i<R.length;i++)b=Math.min(b,dist(pt,R[i-1],R[i]));return b>2}).length;
   const xs=R.map(q=>q[0]),ys=R.map(q=>q[1]);const sw=red[0]&&+red[0].getAttribute('stroke-width');
   return {tab:S.tab,redLayers:red.length,pts:R.length,stroke:sw,stationsOffLine:off,stations:S.route.length,pins:svg.querySelectorAll('g[data-pin]').length,transfers:S.routeMeta.transfers.length,tr:S.routeMeta.tr,inView:R.length>0&&Math.min(...xs)>=0&&Math.max(...xs)<=m.el.clientWidth&&Math.min(...ys)>=0&&Math.max(...ys)<=m.el.clientHeight,sig:R.slice(0,3).join(';')+'|'+R.length}});
 };
 await safe('routes',async()=>{
  let prevSig=null;
  for(const [a,b] of [['서울','강남'],['홍대입구','잠실'],['서울','인천공항'],['강남','서울역']]){
   const r=await routeEvidence(a,b,`${a}→${b}`);if(!r)continue;
   ok(`${a}→${b}: Geo map opened with overlay rendered`,r.tab==='geo'&&r.redLayers>=1&&r.pts>=2&&r.stroke>=4,JSON.stringify({pts:r.pts,stroke:r.stroke}));
   ok(`${a}→${b}: highlight passes through all ${r.stations} route stations (corrected coordinates)`,r.stationsOffLine===0,`${r.stationsOffLine} off line`);
   ok(`${a}→${b}: A + B + ${r.transfers} transfer pin(s)`,r.pins===2+r.transfers&&r.transfers===r.tr,`pins=${r.pins} transfers=${r.transfers}/${r.tr}`);
   ok(`${a}→${b}: whole route in view`,r.inView);
   if(prevSig)ok(`${a}→${b}: previous route cleared (single highlight)`,r.redLayers===1&&r.sig!==prevSig,'layers='+r.redLayers);
   prevSig=r.sig;
   await p.screenshot({path:`/tmp/rc2-route-${prof}-${a}-${b}.png`});
   await p.evaluate(()=>tab('sch'));await p.evaluate(()=>tab('geo'));await p.waitForTimeout(400);
   ok(`${a}→${b}: survives tab switch`,await p.evaluate(()=>[...document.querySelectorAll('#map svg polyline')].some(q=>q.getAttribute('stroke')==='#e11d2e')));
  }
  await p.evaluate(()=>tab('geo'));await p.click('#rs-clear');await p.waitForTimeout(200);
  ok('clear route removes the overlay',await p.evaluate(()=>!S.route&&![...document.querySelectorAll('#map svg polyline')].some(q=>q.getAttribute('stroke')==='#e11d2e')&&document.querySelectorAll('#map svg g[data-pin]').length===0));
 });
 // ---------- D. overlay must not block station taps (user-reported bug) ----------
 await safe('overlay clicks',async()=>{
  await routeEvidence('서울','강남','x');
  const pts=await p.evaluate(()=>{const m=window.__LMAP,r=m.el.getBoundingClientRect();const P=i=>m._P([ST[i].lat,ST[i].lng]);
   // "mid" = the route station that is farthest (in pixels) from every other station marker, i.e. one a finger can hit
   const others=i=>ST.filter(s=>s.i!==i).map(s=>P(s.i));let best=null,bd=-1;
   S.route.slice(1,-1).forEach(i=>{const a=P(i);let d=1e9;ST.forEach(s=>{if(s.i===i)return;const b=P(s.i);const dd=Math.hypot(a[0]-b[0],a[1]-b[1]);if(dd<d)d=dd});if(d>bd){bd=d;best=i}});
   return [['origin',S.route[0]],['mid',best],['destination',S.route[S.route.length-1]]].map(([n,i])=>{const [x,y]=P(i);const top=document.elementFromPoint(r.left+x,r.top+y);return {n,i,x:r.left+x,y:r.top+y,top:top&&(top.tagName+(top.closest('[data-pin]')?'[PIN]':''))}})});
  for(const q of pts){await p.evaluate(()=>{S.sel=null;if(isMobile())setSheet(null)});await p.waitForTimeout(450);await at(q.x,q.y);await p.waitForTimeout(450);
   const r=await p.evaluate(i=>({sel:S.sel&&S.sel.i,routeKept:!!S.route&&[...document.querySelectorAll('#map svg polyline')].some(q=>q.getAttribute('stroke')==='#e11d2e'),sheet:document.body.dataset.sheet,panel:document.querySelector('#ib').innerText.length>40,want:i}),q.i);
   ok(`tap ${q.n} station on route → details open, route stays`,r.sel===q.i&&r.routeKept&&r.panel&&(!mobile||r.sheet!=='hidden'),`top=${q.top} ${JSON.stringify(r)}`);
  }
  ok('route graphics are non-interactive (pins pointer-events:none)',await p.evaluate(()=>[...document.querySelectorAll('#map svg g[data-pin]')].every(g=>getComputedStyle(g).pointerEvents==='none')));
 });
 // ---------- E. sheet geometry ----------
 if(mobile)await safe('sheet2',async()=>{
  await p.evaluate(()=>{tab('geo');document.documentElement.style.setProperty('--safe-bottom','34px');document.documentElement.style.setProperty('--safe-top','47px');setSheet(null);select(ST.findIndex(s=>s.ko==='강남'),true);});await p.waitForTimeout(500);
  const g=async()=>p.evaluate(()=>{const e=document.querySelector('#info'),q=e.getBoundingClientRect(),h=document.querySelector('header').getBoundingClientRect();return {s:document.body.dataset.sheet,top:Math.round(q.top),bottom:Math.round(q.bottom),hb:Math.round(h.bottom),padB:parseFloat(getComputedStyle(document.querySelector('#ib')).paddingBottom),w:Math.round(q.width),left:Math.round(q.left)}});
  for(const st of ['peek','half','full']){await p.evaluate(s=>setSheet(s),st);await p.waitForTimeout(420);const r=await g();
   ok(`sheet ${st}: anchored to bottom, fully on-screen, below header`,r.bottom===H&&r.top>=r.hb-1&&r.top>=0&&r.w===W,JSON.stringify(r));
   ok(`sheet ${st}: respects safe-area bottom inset (34px)`,r.padB>=34,'padB='+r.padB);}
  await p.evaluate(()=>{document.documentElement.style.removeProperty('--safe-bottom');document.documentElement.style.removeProperty('--safe-top')});
 });
 // ---------- F. header across widths ----------
 await safe('header widths',async()=>{
  const widths=mobile?[320,360,375,390,414,430]:[1920,1366,1024,800,700];
  for(const w of widths){await p.setViewportSize({width:w,height:mobile?800:900});await p.waitForTimeout(150);
   const r=await p.evaluate(()=>{const he=document.querySelector('header'),hr=he.getBoundingClientRect();const kids=[...he.children].filter(e=>e.getBoundingClientRect().width>0);const tops=kids.map(e=>e.getBoundingClientRect().top);
    const tabs=document.querySelector('#tabs'),tr=tabs.getBoundingClientRect();
    const vis=id=>{const e=document.getElementById(id);const q=e.getBoundingClientRect();return q.width>0&&q.left>=-0.5&&q.right<=innerWidth+0.5&&e.scrollWidth<=e.clientWidth+1};
    const allIn=[...tabs.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width>0).every(b=>{const q=b.getBoundingClientRect();return q.left>=tr.left-1&&q.right<=tr.right+1});const clipped=[...tabs.querySelectorAll('button')].filter(b=>{const q=b.getBoundingClientRect();return q.width>0&&(q.right>tr.right+1||q.left<tr.left-1)&&tabs.scrollWidth<=tabs.clientWidth+1}).length;
    return {h:Math.round(hr.height),wrapSpread:Math.round(Math.max(...tops)-Math.min(...tops)),docScroll:document.documentElement.scrollWidth-innerWidth,lg:vis('lg'),more:vis('more-btn'),searchBtn:innerWidth>900?vis('q'):vis('mobile-search'),clipped,tabsScrollable:getComputedStyle(tabs).overflowX==='auto',allIn,geoVisible:(()=>{const b=document.querySelector('#tabs [data-tab=geo]').getBoundingClientRect();return b.width>0&&b.right<=tr.right+1&&b.left>=tr.left-1})()}});
   ok(`header @${w}px: one row, no page overflow`,r.h<=64&&r.wrapSpread<=10&&r.docScroll<=0,JSON.stringify({h:r.h,spread:r.wrapSpread,ds:r.docScroll}));
   ok(`header @${w}px: EN/한, ⋯ and search fully visible (no clipping)`,r.lg&&r.more&&r.searchBtn,JSON.stringify({lg:r.lg,more:r.more,s:r.searchBtn}));
   ok(`header @${w}px: Geo map tab visible, no clipped tabs, scrollable fallback`,r.geoVisible&&r.clipped===0&&r.tabsScrollable,JSON.stringify({geo:r.geoVisible,clipped:r.clipped,sc:r.tabsScrollable}));
   if(w>=360||w>=700)ok(`header @${w}px: ALL visible tabs fully inside the strip (nothing cut off)`,r.allIn);
  }
  if(mobile){await p.setViewportSize({width:280,height:700});await p.waitForTimeout(150);
   const sc=await p.evaluate(()=>{const t=document.querySelector('#tabs');const before=t.scrollLeft;t.scrollLeft=60;return {can:t.scrollWidth>t.clientWidth,moved:t.scrollLeft>before||t.scrollWidth<=t.clientWidth,lgOk:(q=>q.right<=innerWidth&&q.left>=0)(document.querySelector('#lg').getBoundingClientRect())}});
   ok('header @280px: tab strip scrolls horizontally, controls stay pinned',sc.moved&&sc.lgOk,JSON.stringify(sc));}
  await p.setViewportSize({width:W,height:H});await p.waitForTimeout(150);
 });
 // ---------- G. SVG hit testing ----------
 await safe('svg hit',async()=>{
  await p.evaluate(()=>{tab('sch');setSheet&&isMobile()&&setSheet(null);S.sel=null;fitSch()});await p.waitForTimeout(200);
  const info=await p.evaluate(()=>({placed:ST.filter(s=>svgPosition(s)).map(s=>s.i),A:{t:SVG_MATCH_AUDIT.total,m:SVG_MATCH_AUDIT.matched,u:SVG_MATCH_AUDIT.unmatched}}));
  ok('every station is placed OR listed as unmatched (no silent gaps)',info.A.m+info.A.u===info.A.t,JSON.stringify(info.A));
  const dom=await p.evaluate(()=>({n:document.querySelectorAll('#sch-hits > g').length,mis:[...document.querySelectorAll('#sch-hits > g')].filter(g=>{const s=ST[+g.dataset.i],q=svgPosition(s),c=g.querySelector('circle');return Math.hypot(+c.getAttribute('cx')-q.x,+c.getAttribute('cy')-q.y)>0.01}).length,shared:(()=>{const m=new Map();ST.forEach(s=>{const q=svgPosition(s);if(q){const k=Math.round(q.x)+','+Math.round(q.y);m.set(k,(m.get(k)||0)+1)}});return [...m.values()].filter(v=>v>1).length})(),far:ST.filter(s=>{const q=svgPosition(s);return q&&nearestSymbol(q)>4}).length}));
  ok('clickable SVG hit target for every placed station',dom.n===info.A.m,`hits=${dom.n} placed=${info.A.m}`);
  ok('hit targets centred exactly on their symbol positions',dom.mis===0);
  ok('no two stations share one SVG symbol',dom.shared===0,'shared='+dom.shared);
  ok('every placed position lies on a real symbol of the official SVG (<=4 units)',dom.far===0,'far='+dom.far);
  const sample=info.placed.filter((_,k)=>k%Math.ceil(info.placed.length/(mobile?24:40))===0);let bad=[];
  for(const i of sample){
   await p.evaluate(i=>{const s=ST[i],q=svgPosition(s),r=(sv.clientHeight/sv.clientWidth)||1.1;S.sel=null;VB=[q.x-220,q.y-220*r,440,440*r];vb();},i);await p.waitForTimeout(40);
   const pt=await p.evaluate(i=>{const g=document.querySelector(`#sch-hits > g[data-i="${i}"]`);if(!g)return null;const c=g.querySelector('circle:nth-child(2)').getBoundingClientRect();return {x:c.left+c.width/2,y:c.top+c.height/2}},i);
   if(!pt){bad.push(ST[i]?.ko+':nohit');continue}
   if(pt.y<60||pt.y>H-20||pt.x<5||pt.x>W-5){bad.push('offscreen:'+i);continue}
   await at(pt.x,pt.y);await p.waitForTimeout(60);
   const got=await p.evaluate(()=>S.sel&&S.sel.i);if(got!==i)bad.push(`${await p.evaluate(i=>ST[i].ko,i)}→${got==null?'none':await p.evaluate(g=>ST[g].ko,got)}`);
  }
  ok(`clicking ${sample.length} sampled SVG stations selects the right station`,bad.length===0,bad.slice(0,6).join(', '));
  await p.evaluate(()=>fitSch());
 });
 // ---------- H. geo validation ----------
 await safe('geo',async()=>{
  await p.evaluate(()=>{tab('geo');if(isMobile())setSheet(null)});await p.waitForTimeout(300);
  const r=await p.evaluate(()=>{const m=window.__LMAP,cs=[...document.querySelectorAll('#map svg circle[data-st]')];
   const hv2=(a,b)=>{const q=Math.PI/180,d=(b.lat-a.lat)*q,e=(b.lng-a.lng)*q,h=Math.sin(d/2)**2+Math.cos(a.lat*q)*Math.cos(b.lat*q)*Math.sin(e/2)**2;return 12742*Math.asin(Math.sqrt(h))};
   let impossible=[];RT.forEach(r=>{for(let i=1;i<r.a.length;i++){const d=hv2(ST[r.a[i-1]],ST[r.a[i]]);const lim=/GTX|^A$/.test(r.id)?30:15;if(d>lim)impossible.push(r.id+':'+ST[r.a[i-1]].ko+'→'+ST[r.a[i]].ko+' '+d.toFixed(1))}});
   const out=ST.filter(s=>!(s.lat>34.5&&s.lat<38.5&&s.lng>125.5&&s.lng<128.5));
   return {markers:cs.length,stations:ST.length,impossible,outOfRegion:out.map(s=>s.ko),ap:ST.filter(s=>s.ap||s.geoEst).length,coordsFromData:ST.every(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lng))}});
  ok('every station has a Geo marker',r.markers===r.stations,`${r.markers}/${r.stations}`);
  ok('no impossible route hops (>15 km, GTX/AREX >30 km)',r.impossible.length===0,r.impossible.slice(0,3).join(' | '));
  ok('no station outside the Seoul region / Korea',r.outOfRegion.length===0,r.outOfRegion.join(','));
  ok('no synthetic or estimated coordinates in use',r.ap===0&&r.coordsFromData);
  // marker alignment with coordinates (sample)
  const al=await p.evaluate(()=>{const m=window.__LMAP,svg=document.querySelector('#map svg');const cs=[...svg.querySelectorAll('circle[data-st]')];let bad=0;const sts=ST.filter(s=>!S.sel||true);
   // markers are appended in ST order (filter "*"): compare each with projected coordinate
   cs.forEach((c)=>{const s=ST[+c.dataset.sid],[x,y]=m._P([s.lat,s.lng]);if(Math.hypot(+c.getAttribute('cx')-x,+c.getAttribute('cy')-y)>0.6)bad++});return bad});
  ok('Geo markers sit exactly on their data.js coordinates',al===0,'misplaced='+al);
  await p.evaluate(()=>{const m=window.__LMAP;m.setView([37.5547,126.9707],15)});await p.waitForTimeout(100);
  ok('zoom/centering: setView centres map',await p.evaluate(()=>Math.abs(window.__LMAP.c[0]-37.5547)<1e-6&&window.__LMAP.z===15));
 });
 // ---------- I. honesty: no simulated information ----------
 await safe('honesty',async()=>{
  const src=['app.js','index.html'].map(f=>fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n').replace(/does not show live train arrivals, real-time delays, crowding, or verified lift\/escalator status/g,'');
  const forbidden=[/next train/i,/countdown/i,/crowding/i,/occupancy/i,/passenger load/i,/simulat/i,/estimated arrival/i,/arrival\s*≈/i,/Estimated fare/i,/fare\s*\(/i,/\bnext\s+arrival/i];
  const hits=forbidden.map(f=>[f.source,(src.match(new RegExp(f.source,'gi'))||[]).length]).filter(x=>x[1]);
  ok('source contains no next-train / crowding / occupancy / simulation / fare / arrival-estimate wording',hits.length===0,JSON.stringify(hits));
  for(const lang of ['en','ko']){
   await p.evaluate(l=>{if(S.lang!==l){document.querySelector('#lg').click()}},lang);await p.waitForTimeout(150);
   const txt=await p.evaluate(()=>{select(ST.findIndex(s=>s.ko==='강남'),true);const a=document.querySelector('#ib').innerText;tab('route');document.querySelector('#ra').value='서울역';document.querySelector('#rb').value='사당';document.querySelector('#go').click();const b=document.querySelector('#rres').innerText;tab('guide');const g=document.querySelector('#p-guide').innerText;tab('geo');return a+'\n'+b+'\n'+g});
   const bad=/next train|다음 열차|crowd|혼잡|occupan|점유|arrival|도착 예정|fare|요금|\bmin\b.*estimated|시뮬/i.exec(txt.replace(/No live arrivals[^.]*\./i,'').replace(/실시간 도착 정보는[^.]*\./,'').replace(/live train arrivals, real-time delays, crowding,[^.]*\./i,'').replace(/실시간 열차 도착, 지연, 혼잡도[^.]*\./,'').replace(/\(arrivals, delays\)/i,'').replace(/\(도착, 지연\)/,'').replace(/not real-time/gi,''));
   ok(`[${lang}] station/route/guide panels show no simulated data`,!bad,bad&&bad[0]);
   const ti=await p.evaluate(()=>{select(ST.findIndex(s=>s.ko==='강남'),true);return document.querySelector('#ib').innerText});
   ok(`[${lang}] typical interval is labelled "not real-time"`,lang==='en'?/Typical interval \(not real-time\)/.test(ti)&&/3–5/.test(ti)&&/6–10/.test(ti):/실시간 아님/.test(ti)&&/3–5/.test(ti),ti.split('\n').filter(l=>/interval|배차/i.test(l)).join('|'));
   ok(`[${lang}] no countdown timers running`,await p.evaluate(()=>!document.querySelector('#nt, .countdown, [data-countdown]')));
  }
  if(await p.evaluate(()=>S.lang)==='ko')await p.click('#lg');
 });
 // ---------- J. localization ----------
 await safe('i18n',async()=>{
  const both=await p.evaluate(()=>{let bad=[];ST.forEach(s=>{S.lang='en';const e=infoHTML(s);S.lang='ko';const k=infoHTML(s);S.lang='en';
    const en=dnames(s,s.ln[0]);if(!e.includes(en.en.replace(/&/g,'&amp;').replace(/</g,'&lt;'))&&!e.includes(en.en.replace(/'/g,'&#39;'))&&!e.includes(esc(en.en)))bad.push(s.ko+':en');
    if(!k.includes(esc(dnames(s,s.ln[0]).ko)))bad.push(s.ko+':ko')});S.lang='en';return bad.slice(0,8)});
  ok('every station renders in both English and Korean',both.length===0,both.join(','));
  // English route wording
  await p.evaluate(()=>tab('route'));await p.fill('#ra','강남');await p.fill('#rb','서울역');await p.click('#go');await p.waitForTimeout(250);
  await p.evaluate(()=>document.querySelectorAll('[data-route-steps]').forEach(b=>b.click()));
  const en=await p.evaluate(()=>document.querySelector('#route-steps-0').innerText);
  ok('EN route: "Board Line 2"',/Board Line 2/.test(en),en.slice(0,80).replace(/\n/g,' | '));
  ok('EN route: "Transfer at … (한글)"',/Transfer at [^\n]*\([가-힣·\s]+\)/.test(en),en.replace(/\n/g,' | ').slice(0,220));
  ok('EN route: "Exit at Seoul Station (서울역)"',/Exit at Seoul Station \(서울역\)/.test(en));
  await p.click('#lg');await p.waitForTimeout(250);
  const ko=await p.evaluate(()=>{document.querySelectorAll('[data-route-steps]').forEach(b=>{const pn=document.querySelector('#route-steps-'+b.dataset.routeSteps);if(pn.hidden)b.click()});return document.querySelector('#route-steps-0').innerText});
  ok('KO route: "2호선 탑승"',/2호선 탑승/.test(ko),ko.slice(0,80).replace(/\n/g,' | '));
  ok('KO route: "… 환승"',/\S+ 환승/.test(ko));
  ok('KO route: "서울역 하차"',/서울역 하차/.test(ko));
  // station page localization
  const kst=await p.evaluate(()=>{select(ST.findIndex(s=>s.ko==='강남'),true);return document.querySelector('#ib').innerText});
  ok('KO station page: labels translated, name in Korean',/강남/.test(kst)&&/환승 가능/.test(kst)&&/배차 간격/.test(kst)&&!/Station codes|Origin|Destination|Transfer available/.test(kst),kst.split('\n').slice(0,6).join(' | '));
  await p.click('#lg');await p.waitForTimeout(250);
  const est=await p.evaluate(()=>document.querySelector('#ib').innerText);
  ok('EN station page: "Gangnam (강남)", "Line 2", "Transfer available"',/Gangnam \(강남\)/.test(est)&&/Line 2/.test(est)&&/Transfer available/i.test(est),est.split('\n').slice(0,5).join(' | '));
  // untranslated Latin text sweep in Korean mode
  await p.click('#lg');await p.waitForTimeout(200);
  const allow=/^(GTX|AREX|SVG|CSV|WGS84|YouTube|Google|EN|PDF|KST|LRT|[A-Z]\d+|\d+|km|K\d+)/;
  const sweep=await p.evaluate(()=>{const out=new Set();for(const tb of ['geo','sch','lines','route','off','guide']){tab(tb);document.querySelectorAll('.pane.on, header, #more-menu').forEach(root=>{const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);while(w.nextNode()){const n=w.currentNode,el=n.parentElement;if(!el||el.closest('svg,script,style,#dl,#gl,#lst,#lgrid,#lban,.leaflet-container,#ib,#pk-list,#sch-tip')||getComputedStyle(el).display==='none')continue;const tx=n.nodeValue.trim();if(!tx)continue;const rest=tx.replace(/[가-힣]+/g,' ');const words=(rest.match(/[A-Za-z][A-Za-z'’.\-]{2,}/g)||[]);if(words.length)out.add(tb+': '+tx.slice(0,70))}})}tab('geo');return [...out]});
  const left=sweep.filter(x=>!/GTX|AREX|SVG|CSV|WGS84|YouTube|Google|PDF|LRT|Seoul Metro|SVG: English|KST|\bEN\b/.test(x));
  ok('Korean mode: no untranslated English UI text on any tab',left.length===0,left.slice(0,8).join(' || '));
  await p.click('#lg');await p.waitForTimeout(150);
 });
 await safe('dup names',async()=>{const r=await p.evaluate(()=>{S.lang='en';const s=ST.find(x=>x.ko==='서울역');const h=infoHTML(s);const n=(h.match(/Seoul Station \(서울역\)/g)||[]).length;const tip=tipHTML(s,null).match(/Seoul Station/g)||[];const srch=(searchStations('서울역',1)[0]);return {n,tip:tip.length,groups:lineNameGroups(s).map(g=>g.ko+':'+g.gs.length)}});ok('station with the same name on several lines shows that name once (badges grouped)',r.n===1&&r.tip.length<=1||r.n===1&&r.tip===1,JSON.stringify(r))});
 // ---------- K. misc regression: favorites / console ----------
 await safe('favorites',async()=>{
  await p.evaluate(()=>{S.fav=[];tab('geo');select(ST.findIndex(s=>s.ko==='강남'),false);if(isMobile())setSheet('full')});await p.waitForTimeout(300);
  await p.click('#ifav');await tap('#more-btn');await p.waitForTimeout(120);
  const items=await p.evaluate(()=>[...document.querySelectorAll('#fav-list [data-fav]')].map(b=>b.innerText));
  ok('favorite saved and listed',items.length===1&&/강남|Gangnam/.test(items[0]),items.join('|'));
  await p.evaluate(()=>{if(isMobile())setSheet(null)});await p.click('#fav-list [data-fav]');await p.waitForTimeout(250);
  ok('favorite selects station from Geo map context',await p.evaluate(()=>S.sel.ko==='강남'&&document.querySelector('#more-menu').hidden));
 });
 ok('no console/page errors',t.errors.length===0,t.errors.join(' | '));
 await t.close();
}
(async()=>{for(const prof of ['desktop','iphone','iphone-land'])await suite(prof);
 const pass=results.filter(r=>r.pass).length,fail=results.length-pass;console.log(`\nRC2 TOTAL ${results.length}  PASS ${pass}  FAIL ${fail}`);
 fs.writeFileSync(path.join(ROOT,'TEST_RESULTS_RC2.json'),JSON.stringify({run:new Date().toISOString(),total:results.length,pass,fail,results},null,1));process.exit(fail?1:0)})();
