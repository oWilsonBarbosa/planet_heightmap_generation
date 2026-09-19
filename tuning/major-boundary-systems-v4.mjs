import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT=process.cwd(), OUT=path.join(ROOT,'tuning','results','major-boundary-systems-v4-native.json');
fs.mkdirSync(path.dirname(OUT),{recursive:true});
const CODE='06cy8w6z6a89kow6psje93', R=6371, DEG=180/Math.PI;
const DT=1e-2/Math.sqrt(2560001/10000), THRESH=0.3*DT;
const MIME={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.txt':'text/plain','.xml':'application/xml','.webmanifest':'application/manifest+json'};
function serve(root){return new Promise(resolve=>{const s=http.createServer((req,res)=>{let p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(p==='/'||p==='')p='/index.html';const f=path.join(root,p);if(!f.startsWith(root)){res.writeHead(403);res.end();return;}fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});res.end(d);});});s.listen(0,'127.0.0.1',()=>resolve({s,port:s.address().port}));});}
const {s,port}=await serve(ROOT);
const browser=await puppeteer.launch({headless:true,protocolTimeout:30*60*1000,args:['--no-sandbox','--disable-setuid-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader','--js-flags=--max-old-space-size=6144']});
try{
 const page=await browser.newPage();page.setDefaultTimeout(30*60*1000);
 await page.goto(`http://127.0.0.1:${port}/#${CODE}`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(async()=>{try{const {state}=await import('./js/state.js');const d=state.curData;return !!(d?.r_elevation&&d?.debugLayers?.superPlates&&d?.superPlateVec);}catch{return false;}},{timeout:30*60*1000});

 const out=await page.evaluate(async ({R,DEG,THRESH})=>{
   const {state}=await import('./js/state.js');
   const d=state.curData,mesh=d.mesh,xyz=d.r_xyz,e=d.r_elevation,stress=d.r_stress,dl=d.debugLayers;
   const sp=dl.superPlates,sub=dl.subductFactor,S=d.numSuperPlates,spOcean=d.superPlateIsOcean,spVec=d.superPlateVec;
   const {adjOffset,adjList}=mesh,N=e.length;
   const heightKm=v=>{if(v<=0)return 10*v;const t=Math.min(v,1),t2=t*t;return 6*t2*t2*(5-4*t);};
   function vel(pid,r){const pv=spVec[pid],p=pv.pole,w=pv.omega,x=xyz[3*r],y=xyz[3*r+1],z=xyz[3*r+2];return [w*(p[1]*z-p[2]*y),w*(p[2]*x-p[0]*z),w*(p[0]*y-p[1]*x)];}
   function edgeKm(a,b){const dot=Math.max(-1,Math.min(1,xyz[3*a]*xyz[3*b]+xyz[3*a+1]*xyz[3*b+1]+xyz[3*a+2]*xyz[3*b+2]));return Math.acos(dot)*R;}
   const groups=new Map();
   for(let r=0;r<N;r++){
     const pa=Math.round(sp[r]);
     for(let j=adjOffset[r];j<adjOffset[r+1];j++){
       const nb=adjList[j],pb=Math.round(sp[nb]); if(pa===pb||r>nb)continue;
       const lo=Math.min(pa,pb),hi=Math.max(pa,pb);
       const va=vel(pa,r),vb=vel(pb,nb),dx=xyz[3*r]-xyz[3*nb],dy=xyz[3*r+1]-xyz[3*nb+1],dz=xyz[3*r+2]-xyz[3*nb+2],dd=Math.hypot(dx,dy,dz)||1;
       const rv=[va[0]-vb[0],va[1]-vb[1],va[2]-vb[2]],normal=-(rv[0]*dx+rv[1]*dy+rv[2]*dz)/dd,rvMag=Math.hypot(...rv),tang=Math.sqrt(Math.max(0,rvMag*rvMag-normal*normal));
       const type=normal>THRESH?1:(normal<-THRESH?2:3);
       const key=lo+':'+hi+'|'+type;
       let g=groups.get(key);if(!g){g={a:lo,b:hi,type,len:0,ax:0,ay:0,az:0,norm:0,tang:0,stress:0,sub:0,edges:0,heights:[]};groups.set(key,g);}
       const L=edgeKm(r,nb),mx=xyz[3*r]+xyz[3*nb],my=xyz[3*r+1]+xyz[3*nb+1],mz=xyz[3*r+2]+xyz[3*nb+2],mm=Math.hypot(mx,my,mz)||1;
       g.len+=L;g.ax+=mx/mm*L;g.ay+=my/mm*L;g.az+=mz/mm*L;g.norm+=normal*L;g.tang+=tang*L;g.stress+=((stress[r]+stress[nb])/2)*L;g.sub+=((sub[r]+sub[nb])/2)*L;g.edges++;
       const h1=heightKm(e[r]),h2=heightKm(e[nb]);if(h1>0)g.heights.push(h1);if(h2>0)g.heights.push(h2);
     }
   }
   const systems=[];
   for(const g of groups.values()){
     const both=spOcean.has(g.a)&&spOcean.has(g.b), one=spOcean.has(g.a)!==spOcean.has(g.b);
     let cls,guide;
     if(g.type===1){
       if(both){cls='ocean-ocean convergence';guide='trench + island-arc mountain system';}
       else if(one){cls='ocean-continent convergence';guide='trench + continental mountain chain';}
       else {cls='continent-continent collision';guide='collisional mountain chain';}
     }else if(g.type===2){
       if(both){cls='mid-ocean ridge';guide='rift/spreading system (submarine mountain chain)';}
       else if(one){cls='mixed spreading margin';guide='rift/spreading system';}
       else {cls='continental rift';guide='rift system';}
     }else{
       cls=both?'oceanic transform / fracture zone':'transform / shear boundary';
       guide='alongside/sliding boundary; earthquake-prone';
     }
     g.heights.sort((a,b)=>a-b);const med=g.heights.length?g.heights[Math.floor(.5*(g.heights.length-1))]:0,p95=g.heights.length?g.heights[Math.floor(.95*(g.heights.length-1))]:0;
     const mm=Math.hypot(g.ax,g.ay,g.az)||1;
     systems.push({plates:[g.a,g.b],boundaryType:g.type,class:cls,guidebookInterpretation:guide,lengthKm:g.len,centroidLat:Math.asin(g.ay/mm)*DEG,centroidLon:Math.atan2(g.ax,g.az)*DEG,meanNormalMotion:g.norm/g.len,meanTangentialMotion:g.tang/g.len,meanStress:g.stress/g.len,meanSubductFactor:g.sub/g.len,medianBoundaryLandHeightKm:med,p95BoundaryLandHeightKm:p95,edgeCount:g.edges});
   }
   systems.sort((a,b)=>b.lengthKm-a.lengthKm);
   const major=systems.filter(x=>x.lengthKm>=500);
   const counts={};for(const x of major)counts[x.class]=(counts[x.class]||0)+1;
   return {regions:N,superPlateCount:S,boundaryThresholdNative:THRESH,systemCount:systems.length,majorSystemCount:major.length,counts,notes:{
      boundaryClassification:'direct relative Euler motion on each cross-superplate edge; convergent if normal > native v4 threshold, divergent if < -threshold, else transform',
      systemAggregation:'edges aggregated by superplate pair and boundary type for Guidebook/world-map scale',
      relief:'boundary-adjacent native S-curve land heights are descriptive only; Guidebook low/medium/high mountain grades are not assigned because v4 mountain relief commonly peaks inland from the exact boundary',
      motionUnits:'generator-native; not calibrated cm/yr'
   },majorSystems:major,allSystems:systems};
 },{R,DEG,THRESH});
 fs.writeFileSync(OUT,JSON.stringify(out,null,2));
 console.log(JSON.stringify({summary:{systems:out.systemCount,major:out.majorSystemCount,counts:out.counts},major:out.majorSystems},null,2));
}finally{await browser.close();s.close();}
