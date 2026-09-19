import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT=process.cwd();
const OUT=path.join(ROOT,'tuning','results','table5-v4-native.json');
fs.mkdirSync(path.dirname(OUT),{recursive:true});
const CODE='06cy8w6z6a89kow6psje93';
const EARTH_AREA=4*Math.PI*6371*6371;
const CELL_AREA=EARTH_AREA/2560001;
const DEG=Math.PI/180;

const MIME={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.txt':'text/plain','.xml':'application/xml','.webmanifest':'application/manifest+json'};
function serve(root){return new Promise(resolve=>{const s=http.createServer((req,res)=>{let p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(p==='/'||p==='')p='/index.html';const f=path.join(root,p);if(!f.startsWith(root)){res.writeHead(403);res.end();return;}fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});res.end(d);});});s.listen(0,'127.0.0.1',()=>resolve({s,port:s.address().port}));});}

function fromLatLon(latDeg,lonDeg){const lat=latDeg*DEG,lon=lonDeg*DEG;return [Math.cos(lat)*Math.sin(lon),Math.sin(lat),Math.cos(lat)*Math.cos(lon)];}
function norm(v){const m=Math.hypot(...v);return v.map(x=>x/m);}
function buildFaces(){
 const ringLat=Math.atan(0.5)/DEG;
 const verts=[fromLatLon(90,0)];
 for(let i=0;i<5;i++)verts.push(fromLatLon(ringLat,72*i));
 for(let i=0;i<5;i++)verts.push(fromLatLon(-ringLat,72*i+36));
 verts.push(fromLatLon(-90,0));
 const U=i=>1+(i%5),L=i=>6+(i%5),tris=[];
 for(let i=0;i<5;i++)tris.push([0,U(i),U(i+1)]);
 for(let i=0;i<5;i++)tris.push([U(i),L(i),U(i+1)]);
 for(let i=0;i<5;i++)tris.push([L(i),L(i+1),U(i+1)]);
 for(let i=0;i<5;i++)tris.push([11,L(i+1),L(i)]);
 let faces=tris.map(tri=>{const c=norm([verts[tri[0]][0]+verts[tri[1]][0]+verts[tri[2]][0],verts[tri[0]][1]+verts[tri[1]][1]+verts[tri[2]][1],verts[tri[0]][2]+verts[tri[1]][2]+verts[tri[2]][2]]);return {center:c,lat:Math.asin(c[1])/DEG,lon:Math.atan2(c[0],c[2])/DEG};});
 faces.sort((a,b)=>(b.lat-a.lat)||(a.lon-b.lon));
 return faces;
}
const faces=buildFaces();

function classify(stats){
 const f=stats.landFrac;
 if(f<0.005 || stats.significantLandComponents===0)return 'Water';
 if(f<0.25){
   if(stats.continentCells===0 && stats.significantIslandCount<=5 && stats.largestIslandKm2<25000)return 'Water/Minor Is.';
   return 'Water/Major Is.';
 }
 if(f<0.625)return 'Water/Land';
 if(f<0.875)return 'Ld./major seas';
 if(f<0.995)return 'Ld./minor lakes';
 return 'Land';
}

