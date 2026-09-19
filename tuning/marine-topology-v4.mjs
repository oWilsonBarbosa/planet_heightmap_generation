import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT=process.cwd();
const OUT=path.join(ROOT,'tuning','results','marine-topology-v4-native.json');
fs.mkdirSync(path.dirname(OUT),{recursive:true});
const CODE='06cy8w6z6a89kow6psje93';
const R=6371;
const AREA=4*Math.PI*R*R/2560001;
const DEG=180/Math.PI;

const MIME={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.txt':'text/plain','.xml':'application/xml','.webmanifest':'application/manifest+json'};
function serve(root){return new Promise(resolve=>{const s=http.createServer((req,res)=>{let p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(p==='/'||p==='')p='/index.html';const f=path.join(root,p);if(!f.startsWith(root)){res.writeHead(403);res.end();return;}fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});res.end(d);});});s.listen(0,'127.0.0.1',()=>resolve({s,port:s.address().port}));});}

const {s,port}=await serve(ROOT);
const browser=await puppeteer.launch({headless:true,protocolTimeout:30*60*1000,args:['--no-sandbox','--disable-setuid-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader','--js-flags=--max-old-space-size=6144']});
try{
 const page=await browser.newPage();page.setDefaultTimeout(30*60*1000);
 await page.goto(`http://127.0.0.1:${port}/#${CODE}`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(async()=>{try{const {state}=await import('./js/state.js');return !!state.curData?.r_elevation;}catch{return false;}},{timeout:30*60*1000});

 const out=await page.evaluate(async ({AREA,R,DEG})=>{
   const {state}=await import('./js/state.js');
   const d=state.curData, mesh=d.mesh, e=d.r_elevation, xyz=d.r_xyz;
   const N=e.length,{adjOffset,adjList}=mesh;
   const ocean=new Uint8Array(N); let oceanCount=0,landCount=0;
   for(let i=0;i<N;i++){if(e[i]<=0){ocean[i]=1;oceanCount++;}else landCount++;}

   // Physical mean neighbor spacing from a deterministic sample of mesh edges.
   let edgeSum=0,edgeN=0;
   for(let r=0;r<N && edgeN<250000;r+=17){
     for(let j=adjOffset[r];j<adjOffset[r+1] && edgeN<250000;j+=2){
       const nb=adjList[j]; if(nb<=r)continue;
       const dot=Math.max(-1,Math.min(1,xyz[3*r]*xyz[3*nb]+xyz[3*r+1]*xyz[3*nb+1]+xyz[3*r+2]*xyz[3*nb+2]));
       edgeSum+=Math.acos(dot)*R; edgeN++;
     }
   }
   const hopKm=edgeSum/edgeN;

   // Native ocean clearance: graph distance (hops) from the nearest land cell.
   const INF=65535, dist=new Uint16Array(N);dist.fill(INF);
   const q=new Int32Array(oceanCount);let qh=0,qt=0,maxDist=0;
   for(let r=0;r<N;r++){
     if(!ocean[r]){dist[r]=0;continue;}
     let coast=false;
     for(let j=adjOffset[r];j<adjOffset[r+1];j++)if(!ocean[adjList[j]]){coast=true;break;}
     if(coast){dist[r]=1;q[qt++]=r;}
   }
   while(qh<qt){
     const r=q[qh++],nd=dist[r]+1;if(nd>maxDist)maxDist=nd;
     for(let j=adjOffset[r];j<adjOffset[r+1];j++){
       const nb=adjList[j]; if(!ocean[nb]||dist[nb]!==INF)continue;
       dist[nb]=nd;q[qt++]=nb;
     }
   }
   // Any disconnected all-ocean component with no coast (not expected) gets max+1.
   for(let r=0;r<N;r++)if(ocean[r]&&dist[r]===INF)dist[r]=maxDist+1;

   // Bucket ocean cells by clearance for max-tree / persistence analysis.
   maxDist=0;const counts=[];
   for(let r=0;r<N;r++)if(ocean[r]){const v=dist[r];if(v>maxDist)maxDist=v;counts[v]=(counts[v]||0)+1;}
   const buckets=Array.from({length:maxDist+1},()=>new Int32Array(0));
   const offs=new Int32Array(maxDist+1);
   for(let v=1;v<=maxDist;v++)buckets[v]=new Int32Array(counts[v]||0);
   for(let r=0;r<N;r++)if(ocean[r]){const v=dist[r];buckets[v][offs[v]++]=r;}

   const parent=new Int32Array(N);parent.fill(-1);
   const size=new Int32Array(N);
   const birth=new Uint16Array(N);
   const sx=new Float64Array(N),sy=new Float64Array(N),sz=new Float64Array(N),depthSum=new Float64Array(N);
   function find(a){let x=a;while(parent[x]!==x)x=parent[x];while(parent[a]!==a){const p=parent[a];parent[a]=x;a=p;}return x;}
   const events=[];
   function summary(root,death,mergeInto){
     const m=Math.hypot(sx[root],sy[root],sz[root])||1,x=sx[root]/m,y=sy[root]/m,z=sz[root]/m;
     return {
       root,
       cells:size[root],
       coreAreaKm2:size[root]*AREA,
       birthClearanceHops:birth[root],
       deathClearanceHops:death,
       persistenceHops:birth[root]-death,
       centroidLat:Math.asin(y)*DEG,
       centroidLon:Math.atan2(x,z)*DEG,
       meanNativeOceanDepthKm:size[root]?(-10*depthSum[root]/size[root]):0,
       mergeInto
     };
   }
   // Activate from widest ocean interiors down toward coasts. On merge, keep the
   // larger component as elder; record the smaller as a basin candidate.
   for(let level=maxDist;level>=1;level--){
     const b=buckets[level];
     for(let bi=0;bi<b.length;bi++){
       const r=b[bi];parent[r]=r;size[r]=1;birth[r]=level;sx[r]=xyz[3*r];sy[r]=xyz[3*r+1];sz[r]=xyz[3*r+2];depthSum[r]=Math.max(0,-e[r]);
     }
     for(let bi=0;bi<b.length;bi++){
       const r=b[bi];
       for(let j=adjOffset[r];j<adjOffset[r+1];j++){
         const nb=adjList[j];if(parent[nb]<0)continue;
         let a=find(r),c=find(nb);if(a===c)continue;
         // elder = larger; tie by earlier birth then smaller index for determinism
         let keep=a,lose=c;
         if(size[c]>size[a] || (size[c]===size[a] && (birth[c]>birth[a] || (birth[c]===birth[a]&&c<a)))){keep=c;lose=a;}
         if(size[lose]*AREA>=5000 && birth[lose]-level>=1)events.push(summary(lose,level,keep));
         parent[lose]=keep;size[keep]+=size[lose];sx[keep]+=sx[lose];sy[keep]+=sy[lose];sz[keep]+=sz[lose];depthSum[keep]+=depthSum[lose];birth[keep]=Math.max(birth[keep],birth[lose]);
       }
     }
   }

   // Rank geographically meaningful bottleneck-separated marine basins.
   // Narrow-mouth candidates: merge clearance <= 10 hops (~2*10*hopKm mouth width proxy),
   // at least 20,000 km2 of deep-water core, and persistence >=2 hops.
   const candidates=events.filter(x=>x.coreAreaKm2>=20000&&x.persistenceHops>=2&&x.deathClearanceHops<=10);
   candidates.sort((a,b)=>(b.persistenceHops-a.persistenceHops)||(b.coreAreaKm2-a.coreAreaKm2));

   // Classification from topology only. This is intentionally conservative.
   for(const c of candidates){
     c.mouthWidthProxyKm=2*c.deathClearanceHops*hopKm;
     c.interiorWidthProxyKm=2*c.birthClearanceHops*hopKm;
     const ratio=c.birthClearanceHops/Math.max(1,c.deathClearanceHops);
     c.enclosureRatio=ratio;
     if(c.coreAreaKm2>=250000 && ratio>=1.8)c.class='marginal sea';
     else if(c.coreAreaKm2>=75000 && ratio>=1.7)c.class='gulf / small marginal sea';
     else if(c.coreAreaKm2>=20000 && ratio>=1.6)c.class='bay / gulf';
     else c.class='marine basin candidate';
   }

   // Multi-threshold core components for an auditable view of scale dependence.
   const thresholds=[2,3,4,5,6,8,10,12];
   const levels=[];
   const lab=new Int32Array(N),qq=new Int32Array(oceanCount);
   for(const t of thresholds){
     lab.fill(-1);let cid=0;const comps=[];
     for(let r=0;r<N;r++){
       if(!ocean[r]||dist[r]<=t||lab[r]>=0)continue;
       let h=0,zq=0;qq[zq++]=r;lab[r]=cid;let cells=0,ax=0,ay=0,az=0,maxC=0;
       while(h<zq){
         const u=qq[h++];cells++;ax+=xyz[3*u];ay+=xyz[3*u+1];az+=xyz[3*u+2];if(dist[u]>maxC)maxC=dist[u];
         for(let j=adjOffset[u];j<adjOffset[u+1];j++){const nb=adjList[j];if(ocean[nb]&&dist[nb]>t&&lab[nb]<0){lab[nb]=cid;qq[zq++]=nb;}}
       }
       if(cells*AREA>=20000){const m=Math.hypot(ax,ay,az)||1;comps.push({id:cid,cells,areaKm2:cells*AREA,centroidLat:Math.asin(ay/m)*DEG,centroidLon:Math.atan2(ax/m,az/m)*DEG,maxClearanceHops:maxC});}
       cid++;
     }
     comps.sort((a,b)=>b.cells-a.cells);
     levels.push({thresholdHops:t,thresholdHalfWidthKm:t*hopKm,components:comps.slice(0,80)});
   }

   return {
     regions:N,landCells:landCount,oceanCells:oceanCount,cellAreaKm2:AREA,meanNeighborKm:hopKm,maxOceanClearanceHops:maxDist,
     method:{
       clearance:'native mesh BFS distance from each ocean cell to nearest land',
       basinDetection:'descending-clearance union-find max-tree; a basin candidate is a component that merges with a larger marine component through a lower-clearance saddle',
       mouthWidthProxy:'2 × merge-clearance-hops × mean native neighbor spacing; a topological scale proxy, not a surveyed shoreline width',
       classification:'conservative morphometric labels from core area and interior-to-mouth clearance ratio; names remain derived geography, not generator-native semantics'
     },
     candidates:candidates.slice(0,100),
     thresholds:levels
   };
 },{AREA,R,DEG});

 fs.writeFileSync(OUT,JSON.stringify(out,null,2));
 console.log(JSON.stringify({summary:{regions:out.regions,oceanCells:out.oceanCells,meanNeighborKm:out.meanNeighborKm,maxOceanClearanceHops:out.maxOceanClearanceHops,candidateCount:out.candidates.length},candidates:out.candidates.slice(0,40)},null,2));
}finally{await browser.close();s.close();}
