import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT=process.cwd(), OUT=path.join(ROOT,'tuning','results','mountain-rifts-v4-native.json');
fs.mkdirSync(path.dirname(OUT),{recursive:true});
const CODE='06cy8w6z6a89kow6psje93', R=6371, DEG=180/Math.PI;
const MIME={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.txt':'text/plain','.xml':'application/xml','.webmanifest':'application/manifest+json'};
function serve(root){return new Promise(resolve=>{const s=http.createServer((req,res)=>{let p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(p==='/'||p==='')p='/index.html';const f=path.join(root,p);if(!f.startsWith(root)){res.writeHead(403);res.end();return;}fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});res.end(d);});});s.listen(0,'127.0.0.1',()=>resolve({s,port:s.address().port}));});}
const {s,port}=await serve(ROOT);
const browser=await puppeteer.launch({headless:true,protocolTimeout:30*60*1000,args:['--no-sandbox','--disable-setuid-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader','--js-flags=--max-old-space-size=6144']});
try{
 const page=await browser.newPage();page.setDefaultTimeout(30*60*1000);
 await page.goto(`http://127.0.0.1:${port}/#${CODE}`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(async()=>{try{const {state}=await import('./js/state.js');const d=state.curData,dl=d?.debugLayers;return !!(d?.r_elevation&&dl?.superPlates&&dl?.boundaryType&&d?.superPlateVec);}catch{return false;}},{timeout:30*60*1000});

 const out=await page.evaluate(async ({R,DEG})=>{
   const {state}=await import('./js/state.js');
   const d=state.curData,mesh=d.mesh,xyz=d.r_xyz,e=d.r_elevation,stress=d.r_stress,dl=d.debugLayers;
   const sp=dl.superPlates,btype=dl.boundaryType,sub=dl.subductFactor,hasOcean=dl.hasOceanBoundary,bothOcean=dl.bothOceanBoundary;
   const S=d.numSuperPlates, spOcean=d.superPlateIsOcean, spVec=d.superPlateVec;
   const N=e.length,{adjOffset,adjList}=mesh;
   const heightKm=v=>{if(v<=0)return 10*v;const t=Math.min(v,1),t2=t*t;return 6*t2*t2*(5-4*t);};
   function edgeKm(a,b){const dot=Math.max(-1,Math.min(1,xyz[3*a]*xyz[3*b]+xyz[3*a+1]*xyz[3*b+1]+xyz[3*a+2]*xyz[3*b+2]));return Math.acos(dot)*R;}
   function vel(pid,r){const pv=spVec[pid],p=pv.pole,w=pv.omega,x=xyz[3*r],y=xyz[3*r+1],z=xyz[3*r+2];return [w*(p[1]*z-p[2]*y),w*(p[2]*x-p[0]*z),w*(p[0]*y-p[1]*x)];}
   const recs=[]; const perCell=Array.from({length:N},()=>null);
   // One record per cross-superplate edge.
   for(let r=0;r<N;r++){
     const a=Math.round(sp[r]);
     for(let j=adjOffset[r];j<adjOffset[r+1];j++){
       const nb=adjList[j],b=Math.round(sp[nb]); if(a===b||r>nb)continue;
       const lo=Math.min(a,b),hi=Math.max(a,b), key=lo+':'+hi;
       const va=vel(a,r),vb=vel(b,nb), dx=xyz[3*r]-xyz[3*nb],dy=xyz[3*r+1]-xyz[3*nb+1],dz=xyz[3*r+2]-xyz[3*nb+2],dist=Math.hypot(dx,dy,dz)||1;
       const rv=[va[0]-vb[0],va[1]-vb[1],va[2]-vb[2]];
       const normal=-(rv[0]*dx+rv[1]*dy+rv[2]*dz)/dist;
       const rvMag=Math.hypot(...rv), tang=Math.sqrt(Math.max(0,rvMag*rvMag-normal*normal));
       const type=Math.round((btype[r]+btype[nb])/2)||Math.round(btype[r]||btype[nb]||3);
       const mx=xyz[3*r]+xyz[3*nb],my=xyz[3*r+1]+xyz[3*nb+1],mz=xyz[3*r+2]+xyz[3*nb+2],mm=Math.hypot(mx,my,mz)||1;
       recs.push({r,nb,a:lo,b:hi,key,type,len:edgeKm(r,nb),lat:Math.asin(my/mm)*DEG,lon:Math.atan2(mx,mz)*DEG,normal,tang,stress:(stress[r]+stress[nb])/2,sub:(sub[r]+sub[nb])/2,hasOcean:!!(hasOcean[r]||hasOcean[nb]),bothOcean:!!(bothOcean[r]||bothOcean[nb]),h1:heightKm(e[r]),h2:heightKm(e[nb])});
     }
   }
   // Build boundary-cell membership by pair+type, then connected components.
   const groups=new Map();
   for(let i=0;i<recs.length;i++){
     const z=recs[i],gk=z.key+'|'+z.type;
     if(!groups.has(gk))groups.set(gk,{edges:[],cells:new Set(),pair:[z.a,z.b],type:z.type});
     const g=groups.get(gk);g.edges.push(i);g.cells.add(z.r);g.cells.add(z.nb);
   }
   const features=[];
   for(const [gk,g] of groups){
     const member=new Set(g.cells),visited=new Set();
     for(const seed of member){
       if(visited.has(seed))continue;
       const q=[seed];visited.add(seed);const cells=[];let qi=0;
       while(qi<q.length){const u=q[qi++];cells.push(u);for(let j=adjOffset[u];j<adjOffset[u+1];j++){const v=adjList[j];if(member.has(v)&&!visited.has(v)){visited.add(v);q.push(v);}}}
       const cs=new Set(cells);
       const edges=g.edges.map(i=>recs[i]).filter(z=>cs.has(z.r)||cs.has(z.nb));
       // avoid tiny one-edge artifacts
       if(edges.length<3)continue;
       let length=0,ax=0,ay=0,az=0,norm=0,tan=0,st=0,sf=0,ho=0,bo=0;
       const hs=[];
       for(const z of edges){length+=z.len;norm+=z.normal*z.len;tan+=z.tang*z.len;st+=z.stress*z.len;sf+=z.sub*z.len;ho+=z.hasOcean*z.len;bo+=z.bothOcean*z.len;
         const lat=z.lat/DEG,lon=z.lon/DEG;ax+=Math.cos(lat)*Math.sin(lon)*z.len;ay+=Math.sin(lat)*z.len;az+=Math.cos(lat)*Math.cos(lon)*z.len;
         if(z.h1>0)hs.push(z.h1);if(z.h2>0)hs.push(z.h2);
       }
       hs.sort((a,b)=>a-b); const p95=hs.length?hs[Math.floor(.95*(hs.length-1))]:0, med=hs.length?hs[Math.floor(.5*(hs.length-1))]:0;
       const mm=Math.hypot(ax,ay,az)||1, lat=Math.asin(ay/mm)*DEG,lon=Math.atan2(ax,az)*DEG;
       const type=g.type, oceanFrac=ho/length,bothFrac=bo/length;
       let cls,guide;
       if(type===2){
         if(bothFrac>0.6){cls='mid-ocean ridge';guide='rift/spreading system (submarine mountain chain)';}
         else if(oceanFrac<0.4){cls='continental rift';guide='rift system';}
         else {cls='mixed rift/spreading margin';guide='rift system';}
       } else if(type===3){
         cls=bothFrac>0.6?'oceanic transform / fracture zone':'transform / shear boundary';guide=p95>=1?'alongside, low-to-medium mountains':'alongside, no/low mountains';
       } else {
         if(bothFrac>0.6){cls='ocean-ocean convergence';guide='trench + island-arc mountain system';}
         else if(oceanFrac>0.4){cls='ocean-continent convergence';guide='trench + continental mountain chain';}
         else {cls='continent-continent collision';guide='collisional mountain chain';}
       }
       let grade='none';
       if(p95>=3)grade='high';
       else if(p95>=1)grade='medium';
       else if(p95>=0.2)grade='low';
       features.push({pair:g.pair,boundaryType:type,class:cls,guidebookInterpretation:guide,lengthKm:length,centroidLat:lat,centroidLon:lon,meanNormalMotion:norm/length,meanTangentialMotion:tan/length,meanStress:st/length,meanSubductFactor:sf/length,oceanContextFraction:oceanFrac,bothOceanFraction:bothFrac,medianAdjacentLandHeightKm:med,p95AdjacentLandHeightKm:p95,mountainGradeDerived:grade,edgeCount:edges.length});
     }
   }
   features.sort((a,b)=>b.lengthKm-a.lengthKm);
   // filter chapter-scale features, retaining all >=500 km plus stronger shorter systems
   const major=features.filter(f=>f.lengthKm>=500 || (f.lengthKm>=250 && (f.mountainGradeDerived==='high'||Math.abs(f.meanNormalMotion)>0.2)));
   const counts={};for(const f of major)counts[f.class]=(counts[f.class]||0)+1;
   return {regions:N,superPlateCount:S,totalBoundaryEdges:recs.length,featureCount:features.length,majorFeatureCount:major.length,classificationNotes:{
     nativeBoundaryType:'1 convergent, 2 divergent, 3 transform; directly from v4 superplate collision state',
     mountainGrade:'derived editorial mapping from p95 adjacent native S-curve land height: low 0.2–<1 km, medium 1–<3 km, high >=3 km; not a generator-native category',
     majorFilter:'>=500 km, or >=250 km when high mountains or strong normal relative motion',
     motionUnits:'generator-native relative velocity units; not calibrated cm/yr'
   },counts,majorFeatures:major,allFeatures:features};
 },{R,DEG});
 fs.writeFileSync(OUT,JSON.stringify(out,null,2));
 console.log(JSON.stringify({summary:{features:out.featureCount,major:out.majorFeatureCount,counts:out.counts},major:out.majorFeatures.slice(0,60)},null,2));
}finally{await browser.close();s.close();}
