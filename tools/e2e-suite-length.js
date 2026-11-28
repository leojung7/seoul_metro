// Character-length filter suite (dynamic "6+" dropdown).  Run: node tools/e2e-suite-length.js
// The expected values are computed HERE with an independent implementation (manual parenthesis scan + Unicode letter test)
// straight from data.js, then compared with what the running app shows.
const {open}=require('./e2e.js');const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');
const results=[];const mk=prof=>(name,pass,detail='')=>{results.push({prof,name,pass:!!pass,detail:String(detail).slice(0,300)});console.log((pass?'PASS ':'FAIL ')+`[${prof}] ${name}${detail?' — '+String(detail).slice(0,300):''}`)};

// ---- independent expectation from data.js ----
const c={};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(ROOT,'data.js'),'utf8')+';this.ST=ST;this.GS=GS;this.LO=LO;',c);
const {ST,GS,LO}=c;
const strip=s=>{let out='',d=0;for(const ch of String(s)){if(ch==='('||ch==='（'){d++;continue}if(ch===')'||ch==='）'){d=Math.max(0,d-1);continue}if(d===0)out+=ch}return out};
const lenKo=s=>[...strip(s)].filter(ch=>!/\s/.test(ch)).length;
const lenEn=s=>[...strip(s)].filter(ch=>/\p{L}/u.test(ch)).length;
const nm=(s,g)=>{const o=g&&s.displayNames&&s.displayNames[g];return o?{ko:o.ko,en:o.en}:{ko:s.ko,en:s.en}};
const L=(mode,s,g)=>{const n=nm(s,g);return mode==='ko'?lenKo(n.ko):lenEn(n.en)};
const expMax=mode=>{let m=0;for(const s of ST){const names=[{ko:s.ko,en:s.en},...Object.values(s.displayNames||{})];for(const n of names)m=Math.max(m,mode==='ko'?lenKo(n.ko):lenEn(n.en))}return m};
const EXP={ko:expMax('ko'),en:expMax('en')};
const expected={ko:{},en:{}};for(const mode of ['ko','en'])for(const g of LO){expected[mode][g]={};for(let n=2;n<=Math.max(6,EXP[mode]);n++)expected[mode][g][n]=GS[g].filter(i=>L(mode,ST[i],g)===n).length}
console.log('expected longest names (independent):',JSON.stringify(EXP));

