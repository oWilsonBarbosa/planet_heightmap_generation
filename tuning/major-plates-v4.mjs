import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT=process.cwd();
const OUT=path.join(ROOT,'tuning','results','major-plates-v4-native.json');
fs.mkdirSync(path.dirname(OUT),{recursive:true});
const CODE='06cy8w6z6a89kow6psje93';
const R=6371, AREA=4*Math.PI*R*R/2560001, DEG=180/Math.PI;
const MIME={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.txt':'text/plain','.xml':'application/xml','.webmanifest':'application/manifest+json'};
function serve(root){return new Promise(resolve=>{const s=http.createServer((req,res)=>{let p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(p==='/'||p==='')p='/index.html';const f=path.join(root,p);if(!f.startsWith(root)){res.writeHead(403);res.end();return;}fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});res.end(d);});});s.listen(0,'127.0.0.1',()=>resolve({s,port:s.address().port}));});}

const {s,port}=await serve(ROOT);
const browser=await puppeteer.launch({headless:true,protocolTimeout:30*60*1000,args:['--no-sandbox','--disable-setuid-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader','--js-flags=--max-old-space-size=6144']});
try{
 const page=await browser.newPage(); page.setDefaultTimeout(30*60*1000);
 await page.goto(`http://127.0.0.1:${port}/#${CODE}`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(async()=>{try{const {state}=await import('./js/state.js');const d=state.curData;return !!(d?.r_elevation&&d?.debugLayers?.superPlates&&d?.superPlateVec);}catch{return false;}},{timeout:30*60*1000});

 const out=await page.evaluate(async ({AREA,DEG})=>{
   const {state}=await import('./js/state.js');
   const d=state.curData, n=d.r_elevation.length, xyz=d.r_xyz, elev=d.r_elevation, rp=d.r_plate;
   const rsp=d.debugLayers.superPlates;
   const S=d.numSuperPlates, spVec=d.superPlateVec, spOcean=d.superPlateIsOcean, spDensity=d.superPlateDensity;
   const plateOcean=d.plateIsOcean;
   const cells=new Uint32Array(S), land=new Uint32Array(S), sx=new Float64Array(S),sy=new Float64Array(S),sz=new Float64Array(S);
   const plateCounts=Array.from({length:S},()=>new Map());
   const nativePlateCells=new Map();
   for(let i=0;i<n;i++){
     const sp=Math.round(rsp[i]); cells[sp]++; if(elev[i]>0)land[sp]++;
     sx[sp]+=xyz[3*i]; sy[sp]+=xyz[3*i+1]; sz[sp]+=xyz[3*i+2];
     const pid=rp[i]; plateCounts[sp].set(pid,(plateCounts[sp].get(pid)||0)+1);
     nativePlateCells.set(pid,(nativePlateCells.get(pid)||0)+1);
   }
   const plates=[];
   for(let sp=0;sp<S;sp++){
     const m=Math.hypot(sx[sp],sy[sp],sz[sp])||1, x=sx[sp]/m,y=sy[sp]/m,z=sz[sp]/m;
     const pv=spVec[sp]||{pole:[0,1,0],omega:0}, p=pv.pole;
     const poleLat=Math.asin(Math.max(-1,Math.min(1,p[1])))*DEG;
     const poleLon=Math.atan2(p[0],p[2])*DEG;
     const constituents=[...plateCounts[sp].entries()].sort((a,b)=>b[1]-a[1]).map(([pid,c])=>({
       plateId:+pid,cells:c,areaKm2:c*AREA,isOceanic:plateOcean.has(+pid)
     }));
     plates.push({
       superPlateId:sp,
       cells:cells[sp],
       areaKm2:cells[sp]*AREA,
       surfaceFraction:cells[sp]/n,
       landCells:land[sp],
       finalLandFraction:land[sp]/Math.max(1,cells[sp]),
       generatorType:spOcean.has(sp)?'oceanic':'continental',
       density:spDensity?.[sp]??null,
       centroidLat:Math.asin(y)*DEG,
       centroidLon:Math.atan2(x,z)*DEG,
       eulerPole:[p[0],p[1],p[2]],
       eulerPoleLat:poleLat,
       eulerPoleLon:poleLon,
       omega:pv.omega,
       constituentPlateCount:constituents.length,
       constituents
     });
   }
   return {
     regions:n,
     cellAreaKm2:AREA,
     superPlateCount:S,
     nativePlateCount:d.plateSeeds.size,
     superPlateOceanicCount:[...spOcean].length,
     superPlateContinentalCount:S-[...spOcean].length,
     notes:{
       generatorType:'superPlateIsOcean is determined by majority area of constituent native plate types in buildSuperPlates()',
       omega:'native generator angular-velocity parameter; no physical cm/yr calibration is implied',
       density:'area-weighted superplate density used by the generator',
       geometry:'areas use Earth radius 6371 km and equal-cell area approximation'
     },
     plates
   };
 },{AREA,DEG});

 fs.writeFileSync(OUT,JSON.stringify(out,null,2));
 console.log(JSON.stringify({
   summary:{superPlateCount:out.superPlateCount,nativePlateCount:out.nativePlateCount,oceanic:out.superPlateOceanicCount,continental:out.superPlateContinentalCount},
   plates:out.plates.map(p=>({id:p.superPlateId,type:p.generatorType,areaMkm2:+(p.areaKm2/1e6).toFixed(3),landPct:+(100*p.finalLandFraction).toFixed(2),lat:+p.centroidLat.toFixed(2),lon:+p.centroidLon.toFixed(2),poleLat:+p.eulerPoleLat.toFixed(2),poleLon:+p.eulerPoleLon.toFixed(2),omega:+p.omega.toFixed(6),constituents:p.constituentPlateCount}))
 },null,2));
}finally{await browser.close();s.close();}
