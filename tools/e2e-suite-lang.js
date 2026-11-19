// Length-filter + bilingual Geo-map suite. Run: node tools/e2e-suite-lang.js
const {open}=require('./e2e.js');const fs=require('fs'),path=require('path');
const results=[];
const mk=(prof)=>(name,pass,detail='')=>{results.push({prof,name,pass:!!pass,detail:String(detail).slice(0,220)});console.log((pass?'PASS ':'FAIL ')+`[${prof}] ${name}${detail?' — '+String(detail).slice(0,220):''}`)};
const ROOT=path.resolve(__dirname,'..');
async function suite(prof){
 const ok=mk(prof);const mobile=prof!=='desktop';
 const t=await open(prof);const p=t.page;
 const tap=sel=>mobile?p.tap(sel):p.click(sel);
 const at=async(x,y)=>mobile?p.touchscreen.tap(x,y):p.mouse.click(x,y);
 const safe=async(name,fn)=>{try{await fn()}catch(e){ok(name,false,'EXCEPTION '+e.message.split('\n')[0])}};
 const wait=ms=>p.waitForTimeout(ms);
 const tilesNow=()=>p.evaluate(()=>window.__LMAP.tileUrls().map(u=>u.includes('cartocdn')?'EN(carto)':u.includes('openstreetmap')?'KO(osm)':u));
 // ============ 1. character length filter ============
 await safe('length',async()=>{
  const ex=await p.evaluate(()=>({a:nameForLength('Isu(Chongshin Univ.)'),b:nameForLength('이수(총신대입구)'),c:nameForLength('총신대입구(이수)'),d:nameForLength('Seoul Station(서울역)'),e:nameForLength('Seoul Station (서울역)'),f:nameForLength('동대문역사문화공원(DDP)'),g:nameForLength('plain')}));
  ok('nameForLength("Isu(Chongshin Univ.)") → "Isu" (3)',ex.a==='Isu'&&ex.a.length===3,JSON.stringify(ex.a));
  ok('nameForLength("이수(총신대입구)") → "이수" (2)',ex.b==='이수'&&ex.b.length===2);
  ok('nameForLength("총신대입구(이수)") → "총신대입구" (5)',ex.c==='총신대입구'&&ex.c.length===5);
  ok('nameForLength("Seoul Station(서울역)") → "Seoul Station"',ex.d==='Seoul Station'&&ex.e==='Seoul Station');
  ok('names without parentheses are unchanged',ex.g==='plain'&&ex.f==='동대문역사문화공원');
  const c=await p.evaluate(()=>{const s=ST.find(x=>x.ko==='총신대입구');const o={};['ko','en'].forEach(m=>{S.lines.cl=m;o[m+'4']=cl(s,'4');o[m+'7']=cl(s,'7')});S.lines.cl='ko';return o});
  ok('cl(): L4 ko=5, L7 ko=2',c.ko4===5&&c.ko7===2,JSON.stringify(c));
  ok('cl(): L4 en "Chongshin Univ." / L7 en "Isu"(3)',c.en7===3&&c.en4===13,JSON.stringify(c));
  // every station, both modes, both names: equals independent computation with the spec regex
  const all=await p.evaluate(()=>{let bad=[],withParen=0;const f=n=>String(n).replace(/\s*\([^)]*\)/g,'');
   ST.forEach(s=>s.ln.forEach(g=>{const n=dnames(s,g);if(/\(/.test(n.ko+n.en))withParen++;
    S.lines.cl='ko';if(cl(s,g)!==f(n.ko).replace(/\s/g,'').length)bad.push(s.ko+':'+g+':ko');
    S.lines.cl='en';if(cl(s,g)!==f(n.en).replace(/[^A-Za-z0-9]/g,'').length)bad.push(s.ko+':'+g+':en')}));S.lines.cl='ko';return {bad:bad.slice(0,6),n:bad.length,withParen}});
  ok(`all stations × lines × both modes ignore parenthetical text (${all.withParen} names have parentheses)`,all.n===0,JSON.stringify(all.bad));
  // UI: filter by length, displayed name unchanged
  await p.evaluate(()=>{tab('lines');S.lines.g='4';S.lines.all=0;S.lines.cl='ko';S.lines.len='5';drawLines()});await wait(150);
  let rows=await p.evaluate(()=>[...document.querySelectorAll('#lst .row')].map(r=>r.innerText.replace(/\s+/g,' ')));
  ok('Lines tab, L4, 5-letter filter: 총신대입구 listed with its FULL displayed name',rows.some(r=>/총신대입구\(이수\)/.test(r)),rows.slice(0,3).join(' | '));
  ok('row shows the parenthesis-free count (5), not the full length (10)',rows.some(r=>/총신대입구\(이수\)/.test(r)&&/\b5\b/.test(r)&&!/\b10\b/.test(r)),rows.filter(r=>/총신대입구/.test(r)).join('|'));
  await p.evaluate(()=>{S.lines.len='2';S.lines.g='7';drawLines()});await wait(100);
  rows=await p.evaluate(()=>[...document.querySelectorAll('#lst .row')].map(r=>r.innerText.replace(/\s+/g,' ')));
  ok('Lines tab, L7, 2-letter filter: 이수(총신대입구) listed (counted as 2)',rows.some(r=>/이수\(총신대입구\)/.test(r)),rows.slice(0,4).join(' | '));
  await p.evaluate(()=>{S.lines.len='all';S.lines.cl='en';S.lines.g='7';drawLines()});await wait(100);
  const en=await p.evaluate(()=>{S.lines.len='3';drawLines();return [...document.querySelectorAll('#lst .row')].map(r=>r.innerText.replace(/\s+/g,' '))});
  ok('English letters mode: Isu(Chongshin Univ.) counted as "Isu" (3) and found with the 3-letter filter',en.some(r=>/Isu\(Chongshin Univ\.\)/.test(r)),en.slice(0,4).join(' | '));
  await p.evaluate(()=>{S.lines.len='all';S.lines.cl='ko';S.lines.g='1'});
 });
 // ============ 2. bilingual Geo map ============
 const setup=async()=>{await p.evaluate(()=>{window.__TILE_MODE={};for(const k in TILE_DOWN)delete TILE_DOWN[k]});};
 const snapshot=()=>p.evaluate(()=>{const m=window.__LMAP;const red=[...m.svg.querySelectorAll('polyline')].filter(q=>q.getAttribute('stroke')==='#e11d2e');
   return {sel:S.sel&&S.sel.i,lang:S.lang,c:m.c.slice(),z:m.z,sheet:document.body.dataset.sheet,route:S.route?S.route.join(','):null,red:red.map(q=>q.getAttribute('points')).join('|').length+':'+(red[0]?red[0].getAttribute('points').slice(0,60):''),pins:m.svg.querySelectorAll('g[data-pin]').length,markers:m.svg.querySelectorAll('circle[data-st]').length,tiles:m.tileUrls().length,ibScroll:Math.round(document.querySelector('#ib').scrollTop)}});
 await safe('tiles default',async()=>{
  await p.evaluate(()=>tab('geo'));await wait(200);
  ok('English mode starts on English-labelled tiles (single layer)',JSON.stringify(await tilesNow())==='["EN(carto)"]',JSON.stringify(await tilesNow()));
 });
 await safe('toggle with route + sheet',async()=>{
  await setup();
  await p.evaluate(()=>tab('route'));await p.fill('#ra','서울');await p.fill('#rb','강남');await p.click('#go');await wait(250);
  await p.click('[data-route-geo="0"]');await wait(600);
  // open a station sheet by tapping the origin station on the map
  const o=await p.evaluate(()=>{const m=window.__LMAP,r=m.el.getBoundingClientRect(),i=S.route[0],[x,y]=m._P([ST[i].lat,ST[i].lng]);return {x:r.left+x,y:r.top+y,i}});
  await at(o.x,o.y);await wait(500);
  if(mobile){await p.evaluate(()=>setSheet('half'));await wait(400)}
  // pan/zoom somewhere specific so a reset would be visible
  await p.evaluate(()=>{window.__LMAP.setView([37.52,127.0],13)});await wait(100);
  const before=await snapshot();
  ok('precondition: route visible, station selected, sheet open',before.route&&before.sel===o.i&&before.pins>=2&&(!mobile||before.sheet==='half'),JSON.stringify({sel:before.sel,sheet:before.sheet,pins:before.pins}));
  for(const [lang,tile,word] of [['ko','KO(osm)','환승'],['en','EN(carto)','Transfer'],['ko','KO(osm)','환승']]){
   await tap('#lg');await wait(500);
   const a=await snapshot();const tl=await tilesNow();
   ok(`→ ${lang}: station selection preserved`,a.sel===before.sel);
   ok(`→ ${lang}: map centre and zoom unchanged`,a.c[0]===before.c[0]&&a.c[1]===before.c[1]&&a.z===before.z,JSON.stringify({c:a.c,z:a.z}));
   ok(`→ ${lang}: route highlight unchanged (same path, same pins)`,a.red===before.red&&a.route===before.route&&a.pins===before.pins,`pins ${a.pins}/${before.pins}`);
   ok(`→ ${lang}: base tiles switched to ${tile} (single layer)`,tl.length===1&&tl[0]===tile,JSON.stringify(tl));
   ok(`→ ${lang}: all ${before.markers} station markers still present`,a.markers===before.markers,`${a.markers}`);
   if(mobile)ok(`→ ${lang}: sheet stays open in the same state`,a.sheet===before.sheet,a.sheet);
   const loc=await p.evaluate(()=>({sheet:document.querySelector('#ib').innerText,sum:document.querySelector('#route-sum').innerText,tip:tipHTML(ST[S.sel.i||S.sel],null)}));
   ok(`→ ${lang}: station sheet + route summary localized`,lang==='ko'?(/환승 가능|배차 간격/.test(loc.sheet)&&/출발|환승|도착|지우기|경로/.test(loc.sum)&&/서울역/.test(loc.sum)):(/Typical interval/.test(loc.sheet)&&/Seoul Station/.test(loc.sum)),loc.sum.replace(/\n/g,' | ').slice(0,80)+' || sheet: '+loc.sheet.replace(/\n/g,' | ').slice(0,100));
   // hit-testing after the tile switch: tap the DESTINATION station -> its sheet opens, route stays
   const d=await p.evaluate(()=>{const m=window.__LMAP,r=m.el.getBoundingClientRect(),i=S.route[S.route.length-1],[x,y]=m._P([ST[i].lat,ST[i].lng]);return {x:r.left+x,y:r.top+y,i,top:(e=>e&&e.tagName)(document.elementFromPoint(r.left+x,r.top+y))}});
   if(d.x>0&&d.y>56&&d.x<(await p.evaluate(()=>innerWidth))&&d.y<(await p.evaluate(()=>innerHeight))-(mobile?200:0)){
    if(mobile){await p.evaluate(()=>setSheet(null));await wait(450)}
    await at(d.x,d.y);await wait(450);
    const h=await p.evaluate(i=>({sel:S.sel&&S.sel.i,route:!!S.route&&[...window.__LMAP.svg.querySelectorAll('polyline')].some(q=>q.getAttribute('stroke')==='#e11d2e')}),d.i);
    ok(`→ ${lang}: tapping the destination after the switch selects it and keeps the route`,h.sel===d.i&&h.route,JSON.stringify(h)+' top='+d.top);
    // restore original selection/sheet for the next round
    await p.evaluate(i=>{select(i,false);if(isMobile())setSheet('half')},o.i);await wait(350);
    before.sel=o.i;
   } else ok(`→ ${lang}: destination hit-test (point off-screen at this zoom; skipped)`,true);
  }
 });
 await safe('sheet scroll',async()=>{
  await setup();
  await p.evaluate(()=>{S.route=null;S.routeMeta=null;tab('geo');select(ST.findIndex(s=>s.ko==='강남'),true);if(isMobile())setSheet('full')});await wait(400);
  await p.evaluate(()=>{document.querySelector('#ib').scrollTop=120});await wait(80);
  const a=await snapshot();await tap('#lg');await wait(450);const b=await snapshot();
  ok('language toggle keeps the open station sheet, its state and scroll position',b.sel===a.sel&&(!mobile||b.sheet===a.sheet)&&Math.abs(b.ibScroll-a.ibScroll)<=60,JSON.stringify({a:a.ibScroll,b:b.ibScroll,s:b.sheet}));
  await tap('#lg');await wait(300);
 });
 await safe('tile fallback ko',async()=>{
  await setup();if(await p.evaluate(()=>S.lang)==='ko'){await tap('#lg');await wait(400)}
  await p.evaluate(()=>{window.__TILE_MODE={ko:'fail'};tab('route')});await p.fill('#ra','홍대입구');await p.fill('#rb','잠실');await p.click('#go');await wait(250);await p.click('[data-route-geo="0"]');await wait(500);
  await p.evaluate(()=>{select(S.route[3],false)});await wait(200);
  const a=await snapshot();await tap('#lg');await wait(700);const b=await snapshot();const tl=await tilesNow();
  ok('Korean tiles unavailable → current (English) tiles preserved, single layer',tl.length===1&&tl[0]==='EN(carto)',JSON.stringify(tl));
  ok('…a localized notice explains it',await p.evaluate(()=>/한국어 지도 타일/.test(document.querySelector('#toast').innerText)),await p.evaluate(()=>document.querySelector('#toast').innerText));
  ok('…but language is Korean: info sheet, route summary and markers all localized',await p.evaluate(()=>S.lang==='ko'&&/환승|역 코드/.test(document.querySelector('#ib').innerText)&&/서울|홍대|잠실|경로/.test(document.querySelector('#route-sum').innerText)));
  ok('…selection, route, centre, zoom preserved',b.sel===a.sel&&b.route===a.route&&b.red===a.red&&b.c[0]===a.c[0]&&b.c[1]===a.c[1]&&b.z===a.z);
  const d=await p.evaluate(()=>{const m=window.__LMAP,r=m.el.getBoundingClientRect(),i=S.route[0],[x,y]=m._P([ST[i].lat,ST[i].lng]);return {x:r.left+x,y:r.top+y,i}});
  if(mobile){await p.evaluate(()=>setSheet(null));await wait(450)}
  await at(d.x,d.y);await wait(450);ok('hit-testing still works while tiles fell back',await p.evaluate(i=>S.sel&&S.sel.i===i,d.i));
  // retry later succeeds
  await p.evaluate(()=>{window.__TILE_MODE={};for(const k in TILE_DOWN)delete TILE_DOWN[k]});await tap('#lg');await wait(300);await tap('#lg');await wait(600);
  ok('after tiles recover, switching language swaps to Korean tiles again',JSON.stringify(await tilesNow())==='["KO(osm)"]',JSON.stringify(await tilesNow()));
  if(await p.evaluate(()=>S.lang)==='en'){await tap('#lg');await wait(300)}
 });
 await safe('tile fallback en',async()=>{
  await setup();
  if(await p.evaluate(()=>S.lang)!=='ko'){await tap('#lg');await wait(500)}
  await p.evaluate(()=>{window.__TILE_MODE={en:'fail'}});const a=await snapshot();await tap('#lg');await wait(700);const tl=await tilesNow();
  ok('English tiles unavailable → Korean (current) tiles preserved',tl.length===1&&tl[0]==='KO(osm)',JSON.stringify(tl));
  ok('…English notice shown, UI still English',await p.evaluate(()=>S.lang==='en'&&/English map tiles are unavailable/.test(document.querySelector('#toast').innerText)));
  await p.evaluate(()=>{window.__TILE_MODE={};for(const k in TILE_DOWN)delete TILE_DOWN[k]});
 });
 await safe('rapid toggle + theme',async()=>{
  await setup();for(let i=0;i<6;i++){await p.evaluate(()=>document.querySelector('#lg').click());await wait(60)}await wait(600);
  const r=await p.evaluate(()=>({lang:S.lang,n:window.__LMAP.tiles.length,url:window.__LMAP.tileUrls()[0]}));
  ok('six rapid toggles end with exactly one tile layer matching the language',r.n===1&&((r.lang==='ko')===r.url.includes('openstreetmap')),JSON.stringify(r));
  await p.evaluate(()=>document.querySelector('#more-btn').click());await wait(100);await p.evaluate(()=>document.querySelector('#th').click());await wait(500);
  const r2=await p.evaluate(()=>({lang:S.lang,n:window.__LMAP.tiles.length,url:window.__LMAP.tileUrls()[0]}));
  ok('theme toggle keeps one tile layer in the current language',r2.n===1&&((r2.lang==='ko')===r2.url.includes('openstreetmap')),JSON.stringify(r2));
  await p.evaluate(()=>{document.querySelector('#th').click();document.querySelector('#more-btn').click()});
 });
 ok('no console/page errors',t.errors.length===0,t.errors.join(' | '));
 await t.close();
}
(async()=>{for(const prof of ['desktop','iphone','iphone-land'])await suite(prof);
 const pass=results.filter(r=>r.pass).length,fail=results.length-pass;console.log(`\nLANG TOTAL ${results.length}  PASS ${pass}  FAIL ${fail}`);
 fs.writeFileSync(path.join(ROOT,'TEST_RESULTS_LANG.json'),JSON.stringify({run:new Date().toISOString(),total:results.length,pass,fail,results},null,1));process.exit(fail?1:0)})();