async function run(prof){
  const ok=mk(prof);const mobile=prof!=='desktop';const logs=[];
  const t=await open(prof);const p=t.page;p.on('console',m=>logs.push(m.text()));
  const wait=ms=>p.waitForTimeout(ms);
  const safe=async(n,f)=>{try{await f()}catch(e){ok(n,false,'EXCEPTION '+String(e.message).split('\n')[0])}};
  // ---- 1. console log at initialization ----
  await safe('init log',async()=>{
    logs.length=0;await p.reload();await wait(1200);
    const line=logs.find(x=>x.startsWith('[length-filter]'));
    ok('console log at initialization reports the detected maximum lengths',!!line&&line.includes(`Korean = ${EXP.ko}`)&&line.includes(`English = ${EXP.en}`),line||'(no log)');
    const live=await p.evaluate(()=>({ko:LEN_STATS.ko.max,en:LEN_STATS.en.max,n:LEN_STATS.stations}));
    ok(`longest Korean name = ${EXP.ko} and English = ${EXP.en} (matches the independent computation, ${live.n} stations)`,live.ko===EXP.ko&&live.en===EXP.en&&live.n===ST.length,JSON.stringify(live));
  });
  await p.evaluate(()=>tab('lines'));await wait(300);
  const setMode=async m=>{await p.selectOption('#cl',m);await wait(80)};
  const opts=()=>p.evaluate(()=>[...document.querySelectorAll('#len-sel option')].map(o=>+o.value));
  const sel=()=>p.evaluate(()=>{const s=document.querySelector('#len-sel');return s?+s.value:null});

  for(const mode of ['ko','en']){
    const tag=mode==='ko'?'Korean':'English';
    await safe(tag,async()=>{
      await setMode(mode);await p.evaluate(()=>{S.lines.lenN=6;S.lines.len='all';S.lines.g='1';drawLines()});
      // ---- 2. dropdown visibility ----
      for(const b of ['all','2','3','4','5']){await p.click(`#lens [data-len="${b}"]`);await wait(40);if(await p.evaluate(()=>!!document.querySelector('#len-sel'))){ok(`${tag}: no dropdown for "${b}"`,false);}}
      ok(`${tag}: no dropdown while All / 2 / 3 / 4 / 5 is selected`,true);
      await p.click('#lens [data-len="6+"]');await wait(80);
      const o=await opts();const want=Array.from({length:Math.max(6,EXP[mode])-5},(_,k)=>k+6);
      ok(`${tag}: "6+" shows a dropdown ${want[0]}…${want[want.length-1]} (max generated from the data = ${EXP[mode]}), consecutive`,JSON.stringify(o)===JSON.stringify(want),`${o[0]}…${o[o.length-1]} (${o.length} options)`);
      ok(`${tag}: dropdown defaults to 6`,(await sel())===6);
      ok(`${tag}: dropdown sits beside the 6+ button`,await p.evaluate(()=>{const b=document.querySelector('#lens [data-len="6+"]'),s=document.querySelector('#len-sel');return !!s&&b.nextElementSibling===s}));
      // ---- 3. exact filtering, every line x every length, counts beside the filter ----
      const actual=await p.evaluate(({mode,max})=>{const out={};S.lines.cl=mode;S.lines.len='6+';S.lines.tr=0;S.lines.so='o';S.lines.q='';for(const g of LO){out[g]={};S.lines.g=g;for(let n=6;n<=max;n++){S.lines.lenN=n;drawLines();const rows=[...document.querySelectorAll('#lst .row')];const bad=rows.filter(r=>cl(ST[+r.dataset.i],g)!==n).length;const fc=parseInt(document.querySelector('#fcnt').textContent,10);out[g][n]={rows:new Set(rows.map(r=>r.dataset.i)).size,listed:rows.length,bad,fc}}}return out},{mode,max:Math.max(6,EXP[mode])});
      let mism=[],badRows=0,fcBad=0,total=0;
      for(const g of LO)for(let n=6;n<=Math.max(6,EXP[mode]);n++){const a=actual[g][n];total++;if(a.rows!==expected[mode][g][n])mism.push(`${g}/${n}: ${a.rows}≠${expected[mode][g][n]}`);badRows+=a.bad;if(a.fc!==a.rows)fcBad++}
      ok(`${tag}: ${total} line×length combinations show exactly the expected stations`,mism.length===0,mism.slice(0,5).join(' | '));
      ok(`${tag}: every displayed row has exactly the selected length`,badRows===0,String(badRows));
      ok(`${tag}: the station count beside the filter equals the distinct stations shown (all combinations)`,fcBad===0,String(fcBad));
      // ---- 4. real UI interaction at the extremes ----
      const g=mode==='en'?'경의선':'1';await p.evaluate(g=>{S.lines.g=g;S.lines.len='6+';drawLines()},g);
      const edges=[6,Math.floor((6+EXP[mode])/2),EXP[mode]];
      for(const n of edges){await p.selectOption('#len-sel',String(n));await wait(60);
        const r=await p.evaluate(()=>({rows:new Set([...document.querySelectorAll('#lst .row')].map(x=>x.dataset.i)).size,fc:parseInt(document.querySelector('#fcnt').textContent,10),val:+document.querySelector('#len-sel').value,focus:document.activeElement&&document.activeElement.id}));
        ok(`${tag}: choosing ${n} in the dropdown (line ${g}) shows exactly ${expected[mode][g][n]} station(s), count label accurate`,r.rows===expected[mode][g][n]&&r.fc===r.rows&&r.val===n,JSON.stringify(r));
        ok(`${tag}: keyboard focus stays on the dropdown after filtering`,r.focus==='len-sel');}
      // ---- 5. preserved behaviour: transfer-only, sorting, search, route order ----
      await p.selectOption('#len-sel','7');await wait(60);
      const base=await p.evaluate(()=>[...new Set([...document.querySelectorAll('#lst .row')].map(r=>+r.dataset.i))]);
      await p.evaluate(()=>{const c=document.querySelector('#tr');c.checked=true;c.dispatchEvent(new Event('change'))});await wait(80);
      const tr=await p.evaluate(()=>[...new Set([...document.querySelectorAll('#lst .row')].map(r=>+r.dataset.i))]);
      ok(`${tag}: transfer-only + exact length = only transfer stations of that length`,tr.every(i=>base.includes(i))&&await p.evaluate(a=>a.every(i=>ST[i].ln.length>1),tr),`${tr.length}/${base.length}`);
      await p.evaluate(()=>{const c=document.querySelector('#tr');c.checked=false;c.dispatchEvent(new Event('change'))});
      for(const so of ['en','ko','o']){await p.selectOption('#so',so);await wait(60);
        const r=await p.evaluate(()=>{const rows=[...new Set([...document.querySelectorAll('#lst .row')].map(x=>x.dataset.i))];return {n:rows.length,fc:parseInt(document.querySelector('#fcnt').textContent,10),flat:document.querySelector('#lst').classList.contains('flat')}});
        ok(`${tag}: sort "${so}" keeps the same ${base.length} stations and an accurate count`,r.n===base.length&&r.fc===r.n&&r.flat===(so!=='o'),JSON.stringify(r));}
      await p.fill('#lf','a');await wait(80);
      const sr=await p.evaluate(()=>({n:new Set([...document.querySelectorAll('#lst .row')].map(x=>x.dataset.i)).size,fc:parseInt(document.querySelector('#fcnt').textContent,10),bad:[...document.querySelectorAll('#lst .row')].filter(r=>cl(ST[+r.dataset.i],S.lines.g)!==S.lines.lenN).length}));
      ok(`${tag}: search text combines with the exact-length filter`,sr.fc===sr.n&&sr.bad===0&&sr.n<=base.length,JSON.stringify(sr));
      await p.fill('#lf','');await wait(40);
    });
  }
  // ---- 6. counting rules ----
  await safe('rules',async()=>{
    const r=await p.evaluate(()=>{const a=ST.find(s=>s.ko==='총신대입구'),d=ST.find(s=>/Dongdaemun History/.test(s.en));S.lines.cl='ko';const k7=cl(a,'7'),k4=cl(a,'4');S.lines.cl='en';return {k7,k4,e7:cl(a,'7'),e4:cl(a,'4'),dd:cl(d,'2'),ddName:d.en,sample:countLen("Dongdaemun History & Culture Park","en"),ds:cl(d,'2')}});
    ok('Korean: 이수(총신대입구) counts as 2 (text in parentheses ignored)',r.k7===2,JSON.stringify(r));
    ok('Korean: 총신대입구(이수) counts as 5',r.k4===5);
    ok('English: Isu(Chongshin Univ.) counts as 3 letters; Chongshin Univ.(Isu) counts as 13 (Chongshin 9 + Univ 4)',r.e7===3&&r.e4===lenEn('Chongshin Univ.')&&r.e4===13,`${r.e7}/${r.e4}`);
    const exp=lenEn('Dongdaemun History & Culture Park');
    ok(`English: "Dongdaemun History & Culture Park" counts letters only (${exp}; spaces and & ignored); the dataset's own spelling gives the same ${r.ds}`,r.sample===exp&&exp===28&&r.ds===28,JSON.stringify({sample:r.sample,ds:r.ds,name:r.ddName}));
  });
  // ---- 7. the maximum is really dynamic ----
  await safe('dynamic',async()=>{
    await setMode('en');await p.evaluate(()=>{S.lines.len='6+';S.lines.g='1';drawLines()});
    const before=(await opts()).pop();
    const after=await p.evaluate(()=>{ST.push({i:ST.length,ko:'테스트역',en:'Synthetic Station Name With Sixty Letters Added For Testing Purposes',ja:'',lat:37.5,lng:127,ap:0,x:0,y:0,cd:{},aliases:[],ln:[]});LEN_STATS=computeLengthStats();drawLines();const top=+[...document.querySelectorAll('#len-sel option')].pop().value;const detected=LEN_STATS.en.max;ST.pop();LEN_STATS=computeLengthStats();drawLines();return {top,detected,restored:+[...document.querySelectorAll('#len-sel option')].pop().value}});
    const synth=lenEn('Synthetic Station Name With Sixty Letters Added For Testing Purposes');
    ok(`adding a longer name raises the maximum (${before} → ${after.top}) and the dropdown follows; removing it restores ${before}`,after.top===synth&&after.detected===synth&&after.restored===before,JSON.stringify({before,synth,...after}));
    // selection clamps when the counting language (and so the maximum) changes
    await p.selectOption('#len-sel',String(EXP.en));await wait(50);await setMode('ko');
    const cl=await p.evaluate(()=>({sel:+document.querySelector('#len-sel').value,last:+[...document.querySelectorAll('#len-sel option')].pop().value}));
    ok(`switching English → Korean clamps ${EXP.en} to the Korean maximum ${EXP.ko}`,cl.sel===EXP.ko&&cl.last===EXP.ko,JSON.stringify(cl));
    await setMode('en');
    ok('switching back to English restores the full range',(await opts()).pop()===EXP.en);
  });
  // ---- 8. UI language toggle + mobile layout ----
  await safe('ui',async()=>{
    await p.evaluate(()=>{if(S.lang!=='ko')document.querySelector('#lg').click()});await wait(250);
    const ko=await p.evaluate(()=>({btn:document.querySelector('#lens [data-len="6+"]').textContent,label:document.querySelector('#len-sel').getAttribute('aria-label'),has:!!document.querySelector('#len-sel')}));
    ok('Korean UI: "6+글자" button, dropdown present with a Korean accessible label',ko.has&&/6\+/.test(ko.btn)&&/글자/.test(ko.label),JSON.stringify(ko));
    await p.evaluate(()=>{if(S.lang!=='en')document.querySelector('#lg').click()});await wait(250);
    const box=await p.evaluate(()=>{const s=document.querySelector('#len-sel'),r=s.getBoundingClientRect(),l=document.querySelector('#lens').getBoundingClientRect();return {l:Math.round(r.left),r:Math.round(r.right),w:innerWidth,lensRight:Math.round(l.right),h:Math.round(r.height),sw:document.documentElement.scrollWidth}});
    ok(`${mobile?'mobile':'desktop'} layout: dropdown inside the viewport, no horizontal overflow, touch-sized`,box.l>=0&&box.r<=box.w&&box.sw<=box.w+1&&(!mobile||box.h>=40),JSON.stringify(box));
  });
  ok('no page errors',t.errors.length===0,t.errors.slice(0,3).join(' | '));
  await t.close();
}
(async()=>{
  for(const p of ['desktop','iphone','iphone-land'])await run(p);
  const f=results.filter(r=>!r.pass);
  fs.writeFileSync(path.join(__dirname,'TEST_RESULTS_LENGTH.json'),JSON.stringify({run:new Date().toISOString(),independent_expected_max:EXP,total:results.length,pass:results.length-f.length,fail:f.length,results},null,1));
  console.log(`\nLength-filter suite: ${results.length-f.length}/${results.length} passed`);process.exit(f.length?1:0);
})();
