// Full regression suite. Run: node tools/e2e-suite.js   (needs playwright + chromium; Leaflet is replaced by tools/leaflet-shim.js)
const {open}=require('./e2e.js');const fs=require('fs');
const results=[];
const mk=(prof)=>(name,pass,detail='')=>{results.push({prof,name,pass:!!pass,detail:String(detail).slice(0,160)});console.log((pass?'PASS ':'FAIL ')+`[${prof}] ${name}${detail?' — '+String(detail).slice(0,160):''}`)};
async function suite(prof){
 const ok=mk(prof);const mobile=prof!=='desktop';
 const t=await open(prof);const p=t.page;
 const tap=sel=>mobile?p.tap(sel):p.click(sel);
 const at=async(x,y)=>mobile?p.touchscreen.tap(x,y):p.mouse.click(x,y);
 const safe=async(name,fn)=>{try{await fn()}catch(e){ok(name,false,'EXCEPTION '+e.message.split('\n')[0])}};
 const W=await p.evaluate(()=>innerWidth),H=await p.evaluate(()=>innerHeight);
 // ---------- header / menu / language ----------
 await safe('header',async()=>{
  const h=await p.evaluate(()=>{const he=document.querySelector('header');const vis=id=>{const q=document.getElementById(id).getBoundingClientRect();return q.width>0&&q.left>=0&&q.right<=innerWidth+.5};return {h:he.getBoundingClientRect().height,sw:he.scrollWidth,cw:he.clientWidth,lg:vis('lg'),more:vis('more-btn'),sr:getComputedStyle(document.getElementById('mobile-search')).display!=='none'?vis('mobile-search'):vis('q')}});
  ok('EN/한 visible',h.lg);ok('⋯ visible',h.more);ok('search control visible',h.sr);ok('header single row, no overflow/wrap',h.sw<=h.cw&&h.h<=60,JSON.stringify(h));
  const b=await p.evaluate(()=>({h:document.querySelector('header').getBoundingClientRect().height,m:document.querySelector('#main').getBoundingClientRect().top}));
  await tap('#more-btn');await p.waitForTimeout(150);
  const a=await p.evaluate(()=>({h:document.querySelector('header').getBoundingClientRect().height,m:document.querySelector('#main').getBoundingClientRect().top,open:!document.querySelector('#more-menu').hidden,pos:getComputedStyle(document.querySelector('#more-menu')).position}));
  ok('⋯ opens as floating popup',a.open&&a.pos==='fixed');ok('⋯ no layout shift',a.h===b.h&&a.m===b.m);
  await p.keyboard.press('Escape');await p.waitForTimeout(80);ok('Esc closes ⋯',await p.evaluate(()=>document.querySelector('#more-menu').hidden));
  await tap('#more-btn');await p.waitForTimeout(80);await at(W/2,H-60);await p.waitForTimeout(120);ok('outside click closes ⋯',await p.evaluate(()=>document.querySelector('#more-menu').hidden));
  await tap('#lg');await p.waitForTimeout(150);const ko=await p.evaluate(()=>S.lang);await p.evaluate(()=>tab('lines'));await p.waitForTimeout(100);await p.evaluate(()=>tab('geo'));await tap('#lg');await p.waitForTimeout(100);
  ok('EN/한 toggles and survives tab changes',ko==='ko'&&await p.evaluate(()=>S.lang)==='en');
 });
 // ---------- route + show on map (geo) ----------
 await safe('routes',async()=>{
  for(const [a,b] of [['서울','강남'],['홍대입구','잠실'],['서울','인천공항']]){
   await p.evaluate(()=>tab('route'));await p.fill('#ra',a);await p.fill('#rb',b);await p.click('#go');await p.waitForTimeout(250);
   const btn=await p.$('[data-route-geo="0"]');if(!btn){ok(`route ${a}→${b}`,false,'no result button');continue}
   await btn.scrollIntoViewIfNeeded();await btn.click();await p.waitForTimeout(500);
   const r=await p.evaluate(()=>{const svg=document.querySelector('#map svg'),m=window.__LMAP;const pl=[...svg.querySelectorAll('polyline')];const red=pl.find(q=>q.getAttribute('stroke')==='#e11d2e');const base=pl.filter(q=>!['#e11d2e','#ffffff','#0f172a'].includes(q.getAttribute('stroke')));
    const R=red?red.getAttribute('points').split(' ').map(s=>s.split(',').map(Number)):[];
    // every highlighted vertex must lie on a drawn base-network polyline (route follows displayed geometry)
    const segs=[];base.forEach(q=>{const P=q.getAttribute('points').split(' ').map(s=>s.split(',').map(Number));for(let i=1;i<P.length;i++)segs.push([P[i-1],P[i]])});
    const dist=(p,[a,b])=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy;let t=l?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l:0;t=Math.max(0,Math.min(1,t));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)};
    const off=R.filter(p=>Math.min(...segs.map(s=>dist(p,s)))>2).length;
    const xs=R.map(p=>p[0]),ys=R.map(p=>p[1]);const pins=[...svg.querySelectorAll('g[data-pin]')].length;
    return {tab:S.tab,hasRoute:R.length>1,vertsOffBase:off,verts:R.length,pins,inView:R.length>0&&Math.min(...xs)>=0&&Math.max(...xs)<=m.el.clientWidth&&Math.min(...ys)>=0&&Math.max(...ys)<=m.el.clientHeight,transfers:S.routeMeta.transfers.length}});
   ok(`${a}→${b}: opens Geo map with highlighted route`,r.tab==='geo'&&r.hasRoute);
   ok(`${a}→${b}: highlight follows displayed network`,r.vertsOffBase===0,`${r.vertsOffBase}/${r.verts} vertices off base`);
   ok(`${a}→${b}: fitBounds keeps route in view`,r.inView);
   ok(`${a}→${b}: A, B${r.transfers?' + '+r.transfers+' transfer':''} pins`,r.pins===2+r.transfers,'pins='+r.pins);
   await p.screenshot({path:`/tmp/rc1-geo-${prof}-${a}-${b}.png`});
   // survives tab changes
   await p.evaluate(()=>tab('sch'));await p.waitForTimeout(150);await p.evaluate(()=>tab('geo'));await p.waitForTimeout(400);
   ok(`${a}→${b}: route still highlighted after tab switch`,await p.evaluate(()=>[...document.querySelectorAll('#map svg polyline')].some(q=>q.getAttribute('stroke')==='#e11d2e')));
   await p.evaluate(()=>tab('route'));await p.waitForTimeout(100);
  }
 });
 // ---------- pickers ----------
 const pick=async(btn,mode,label)=>{
  await p.evaluate(()=>{tab('route');S.pickTarget&&finishMapPick&&0});await p.fill(btn==='#pick-a-btn'?'#ra':'#rb','');
  await tap(btn);await p.click(`.pk-mode[data-mode=${mode}]`);await p.waitForTimeout(500);
  const target=await p.evaluate(()=>S.pickTarget);
  ok(`${label}: pick mode active with banner on ${mode==='sch'?'Schematic':'Geo map'}`,await p.evaluate(m=>S.tab===m&&!document.querySelector('#pick-banner').hidden,mode==='sch'?'sch':'geo'));
  const pt=await p.evaluate(m=>{const sel=m==='sch'?'#sch-hits > g circle:nth-child(2)':'#map svg circle[data-st]';const els=[...document.querySelectorAll(sel)];const ban=document.querySelector('#pick-banner').getBoundingClientRect();
   for(const e of els){const r=e.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;if(x<30||x>innerWidth-30||y<Math.min(200,innerHeight*.3)||y>innerHeight-Math.min(220,innerHeight*.3))continue;if(y<ban.bottom+10&&x>ban.left-10&&x<ban.right+10)continue;const top=document.elementFromPoint(x,y);if(top&&(top===e||(top.closest&&top.closest('[data-i]')&&m==='sch')||m==='geo'&&top.tagName==='circle'))return {x,y}}return null},mode);
  if(!pt){ok(`${label}: found a tappable station`,false);return}
  await at(pt.x,pt.y);await p.waitForTimeout(500);
  const f=await p.evaluate(id=>({tab:S.tab,banner:!document.querySelector('#pick-banner').hidden,val:document.querySelector(id).value,target:S.pickTarget}),btn==='#pick-a-btn'?'#ra':'#rb');
  ok(`${label}: field populated`,f.val.length>0,JSON.stringify(f)+' pt='+JSON.stringify(pt));ok(`${label}: banner closed + pickTarget cleared`,!f.banner&&f.target===null);ok(`${label}: Route tab opened`,f.tab==='route');
 };
 await safe('pick sch A',()=>pick('#pick-a-btn','sch','Schematic picker → origin'));
 await safe('pick sch B',()=>pick('#pick-b-btn','sch','Schematic picker → destination'));
 await safe('pick geo A',()=>pick('#pick-a-btn','geo','Geo picker → origin'));
 await safe('pick geo B',()=>pick('#pick-b-btn','geo','Geo picker → destination'));
 await safe('pick other',async()=>{
  await p.evaluate(()=>tab('route'));await tap('#pick-a-btn');await p.fill('#pk-q','Gangnam');await p.waitForTimeout(150);await p.click('#pk-list .pk-row');await p.waitForTimeout(150);
  ok('search picker fills origin & closes',await p.inputValue('#ra')==='강남'&&await p.evaluate(()=>document.querySelector('#picker-modal').hidden));
  await tap('#pick-b-btn');await p.click('.pk-mode[data-mode=line]');await p.click('#pk-line-chips [data-g="2"]');await p.waitForTimeout(150);await p.click('#pk-list .pk-row:nth-child(5)');await p.waitForTimeout(200);
  ok('line picker fills destination & closes',(await p.inputValue('#rb')).length>0&&await p.evaluate(()=>document.querySelector('#picker-modal').hidden));
  await tap('#pick-a-btn');await p.click('.pk-mode[data-mode=sch]');await p.waitForTimeout(200);await tap('#pick-cancel');await p.waitForTimeout(100);
  ok('cancel pick clears state',await p.evaluate(()=>document.querySelector('#pick-banner').hidden&&S.pickTarget===null));
 });
 // ---------- coverage ----------
 await safe('coverage',async()=>{
  await p.evaluate(()=>tab('sch'));await p.waitForTimeout(150);await tap('#cov-btn');await p.waitForTimeout(200);
  const A=await p.evaluate(()=>({t:SVG_MATCH_AUDIT.total,v:SVG_MATCH_AUDIT.verified,a:SVG_MATCH_AUDIT.approximate,u:SVG_MATCH_AUDIT.unmatched}));
  const txt=await p.innerText('#cov-body');ok(`coverage counts shown (${A.t}/${A.v}/${A.a}/${A.u})`,[A.t,A.v,A.a,A.u].every(n=>txt.includes(String(n))));
  ok(`unmatched list has ${A.u} rows`,await p.evaluate(()=>document.querySelectorAll('#cov-body [data-cov]').length)===A.u);
  const [dl]=await Promise.all([p.waitForEvent('download',{timeout:4000}).catch(()=>null),p.click('#cov-csv')]);
  let csv=await p.evaluate(()=>window.__lastCoverageCSV||'');if(dl){const f=await dl.path();if(f)csv=fs.readFileSync(f,'utf8')}
  ok(`CSV export downloads with ${A.t} rows`,!!dl&&csv.split('\n').filter(x=>x.trim()).length===A.t+1,`download=${!!dl} lines=${csv.split('\n').length}`);
  ok('CSV marks every station verified / ESTIMATED / UNMATCHED',(csv.match(/UNMATCHED/g)||[]).length===A.u&&(csv.match(/ESTIMATED/g)||[]).length>=A.a);
  await p.click('#cov-body [data-cov]');await p.waitForTimeout(400);
  ok('tap unmatched → Geo map + station selected',await p.evaluate(()=>S.tab==='geo'&&!!S.sel&&document.querySelector('#cov-modal').hidden));
  ok('station details show "no position" warning',/No position on the schematic/.test(await p.innerText('#ib')));
 });
 // ---------- bottom sheet (mobile) / dock (desktop) ----------
 if(mobile){await safe('sheet',async()=>{
  await p.evaluate(()=>{tab('sch');setSheet(null)});await p.waitForTimeout(300);
  const pt=await p.evaluate(()=>{for(const g of document.querySelectorAll('#sch-hits > g')){const c=g.querySelector('circle');const r=c.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;if(x>30&&x<innerWidth-30&&y>Math.min(250,innerHeight*.3)&&y<innerHeight-Math.min(250,innerHeight*.3)){const t=document.elementFromPoint(x,y);if(t&&t.closest('[data-i]'))return {x,y}}}});
  await p.touchscreen.tap(pt.x,pt.y);await p.waitForTimeout(500);
  const st=()=>p.evaluate(()=>{const e=document.querySelector('#info'),q=e.getBoundingClientRect(),b=document.querySelector('#ib');return {s:document.body.dataset.sheet,top:Math.round(q.top),bottom:Math.round(q.bottom),h:Math.round(q.height),sc:b.scrollTop,scrollable:b.scrollHeight>b.clientHeight}});
  let s=await st();ok('tap station → peek at bottom',s.s==='peek'&&Math.abs(s.bottom-H)<2&&s.h<260,JSON.stringify(s));
  const cdp=await p.context().newCDPSession(p);
  const drag=async(x,y0,y1,steps=12,ms=40)=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:y0}]});for(let i=1;i<=steps;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y0+(y1-y0)*i/steps}]});await p.waitForTimeout(ms)}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(500)};
  const hy=async()=>p.evaluate(()=>{const q=document.querySelector('#sheet-h').getBoundingClientRect();return q.top+q.height/2});
  await drag(120,await hy(),(await hy())-Math.round(H*.2));s=await st();ok('swipe up → half',s.s==='half',JSON.stringify(s));
  await drag(120,await hy(),(await hy())-Math.round(H*.4));s=await st();ok('swipe up again → full',s.s==='full',JSON.stringify(s));
  ok('full sheet content scrollable',s.scrollable);
  await drag(200,Math.round(H*.8),Math.round(H*.3),10,20);const s2=await st();ok('content scrolls in full',s2.sc>0&&s2.s==='full',`scrollTop=${s2.sc}`);
  await p.evaluate(()=>{document.querySelector('#ib').scrollTop=0});
  await drag(120,await hy(),(await hy())+Math.round(H*.3));s=await st();ok('swipe down collapses',s.s==='half'||s.s==='peek',s.s);
  await p.evaluate(()=>setSheet('full'));await p.waitForTimeout(400);
  for(const tb of ['route','guide','off']){
   await p.evaluate(t=>tab(t),tb);await p.waitForTimeout(350);
   const r=await p.evaluate(t=>({sheet:document.body.dataset.sheet,vis:getComputedStyle(document.querySelector('#info')).visibility}),tb);
   ok(`${tb} tab not blocked by sheet`,r.sheet==='hidden'||r.vis==='hidden',JSON.stringify(r));
   await p.evaluate(()=>{select(ST.findIndex(s=>s.ko==='강남'),false);setSheet('full')});await p.waitForTimeout(300);
  }
  await p.evaluate(()=>tab('sch'));await p.waitForTimeout(250);await p.evaluate(()=>setSheet('peek'));await p.waitForTimeout(300);
  await tap('#sheet-x');await p.waitForTimeout(400);ok('✕ closes sheet',await p.evaluate(()=>document.body.dataset.sheet)==='hidden');
 })}else{await safe('dock',async()=>{
  await p.evaluate(()=>{tab('sch');select(ST.findIndex(s=>s.ko==='강남'),false)});await p.waitForTimeout(300);
  ok('desktop: info panel docked right, visible',await p.evaluate(()=>{const q=document.querySelector('#info').getBoundingClientRect();return q.right>=innerWidth-1&&q.width>=380&&getComputedStyle(document.querySelector('#info')).visibility==='visible'}));
 })}
 // ---------- schematic + geo interaction ----------
 await safe('sch interaction',async()=>{
  await p.evaluate(()=>{tab('sch')});await p.waitForTimeout(150);
  const v0=await p.evaluate(()=>VB[2]);await tap('#zi');await p.waitForTimeout(100);ok('schematic zoom in',await p.evaluate(()=>VB[2])<v0);
  await tap('#sch-lang');await p.waitForTimeout(150);ok('SVG language toggle works',await p.evaluate(()=>/한국어/.test(document.querySelector('#sch-lang').textContent)));
  await tap('#sch-lang');await tap('#hubs');ok('hubs-only toggle',await p.evaluate(()=>!!S.hubs));await tap('#hubs');
  await tap('#fit');await p.waitForTimeout(100);ok('fit resets view',await p.evaluate(()=>VB[2])===5724);
  await p.evaluate(()=>tab('geo'));await p.waitForTimeout(300);await p.selectOption('#gl','2');await p.waitForTimeout(200);
  const n=await p.evaluate(()=>document.querySelectorAll('#map svg circle[data-st]').length);ok('geo line filter',n>40&&n<80,'markers='+n);await p.selectOption('#gl','*');
 });
 // favorites
 await safe('favorites',async()=>{
  await p.evaluate(()=>{tab('sch');S.fav=[];select(ST.findIndex(s=>s.ko==='강남'),false);if(document.body.dataset.sheet!=='hidden')setSheet&&setSheet('full')});await p.waitForTimeout(300);
  await p.click('#ifav');await tap('#more-btn');await p.waitForTimeout(120);
  const items=await p.evaluate(()=>[...document.querySelectorAll('#fav-list [data-fav]')].map(b=>b.innerText));ok('favorite saved and listed in ⋯ menu',items.length===1&&/강남/.test(items[0]),items.join('|'));
  await p.evaluate(()=>{if(document.body.dataset.sheet!=='hidden')setSheet(null)});await p.click('#fav-list [data-fav]');await p.waitForTimeout(250);
  ok('favorite tap selects station + closes menu',await p.evaluate(()=>S.sel.ko==='강남'&&document.querySelector('#more-menu').hidden));
 });
 ok('no console/page errors',t.errors.length===0,t.errors.join(' | '));
 await t.close();
}
(async()=>{for(const prof of ['desktop','iphone','iphone-land'])await suite(prof);
 const pass=results.filter(r=>r.pass).length,fail=results.length-pass;console.log(`\nTOTAL ${results.length}  PASS ${pass}  FAIL ${fail}`);
 fs.writeFileSync(__dirname+'/../TEST_RESULTS.json',JSON.stringify({run:new Date().toISOString(),total:results.length,pass,fail,results},null,1));process.exit(fail?1:0)})();
