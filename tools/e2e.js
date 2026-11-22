// Headless-browser harness (Chromium via Playwright). Serves the project dir; Leaflet CDN is replaced with tools/leaflet-shim.js.
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium,devices}=require('/opt/npm-tools/node_modules/playwright');
const ROOT=path.resolve(__dirname,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.pdf':'application/pdf'};
function serve(){return new Promise(r=>{const s=http.createServer((q,res)=>{let p=decodeURIComponent(q.url.split('?')[0]);p=p.replace(/^\/seoul-metro-hub(?=\/|$)/,'');if(p===''||p==='/')p='/index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)){res.writeHead(404);return res.end()}res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f))});s.listen(0,()=>r(s))})}
async function open(profile,base='/'){
  const srv=await serve();const port=srv.address().port;
  const browser=await chromium.launch();
  const opts=profile==='iphone'?{...devices['iPhone 14'],defaultBrowserType:undefined}:profile==='iphone-land'?{...devices['iPhone 14 landscape']}:{viewport:{width:1366,height:800}};
  delete opts.defaultBrowserType;
  const ctx=await browser.newContext(opts);const page=await ctx.newPage();
  const errors=[];page.on('pageerror',e=>errors.push('PAGEERROR '+e.message+' @ '+String(e.stack).split('\n').slice(1,3).join(' < ').replace(/http:\/\/localhost:\d+\//g,'')));page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|ERR_/.test(m.text()))errors.push('CONSOLE '+m.text())});
  const requests=[];
  await page.route('**/*',route=>{const u=route.request().url();requests.push(u);
    if(/leaflet\.js/.test(u))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'leaflet-shim.js'))});
    if(/leaflet\.css/.test(u))return route.fulfill({contentType:'text/css',body:''});
    if(u.startsWith('http://localhost:'+port))return route.continue();return route.abort()});
  await page.goto('http://localhost:'+port+base+'index.html');await page.waitForTimeout(600);
  return {page,browser,srv,errors,requests,close:async()=>{await browser.close();srv.close()}};
}
module.exports={open};