const {s,port}=await serve(ROOT);
const browser=await puppeteer.launch({headless:true,protocolTimeout:30*60*1000,args:['--no-sandbox','--disable-setuid-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader','--js-flags=--max-old-space-size=6144']});
try{
 const page=await browser.newPage();page.setDefaultTimeout(30*60*1000);
 await page.goto(`http://127.0.0.1:${port}/#${CODE}`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(async()=>{try{const {state}=await import('./js/state.js');return !!state.curData?.r_elevation;}catch{return false;}},{timeout:30*60*1000});
 const result=await page.evaluate(({faces,CELL_AREA})=>{
   const {state}=await import('./js/state.js');
   const d=state.curData,n=d.r_elevation.length,mesh=d.mesh,e=d.r_elevation,xyz=d.r_xyz;
   // Global native land connected components.
   const comp=new Int32Array(n);comp.fill(-1);const sizes=[];const q=new Int32Array(n);let cid=0;
   for(let i=0;i<n;i++){
     if(e[i]<=0||comp[i]>=0)continue;
     let h=0,t=0;q[t++]=i;comp[i]=cid;let sz=0;
     while(h<t){
       const r=q[h++];sz++;
       for(let k=mesh.adjOffset[r];k<mesh.adjOffset[r+1];k++){
         const nb=mesh.adjList[k];
         if(e[nb]>0&&comp[nb]<0){comp[nb]=cid;q[t++]=nb;}
       }
     }
     sizes.push(sz);cid++;
   }
   const order=[...sizes.keys()].sort((a,b)=>sizes[b]-sizes[a]);
   const continentSet=new Set(order.slice(0,4));
   const compIsCont=new Uint8Array(sizes.length);for(const id of continentSet)compIsCont[id]=1;

   function polyReg(x,y,z){let best=0,bd=-2;for(let j=0;j<20;j++){const c=faces[j].center,dot=c[0]*x+c[1]*y+c[2]*z;if(dot>bd){bd=dot;best=j;}}return best;}
   // Polar display: the map blank's solid rings are 75° and 45° latitude;
   // cap=1 region, 45-75 ring=4 sectors, 0-45 ring=8 sectors per hemisphere.
   // Prime-meridian convention: lon 0° bisects a sector.
   function polarReg(x,y,z){
     const lat=Math.asin(Math.max(-1,Math.min(1,y)))/Math.PI*180;
     let lon=Math.atan2(x,z)/Math.PI*180; if(lon<0)lon+=360;
     const north=lat>=0, a=Math.abs(lat); let local;
     if(a>=75)local=0;
     else if(a>=45){const s=Math.floor(((lon+45)%360)/90);local=1+s;}
     else {const s=Math.floor(((lon+22.5)%360)/45);local=5+s;}
     return (north?0:13)+local;
   }

   function collect(R,assign){
     const a=Array.from({length:R},()=>({cells:0,landCells:0,continentCells:0,compCounts:new Map()}));
     for(let i=0;i<n;i++){
       const r=assign(xyz[3*i],xyz[3*i+1],xyz[3*i+2]),s=a[r];s.cells++;
       if(e[i]>0){s.landCells++;const c=comp[i];if(compIsCont[c])s.continentCells++;s.compCounts.set(c,(s.compCounts.get(c)||0)+1);}
     }
     return a.map((s,idx)=>{
       let significantLandComponents=0,significantIslandCount=0,largestIslandCells=0,largestCompCells=0;
       for(const [c,cells] of s.compCounts){
         if(cells>largestCompCells)largestCompCells=cells;
         const areaGlobal=sizes[c]*CELL_AREA;
         if(areaGlobal>=600) significantLandComponents++;
         if(!compIsCont[c] && areaGlobal>=600){significantIslandCount++; if(sizes[c]>largestIslandCells)largestIslandCells=sizes[c];}
       }
       return {region:idx+1,cells:s.cells,landCells:s.landCells,waterCells:s.cells-s.landCells,landFrac:s.landCells/s.cells,waterFrac:1-s.landCells/s.cells,continentCells:s.continentCells,continentFrac:s.continentCells/s.cells,significantLandComponents,significantIslandCount,largestIslandKm2:largestIslandCells*CELL_AREA,largestComponentWithinRegionKm2:largestCompCells*CELL_AREA};
     });
   }
   const poly=collect(20,polyReg),polar=collect(26,polarReg);
   return {
     regions:n,landCells:[...e].reduce((a,v)=>a+(v>0),0),componentCount:sizes.length,
     componentSizesTop10:order.slice(0,10).map(id=>({id,cells:sizes[id],areaKm2:sizes[id]*CELL_AREA})),
     poly,polar
   };
 },{faces,CELL_AREA});

 for(const kind of ['poly','polar']){
   const counts={};
   for(const r of result[kind]){r.category=classify(r);counts[r.category]=(counts[r.category]||0)+1;}
   result[kind+'Counts']=counts;
 }
 result.cellAreaKm2=CELL_AREA;
 result.classification={
   sourceSemantics:'Guidebook Table 5 qualitative categories',
   rules:[
    'Water: <0.5% land or no significant (>=600 km2 global) land component',
    'Water/Minor Is.: <25% land, no continent incursion, <=5 significant islands, largest island <25,000 km2',
    'Water/Major Is.: remaining <25% land (includes dense archipelagoes, major islands, or continent/peninsula incursion)',
    'Water/Land: 25% to <62.5% land',
    'Ld./major seas: 62.5% to <87.5% land',
    'Ld./minor lakes: 87.5% to <99.5% land',
    'Land: >=99.5% land'
   ],
   polarGeometry:'solid-ring boundaries 75° and 45° latitude; 1+4+8 regions per hemisphere; lon 0° bisects sectors',
   polyGeometry:'exact 0r063N tools/regional-report/icosahedron.mjs orientation'
 };
 fs.writeFileSync(OUT,JSON.stringify(result,null,2));
 console.log(JSON.stringify({landCells:result.landCells,componentCount:result.componentCount,polyCounts:result.polyCounts,polarCounts:result.polarCounts,poly:result.poly.map(r=>({region:r.region,landPct:+(r.landFrac*100).toFixed(2),category:r.category,continentPct:+(r.continentFrac*100).toFixed(2),islands:r.significantIslandCount,largestIslandKm2:Math.round(r.largestIslandKm2)})),polar:result.polar.map(r=>({region:r.region,landPct:+(r.landFrac*100).toFixed(2),category:r.category,continentPct:+(r.continentFrac*100).toFixed(2),islands:r.significantIslandCount,largestIslandKm2:Math.round(r.largestIslandKm2)}))},null,2));
}finally{await browser.close();s.close();}
