// TEST-ONLY minimal Leaflet stand-in (the sandbox has no network, so the CDN build can't load).
// Projects lat/lng with Web Mercator into an <svg> inside #map so alignment can be screenshotted.
(function(){
  const R=[];let mapObj=null;
  const merc=(lat,lng)=>{const x=(lng+180)/360;const s=Math.sin(lat*Math.PI/180);const y=0.5-Math.log((1+s)/(1-s))/(4*Math.PI);return [x,y]};
  class Layer{addTo(g){(g.layers||(g.layers=[])).push(this);this._g=g;if(g._map)this._add();return this}
    bindTooltip(t){this._tip=t;return this}on(e,f){(this._h||(this._h={}))[e]=f;return this}
    _add(){}}
  class Poly extends Layer{constructor(ll,o){super();this.ll=ll;this.o=o||{};this.kind='poly'}}
  class CM extends Layer{constructor(ll,o){super();this.ll=ll;this.o=o||{};this.kind='cm'}}
  class Mk extends Layer{constructor(ll,o){super();this.ll=ll;this.o=o||{};this.kind='mk'}}
  class Grp{constructor(){this.layers=[]}addTo(m){this._map=m;return this}clearLayers(){this.layers=[]}}
  class Map_{constructor(id){this.el=document.getElementById(id);this.c=[37.55,126.97];this.z=11;mapObj=this;this.groups=[];this._b=null;
    this.el.style.position='relative';this.el.style.background='#e5e7eb';this.el.style.overflow='hidden';
    this.svg=document.createElementNS('http://www.w3.org/2000/svg','svg');this.svg.style.cssText='position:absolute;inset:0;width:100%;height:100%';this.el.appendChild(this.svg);window.__LMAP=this;}
    setView(c,z){this.c=c;this.z=z;this.render();return this}
    fitBounds(b,o){this._b=b;const lats=b.pts.map(p=>p[0]),lngs=b.pts.map(p=>p[1]);const w=this.el.clientWidth||400,h=this.el.clientHeight||400;
      const [x0,y0]=merc(Math.max(...lats),Math.min(...lngs)),[x1,y1]=merc(Math.min(...lats),Math.max(...lngs));
      const tl=(o&&o.paddingTopLeft)||(o&&o.padding)||[20,20],br=(o&&o.paddingBottomRight)||(o&&o.padding)||[20,20];const aw=Math.max(40,w-tl[0]-br[0]),ah=Math.max(40,h-tl[1]-br[1]);const sx=aw/Math.max(1e-9,(x1-x0)),sy=ah/Math.max(1e-9,(y1-y0));
      let z=Math.log2(Math.min(sx,sy)/256);z=Math.min(z,(o&&o.maxZoom)||18);this.z=z;const k=256*Math.pow(2,z);const mx=(x0+x1)/2,my=(y0+y1)/2;const ox=(tl[0]-br[0])/2,oy=(tl[1]-br[1])/2;/* centre the bbox inside the padded area */const [cx,cy]=[mx-ox/k,my-oy/k];const lng=cx*360-180,n=Math.PI-2*Math.PI*cy,lat=180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n)));this.c=[lat,lng];this.render();return this}
    invalidateSize(){this.render()}panTo(c){this.c=c;this.render()}removeLayer(l){if(this.tiles)this.tiles=this.tiles.filter(x=>x!==l)}addLayer(){}tileUrls(){return (this.tiles||[]).map(t=>t.url)}
    getZoom(){return this.z}getCenter(){return {lat:this.c[0],lng:this.c[1]}}
    render(){const w=this.el.clientWidth||400,h=this.el.clientHeight||400;const k=256*Math.pow(2,this.z);const [cx,cy]=merc(...this.c);
      const P=ll=>{const [x,y]=merc(ll[0],ll[1]);return [w/2+(x-cx)*k,h/2+(y-cy)*k]};this._P=P;
      let out='',pins='';for(const g of this.groups)for(const l of g.layers){
        if(l.kind==='poly'){out+=`<polyline fill="none" stroke="${l.o.color}" stroke-width="${l.o.weight}" stroke-opacity="${l.o.opacity??1}" stroke-linecap="round" stroke-linejoin="round" points="${l.ll.map(p=>P(p).join(',')).join(' ')}"/>`}
        else if(l.kind==='cm'){const [x,y]=P(l.ll);out+=`<circle data-st="1" data-sid="${l.o.sid??""}" cx="${x}" cy="${y}" r="${l.o.radius}" fill="${l.o.fillColor}" stroke="${l.o.color}" stroke-width="${l.o.weight}"/>`}
        else if(l.kind==='mk'){const [x,y]=P(l.ll);const html=l.o.icon&&l.o.icon.html||'';pins+=`<g data-pin="1" style="pointer-events:${(l.o.interactive===false||/pointer-events:\s*none/.test(document.querySelector('style#__pe')?.textContent||'')&&false)?'none':'auto'}"><circle cx="${x}" cy="${y}" r="15" fill="#fff" stroke="#000"/><text x="${x}" y="${y+4}" text-anchor="middle" font-size="12">${html.replace(/<[^>]+>/g,'')}</text></g>`}}
      out+=pins;
      this.svg.innerHTML=out;
      // click handling on circles
      const circles=[...this.svg.querySelectorAll('circle[data-st]')];let ci=0;for(const g of this.groups)for(const l of g.layers){if(l.kind==='cm'){const c=circles[ci++];if(c&&l._h&&l._h.click)c.addEventListener('click',l._h.click)}}}
  }
  Grp.prototype.addTo=function(m){this._map=m;m.groups.push(this);return this};
  const origClear=Grp.prototype.clearLayers;Grp.prototype.clearLayers=function(){this.layers=[];};
  const origAdd=Layer.prototype.addTo;Layer.prototype.addTo=function(g){(g.layers||(g.layers=[])).push(this);this._g=g;if(mapObj){clearTimeout(mapObj._t);mapObj._t=setTimeout(()=>mapObj.render(),0)}return this};
  window.L={map:id=>new Map_(id),tileLayer:(url,o)=>{const h={};const lay={url,o,on(e,f){(h[e]=h[e]||[]).push(f);return this},fire(e){(h[e]||[]).forEach(f=>f({}))},addTo(m){m.tiles=m.tiles||[];m.tiles.push(this);this._m=m;const mode=window.__TILE_MODE&&window.__TILE_MODE[(url.includes('arcgisonline')?'en':'ko')]||'ok';
      setTimeout(()=>{if(!m.tiles.includes(this))return;if(mode==='fail'){for(let i=0;i<5;i++)this.fire('tileerror')}else if(mode==='ok')this.fire('load')},30);return this},remove(){if(this._m)this._m.removeLayer(this);return this},bringToBack(){}};return lay},layerGroup:()=>new Grp(),polyline:(ll,o)=>new Poly(ll,o),circleMarker:(ll,o)=>new CM(ll,o),marker:(ll,o)=>new Mk(ll,o),
    divIcon:o=>o,latLngBounds:pts=>({pts}),control:{scale:()=>({addTo(){}})}};
})();
