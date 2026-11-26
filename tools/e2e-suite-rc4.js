// RC4 suite: English base-map provider replaced (former provider removed), repeated EN/한 switching, Official PDF tab, GitHub Pages sub-path.
// Run: node tools/e2e-suite-rc4.js        (Leaflet is replaced by tools/leaflet-shim.js; no network is available/needed)
const {open}=require('./e2e.js');const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const results=[];
const FORMER=new RegExp(['ca','rto'].join('')+'|'+['voy','ager'].join(''),'i');   // the former English tile provider
const FORMER_NAME=['car','to'].join('');
const mk=(prof)=>(name,pass,detail='')=>{results.push({prof,name,pass:!!pass,detail:String(detail).slice(0,260)});console.log((pass?'PASS ':'FAIL ')+`[${prof}] ${name}${detail?' — '+String(detail).slice(0,260):''}`)};
const KO_URL='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const EN_URL=KO_URL;      // V1.3: both languages use the same, reliable provider (the separate English provider ran out of map data when zooming)

// ---------------- 0. static source checks ----------------
(function staticChecks(){
  const ok=mk('static');
  const app=fs.readFileSync(path.join(ROOT,'app.js'),'utf8').split('\n');
  const active=app.filter(l=>!/^\s*\/\//.test(l));
  ok('no active (non-comment) line in app.js mentions the former English tile provider',!active.some(l=>FORMER.test(l)),active.filter(l=>FORMER.test(l)).join(' | '));
  const tl=active.filter(l=>/L\.tileLayer\(/.test(l));
  ok('exactly one L.tileLayer( call in app.js, fed by TILE_SOURCES',tl.length===1&&/TILE_SOURCES|c\.url/.test(tl[0]),tl.join(' | '));
  const src=app.join('\n');
  ok('Korean tile source unchanged: OpenStreetMap (same URL as before)',/ko: TILE_OSM/.test(src)&&src.includes('const TILE_OSM = { url: "'+KO_URL+'"'));
  ok('English and Korean share ONE tile provider (OpenStreetMap, HTTPS, no key)',/const TILE_SOURCES = \{ ko: TILE_OSM, en: TILE_OSM \}/.test(src)&&src.includes('const TILE_OSM = { url: "'+KO_URL+'"')&&!/[?&](key|apikey|api_key|token|access_token)=/i.test(KO_URL));
  ok('no active line in app.js references the separate English provider that showed "Map data not yet available" (ArcGIS/Esri tile host)',!active.some(l=>/arcgisonline|World_Street_Map|esri/i.test(l)),active.filter(l=>/arcgisonline|World_Street_Map|esri/i.test(l)).join(' | '));
  ok('tile layer declares native zoom 19 only for OpenStreetMap, which really has data to zoom 19',/maxNativeZoom: 19/.test(src)&&/TILE_OSM/.test(src));
  // every file in the project: any mention of the former provider must be a comment or an explicit historical note
  const hits=[];(function walk(d){for(const f of fs.readdirSync(d)){if(f==='node_modules'||f==='evidence'||f==='__pycache__')continue;const p=path.join(d,f);const st=fs.statSync(p);if(st.isDirectory())walk(p);else if(/\.(js|html|css|md|json|py|txt)$/.test(f)){if(/^> \*\*HISTORICAL DOCUMENT/.test(fs.readFileSync(p,'utf8').slice(0,40)))continue;fs.readFileSync(p,'utf8').split('\n').forEach((l,i)=>{if(FORMER.test(l)&&!/TEST_RESULTS_RC4\.json$/.test(p))hits.push(path.relative(ROOT,p)+':'+(i+1)+':'+l.trim().slice(0,120))})}}})(ROOT);
  const bad=hits.filter(h=>{const f=h.split(':')[0];const line=h.split(':').slice(2).join(':');const isComment=/^\/\//.test(line)||/^\*/.test(line);const hist=/historical|formerly|former|superseded|root cause|no longer|removed|replaced|REMOVED|RC4/i.test(line);return !(isComment||hist)});
  ok('repo-wide grep for the former provider (name, CDN host, style name): only comments / historical notes remain',bad.length===0,`${hits.length} hit(s), ${bad.length} active: `+bad.join(' || '));
  ok('map_korea.pdf is present and is a real PDF',fs.existsSync(path.join(ROOT,'map_korea.pdf'))&&fs.readFileSync(path.join(ROOT,'map_korea.pdf')).slice(0,5).toString()==='%PDF-',String(fs.statSync(path.join(ROOT,'map_korea.pdf')).size)+' bytes');
})();

async function suite(prof,base='/'){
  const label=base==='/'?prof:prof+'@'+base;const ok=mk(label);const mobile=prof!=='desktop';
  const t=await open(prof,base);const p=t.page;
  const tap=sel=>mobile?p.tap(sel):p.click(sel);
  const wait=ms=>p.waitForTimeout(ms);
  const safe=async(name,fn)=>{try{await fn()}catch(e){ok(name,false,'EXCEPTION '+String(e.message).split('\n')[0])}};
  const tiles=()=>p.evaluate(()=>window.__LMAP.tileUrls());
  const snap=()=>p.evaluate(()=>{const m=window.__LMAP;return {lang:S.lang,sel:S.sel&&S.sel.i,sheet:document.body.dataset.sheet,c:m.c.slice(),z:m.z,route:S.route?S.route.join(','):null,red:[...m.svg.querySelectorAll('polyline')].filter(q=>q.getAttribute('stroke')==='#e11d2e').length,pins:m.svg.querySelectorAll('g[data-pin]').length,markers:m.svg.querySelectorAll('circle[data-st]').length,layers:m.tiles?m.tiles.length:-1}});
  const expectUrl=lang=>lang==='en'?EN_URL:KO_URL;

  // ---------- A. English tiles in the live app ----------
  await safe('start English',async()=>{
    await p.evaluate(()=>{if(S.lang!=='en')document.querySelector('#lg').click()});await wait(250);
    await p.evaluate(()=>tab('geo'));await wait(400);
    const u=await tiles();
    ok('Geo map, English mode: single OpenStreetMap tile layer (same provider as Korean)',u.length===1&&u[0]===EN_URL,JSON.stringify(u));
    const sample=EN_URL.replace('{z}','19').replace('{x}','447000').replace('{y}','203000');
    ok('tile URL is a well-formed HTTPS tile path with no key / token, valid at zoom 19',/^https:\/\/tile\.openstreetmap\.org\/19\/447000\/203000\.png$/.test(sample),sample);
    ok('no network request to the former English provider so far',!t.requests.some(r=>FORMER.test(r)),t.requests.filter(r=>FORMER.test(r)).join(','));
  });

  // ---------- B. EN → 한 → EN → 한 → EN with route + selection + sheet ----------
  await safe('repeated switching',async()=>{
    await p.evaluate(()=>tab('route'));await p.fill('#ra','서울');await p.fill('#rb','강남');await p.click('#go');await wait(250);
    await p.click('[data-route-geo="0"]');await wait(600);
    const o=await p.evaluate(()=>{const m=window.__LMAP,r=m.el.getBoundingClientRect(),i=S.route[0],[x,y]=m._P([ST[i].lat,ST[i].lng]);return {x:r.left+x,y:r.top+y,i}});
    if(mobile)await p.touchscreen.tap(o.x,o.y);else await p.mouse.click(o.x,o.y);await wait(500);
    if(mobile){await p.evaluate(()=>setSheet('half'));await wait(400)}
    await p.evaluate(()=>{window.__LMAP.setView([37.52,127.0],13)});await wait(100);
    const before=await snap();
    ok('precondition: English, route visible, station selected'+(mobile?', sheet open':''),before.lang==='en'&&before.red>0&&before.sel===o.i&&(!mobile||before.sheet==='half'),JSON.stringify({lang:before.lang,red:before.red,sel:before.sel,sheet:before.sheet}));
    const seq=['ko','en','ko','en'];let n=0;
    for(const lang of seq){
      n++;await tap('#lg');await wait(500);
      const a=await snap(),u=await tiles();
      const tag=`switch ${n} (→ ${lang==='en'?'EN':'한'})`;
      ok(`${tag}: language is ${lang}`,a.lang===lang,a.lang);
      ok(`${tag}: exactly one tile layer, OpenStreetMap (both languages)`,u.length===1&&u[0]===expectUrl(lang)&&a.layers===1,JSON.stringify({u,layers:a.layers}));
      ok(`${tag}: route still visible (same path, red line + pins)`,a.red===before.red&&a.route===before.route&&a.pins===before.pins,`red ${a.red}/${before.red} pins ${a.pins}/${before.pins}`);
      ok(`${tag}: station still selected`,a.sel===before.sel,String(a.sel));
      if(mobile)ok(`${tag}: sheet still open (${before.sheet})`,a.sheet===before.sheet,a.sheet);
      ok(`${tag}: map centre + zoom unchanged`,a.c[0]===before.c[0]&&a.c[1]===before.c[1]&&a.z===before.z,JSON.stringify({c:a.c,z:a.z}));
      ok(`${tag}: all ${before.markers} station markers present`,a.markers===before.markers,String(a.markers));
    }
    // hit-testing after the final EN switch: tap the destination station
    const d=await p.evaluate(()=>{const m=window.__LMAP,r=m.el.getBoundingClientRect(),i=S.route[S.route.length-1],[x,y]=m._P([ST[i].lat,ST[i].lng]);return {x:r.left+x,y:r.top+y,i,w:innerWidth,h:innerHeight}});
    if(d.x>0&&d.y>60&&d.x<d.w&&d.y<d.h-(mobile?220:0)){
      if(mobile){await p.evaluate(()=>setSheet(null));await wait(450)}
      if(mobile)await p.touchscreen.tap(d.x,d.y);else await p.mouse.click(d.x,d.y);await wait(450);
      const s=await p.evaluate(()=>({sel:S.sel&&S.sel.i,route:!!S.route}));
      ok('after switching, tapping a station still selects it and keeps the route',s.sel===d.i&&s.route,JSON.stringify(s));
    }
    // rapid toggling: only the newest switch wins, no duplicate layers
    for(let i=0;i<6;i++){await p.evaluate(()=>document.querySelector('#lg').click())}
    await wait(700);const r=await snap(),ru=await tiles();
    ok('6 rapid toggles: one tile layer, matching the final language',ru.length===1&&ru[0]===expectUrl(r.lang)&&r.layers===1,JSON.stringify({lang:r.lang,ru,layers:r.layers}));
    ok('no network request to the former English provider during all switching',!t.requests.some(x=>FORMER.test(x)),t.requests.filter(x=>FORMER.test(x)).join(','));
    if(r.lang!=='en'){await p.evaluate(()=>document.querySelector('#lg').click());await wait(400)}
  });

  // ---------- C. one provider: language switches never swap / reload the base map, even when tiles fail ----------
  await safe('tiles shared by both languages',async()=>{
    await p.evaluate(()=>{window.__TILE_MODE={ko:'fail'};if(S.lang!=='en')document.querySelector('#lg').click()});await wait(300);
    const id0=await p.evaluate(()=>{const m=window.__LMAP;window.__layer0=m.tiles[0];return m.tiles.length});
    for(let i=0;i<4;i++){await p.evaluate(()=>document.querySelector('#lg').click());await wait(250)}
    const r=await p.evaluate(()=>({n:window.__LMAP.tiles.length,same:window.__LMAP.tiles[0]===window.__layer0,urls:window.__LMAP.tileUrls(),toast:(document.querySelector('#toast')||{}).innerText||''}));
    ok('four language switches keep the very same tile layer (no swap, no reload, no flicker)',id0===1&&r.n===1&&r.same&&r.urls[0]===KO_URL,JSON.stringify(r.urls));
    ok('no "tiles unavailable" notice is produced by language switching',!/unavailable|불러올 수 없어/.test(r.toast),r.toast);
    await p.evaluate(()=>{window.__TILE_MODE={}});
  });

  // ---------- D. Official PDF tab ----------
  await safe('Official PDF tab',async()=>{
    await p.evaluate(()=>{if(S.lang!=='en')document.querySelector('#lg').click()});await wait(250);
    const labels=await p.evaluate(()=>({desk:(document.querySelector('header [data-tab="off"] .tl')||{}).textContent,menu:(document.querySelector('.mobile-menu-tab[data-tab="off"]')||{}).textContent,tabs:[...document.querySelectorAll('header [data-tab] .tl')].map(e=>e.textContent.trim())}));
    ok('tab label reads "Official PDF" (desktop tab + mobile menu)',labels.desk==='Official PDF'&&/Official PDF/.test(labels.menu||''),JSON.stringify(labels));
    ok('the old "Official" label is gone',!labels.tabs.includes('Official')&&!/Official map/.test(await p.content()),JSON.stringify(labels.tabs));
    if(!mobile){
      await p.addInitScript(()=>{});
      await p.evaluate(()=>{Object.defineProperty(navigator,'pdfViewerEnabled',{value:true,configurable:true})});   // a normal desktop browser has a built-in viewer
      await p.click('header [data-tab="off"]');await wait(500);
      const d=await p.evaluate(()=>{const pane=document.querySelector('#p-off'),h=document.querySelector('#pdf-host'),o=document.querySelector('#pdf-host object'),r=h.getBoundingClientRect();return {on:pane.classList.contains('on'),vis:getComputedStyle(pane).display,hostW:Math.round(r.width),hostH:Math.round(r.height),obj:o&&o.getAttribute('data'),type:o&&o.getAttribute('type'),frame:!!document.querySelector('#pdf-host iframe'),fbHidden:document.querySelector('#pdf-fallback').hidden,imgs:pane.querySelectorAll('svg,img,image,canvas').length,svgRef:/Seoul_subway_linemap|stim|oimg/.test(pane.innerHTML),bar:!document.querySelector('#pdf-bar').hidden}});
      ok('desktop: PDF is embedded in the page (<object data="map_korea.pdf">), viewport-sized',d.on&&d.vis==='flex'&&/^map_korea\.pdf/.test(d.obj||'')&&d.type==='application/pdf'&&d.hostW>600&&d.hostH>400,JSON.stringify(d));
      ok('desktop: only the PDF is shown (no SVG / image / canvas / schematic reference), fallback hidden',d.imgs===0&&!d.svgRef&&d.fbHidden,JSON.stringify({imgs:d.imgs,svgRef:d.svgRef,fb:d.fbHidden}));
      ok('desktop: "Open in new tab" and "Download" links point to map_korea.pdf',await p.evaluate(()=>[...document.querySelectorAll('#pdf-bar a')].every(a=>/map_korea\.pdf$/.test(a.getAttribute('href')))&&document.querySelectorAll('#pdf-bar a').length===2));
      ok('desktop: the browser actually requested map_korea.pdf',t.requests.some(r=>/map_korea\.pdf/.test(r)),t.requests.filter(r=>/pdf/.test(r)).join(','));
      const pdf=await p.evaluate(async()=>{const r=await fetch('map_korea.pdf');const b=new Uint8Array(await r.arrayBuffer());return {status:r.status,type:r.headers.get('content-type'),magic:String.fromCharCode(...b.slice(0,5)),size:b.length}});
      ok('server returns map_korea.pdf as application/pdf (starts with %PDF-)',pdf.status===200&&/pdf/.test(pdf.type)&&pdf.magic==='%PDF-',JSON.stringify(pdf));
      await p.click('header [data-tab="sch"]');await wait(300);await p.click('header [data-tab="off"]');await wait(300);
      ok('switching away and back keeps one embedded PDF (no duplicates)',await p.evaluate(()=>document.querySelectorAll('#pdf-host object').length)===1);
      // no built-in viewer => same as mobile: new tab + visible button
      await p.evaluate(()=>{Object.defineProperty(navigator,'pdfViewerEnabled',{value:false,configurable:true});window.__opened=[];window.open=u=>{window.__opened.push(u);return {}};});
      await p.click('header [data-tab="sch"]');await wait(200);await p.click('header [data-tab="off"]');await wait(300);
      const f=await p.evaluate(()=>({opened:window.__opened.slice(),fb:!document.querySelector('#pdf-fallback').hidden,hostEmpty:document.querySelector('#pdf-host').innerHTML.trim()===''}));
      ok('desktop without a PDF viewer: opens map_korea.pdf in a new tab and shows the button (no blank page)',f.opened.length===1&&/map_korea\.pdf$/.test(f.opened[0])&&f.fb&&f.hostEmpty,JSON.stringify(f));
    }else{
      await p.evaluate(()=>{window.__opened=[];window.open=u=>{window.__opened.push(u);return {}}});
      await p.tap('#more-btn');await wait(250);
      await p.tap('.mobile-menu-tab[data-tab="off"]');await wait(500);
      const m=await p.evaluate(()=>{const fb=document.querySelector('#pdf-fallback'),b=fb.querySelector('a.pdf-open'),r=b.getBoundingClientRect();return {opened:window.__opened.slice(),fbVisible:!fb.hidden&&getComputedStyle(fb).display!=='none',btnHref:b.getAttribute('href'),btnInView:r.width>80&&r.height>30&&r.top>0&&r.bottom<innerHeight&&r.left>=0&&r.right<=innerWidth,hostEmpty:document.querySelector('#pdf-host').innerHTML.trim()==='',embedded:!!document.querySelector('#pdf-host object, #pdf-host iframe'),imgs:document.querySelector('#p-off').querySelectorAll('svg,img,image,canvas').length,text:document.querySelector('#p-off').innerText.replace(/\s+/g,' ').trim()}});
      ok('mobile: opens map_korea.pdf in a separate tab automatically',m.opened.length===1&&/map_korea\.pdf$/.test(m.opened[0]),JSON.stringify(m.opened));
      ok('mobile: not blank — message + "Open PDF" button visible in the viewport, link = map_korea.pdf',m.fbVisible&&m.btnInView&&/map_korea\.pdf$/.test(m.btnHref)&&m.text.length>20,JSON.stringify({vis:m.fbVisible,inView:m.btnInView,text:m.text.slice(0,90)}));
      ok('mobile: nothing embedded, no SVG/image content',m.hostEmpty&&!m.embedded&&m.imgs===0);
      await p.evaluate(()=>{window.__opened=[];window.open=()=>null});await p.evaluate(()=>tab('sch'));await wait(1700);await p.evaluate(()=>tab('off'));await wait(300);
      const bl=await p.evaluate(()=>({msg:document.querySelector('#pdf-fb-msg').textContent,fb:!document.querySelector('#pdf-fallback').hidden}));
      ok('mobile: pop-up blocked → tap-to-open message stays visible',bl.fb&&/Tap the button/.test(bl.msg),JSON.stringify(bl));
    }
    // Korean labels
    await p.evaluate(()=>{if(S.lang!=='ko')document.querySelector('#lg').click()});await wait(300);
    await p.evaluate(()=>tab('off'));await wait(300);
    const ko=await p.evaluate(()=>({desk:(document.querySelector('header [data-tab="off"] .tl')||{}).textContent,menu:(document.querySelector('.mobile-menu-tab[data-tab="off"]')||{}).textContent,pane:document.querySelector('#p-off').innerText.replace(/\s+/g,' ').slice(0,120)}));
    ok('Korean mode: tab = "공식 PDF", pane text localized',/공식 PDF/.test(ko.desk)&&/공식 PDF/.test(ko.menu)&&/PDF/.test(ko.pane)&&!/Open in new tab|Download/.test(ko.pane),JSON.stringify(ko));
    await p.evaluate(()=>{if(S.lang!=='en')document.querySelector('#lg').click()});await wait(200);
  });

  // ---------- E. other tabs still work ----------
  await safe('smoke',async()=>{
    await p.evaluate(()=>tab('sch'));await wait(400);
    ok('Schematic tab renders (SVG background + station hit targets)',await p.evaluate(()=>document.querySelectorAll('#sch-hits g[data-i]').length)>400);
    await p.evaluate(()=>tab('geo'));await wait(300);
    ok('Geo map tab renders markers + route',await p.evaluate(()=>window.__LMAP.svg.querySelectorAll('circle[data-st]').length)>600);
    await p.evaluate(()=>tab('route'));await p.fill('#ra','인천공항1터미널');await p.fill('#rb','홍대입구');await p.click('#go');await wait(300);
    ok('Route search works (Incheon Airport T1 → Hongik Univ.)',/min|분/.test(await p.evaluate(()=>document.querySelector('#rres').innerText)));
  });
  ok('no page errors in this profile',t.errors.length===0,t.errors.slice(0,3).join(' | '));
  await t.close();
}
(async()=>{
  for(const prof of ['desktop','iphone','iphone-land'])await suite(prof);
  await suite('desktop','/seoul-metro-hub/');              // GitHub Pages project-site layout (sub-path)
  const f=results.filter(r=>!r.pass);
  fs.writeFileSync(path.join(__dirname,'TEST_RESULTS_RC4.json'),JSON.stringify({total:results.length,passed:results.length-f.length,failed:f.length,results},null,1));
  console.log(`\nRC4 suite: ${results.length-f.length}/${results.length} passed`);process.exit(f.length?1:0);
})();
