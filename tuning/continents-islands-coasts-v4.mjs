import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT=process.cwd();
const OUT=path.join(ROOT,'tuning','results','continents-islands-coasts-v4.json');
fs.mkdirSync(path.dirname(OUT),{recursive:true});
const CODE='06cy8w6z6a89kow6psje93';
const R=6371;
const AREA=4*Math.PI*R*R/2560001;

const MIME={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.txt':'text/plain','.xml':'application/xml','.webmanifest':'application/manifest+json'};
function serve(root){return new Promise(resolve=>{const s=http.createServer((req,res)=>{let p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(p==='/'||p==='')p='/index.html';const f=path.join(root,p);if(!f.startsWith(root)){res.writeHead(403);res.end();return;}fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});res.end(d);});});s.listen(0,'127.0.0.1',()=>resolve({s,port:s.address().port}));});}

const {s,port}=await serve(ROOT);
const browser=await puppeteer.launch({headless:true,protocolTimeout:30*60*1000,args:['--no-sandbox','--disable-setuid-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader','--js-flags=--max-old-space-size=6144']});
try{
 const page=await browser.newPage(); page.setDefaultTimeout(30*60*1000);
 await page.goto(`http://127.0.0.1:${port}/#${CODE}`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(async()=>{try{const {state}=await import('./js/state.js');return !!state.curData?.r_elevation;}catch{return false;}},{timeout:30*60*1000});

 const out=await page.evaluate(async ({AREA,R})=>{
   const {state}=await import('./js/state.js');
   const d=state.curData, mesh=d.mesh, e=d.r_elevation, xyz=d.r_xyz, stress=d.r_stress;
   const N=e.length, {adjOffset,adjList}=mesh;
   const heightKm=v=>{if(v<=0)return 10*v;const t=Math.min(v,1),t2=t*t;return 6*t2*t2*(5-4*t);};
   const latlon=i=>{const x=xyz[3*i],y=xyz[3*i+1],z=xyz[3*i+2];return [Math.asin(Math.max(-1,Math.min(1,y)))*180/Math.PI,Math.atan2(x,z)*180/Math.PI];};

   // exact native connected land components
   const comp=new Int32Array(N);comp.fill(-1);
   const q=new Int32Array(N), sizes=[], sx=[],sy=[],sz=[], elevSum=[];
   let cid=0;
   for(let i=0;i<N;i++){
     if(e[i]<=0||comp[i]>=0)continue;
     let h=0,t=0;q[t++]=i;comp[i]=cid;let sz=0,ax=0,ay=0,az=0,eh=0;
     while(h<t){
       const r=q[h++];sz++;ax+=xyz[3*r];ay+=xyz[3*r+1];az+=xyz[3*r+2];eh+=heightKm(e[r]);
       for(let j=adjOffset[r];j<adjOffset[r+1];j++){
         const nb=adjList[j]; if(e[nb]>0&&comp[nb]<0){comp[nb]=cid;q[t++]=nb;}
       }
     }
     sizes.push(sz);sx.push(ax);sy.push(ay);sz.push(az);elevSum.push(eh);cid++;
   }
   const order=[...sizes.keys()].sort((a,b)=>sizes[b]-sizes[a]);
   const continentIds=order.slice(0,4), isCont=new Uint8Array(sizes.length); for(const id of continentIds)isCont[id]=1;

   function compSummary(id){
     const m=Math.hypot(sx[id],sy[id],sz[id])||1, x=sx[id]/m,y=sy[id]/m,z=sz[id]/m;
     return {id,cells:sizes[id],areaKm2:sizes[id]*AREA,landShare:sizes[id]/N,meanNativeHeightKm:elevSum[id]/sizes[id],centroidLat:Math.asin(y)*180/Math.PI,centroidLon:Math.atan2(x,z)*180/Math.PI};
   }
   const continents=continentIds.map(compSummary);
   const islandIds=order.slice(4), islandSizes=islandIds.map(id=>sizes[id]).sort((a,b)=>a-b);
   const islandAreaTotal=islandSizes.reduce((a,b)=>a+b,0)*AREA;
   const qtile=p=>islandSizes[Math.min(islandSizes.length-1,Math.floor(p*(islandSizes.length-1)))]*AREA;
   const bins={lt600:0,km600_10k:0,km10k_25k:0,km25k_100k:0,gte100k:0};
   for(const cells of islandSizes){const a=cells*AREA;if(a<600)bins.lt600++;else if(a<10000)bins.km600_10k++;else if(a<25000)bins.km10k_25k++;else if(a<100000)bins.km25k_100k++;else bins.gte100k++;}
   const largestIslands=islandIds.slice(0,15).map(compSummary);

   // coastline: exact land cells touching water, boundary edge lengths, active/passive,
   // and Guidebook coast character derived from native relief within 5 land hops.
   const coastCells=[]; let coastlineKm=0, active=0, passive=0;
   const compCoastCells=new Uint32Array(sizes.length), compCoastKm=new Float64Array(sizes.length);
   const seen=new Int32Array(N); let stamp=1; const bfs=new Int32Array(5000), depth=new Uint8Array(5000);
   const coastClass={flat:0,hilly:0,mountainous:0}, coastByComp=new Map();
   function cc(id){let o=coastByComp.get(id);if(!o){o={flat:0,hilly:0,mountainous:0,active:0,passive:0,cells:0,km:0};coastByComp.set(id,o);}return o;}
   for(let r=0;r<N;r++){
     if(e[r]<=0)continue; let coastal=false, edgeKm=0;
     for(let j=adjOffset[r];j<adjOffset[r+1];j++){
       const nb=adjList[j]; if(e[nb]<=0){
         coastal=true;
         const dot=Math.max(-1,Math.min(1,xyz[3*r]*xyz[3*nb]+xyz[3*r+1]*xyz[3*nb+1]+xyz[3*r+2]*xyz[3*nb+2]));
         edgeKm+=Math.acos(dot)*R;
       }
     }
     if(!coastal)continue;
     coastCells.push(r); coastlineKm+=edgeKm; compCoastCells[comp[r]]++; compCoastKm[comp[r]]+=edgeKm;
     const activeHere=stress[r]>0.15; if(activeHere)active++; else passive++;
     const co=cc(comp[r]);co.cells++;co.km+=edgeKm;if(activeHere)co.active++;else co.passive++;

     // local inland relief within 5 mesh hops (~60-80 km at this resolution).
     stamp++; if(stamp===2147483647){seen.fill(0);stamp=1;}
     let bh=0,bt=0;bfs[bt]=r;depth[bt]=0;bt++;seen[r]=stamp;
     let maxH=heightKm(e[r]),minH=maxH;
     while(bh<bt){
       const cur=bfs[bh], dep=depth[bh];bh++;
       const hh=heightKm(e[cur]);if(hh>maxH)maxH=hh;if(hh<minH)minH=hh;
       if(dep>=5)continue;
       for(let j=adjOffset[cur];j<adjOffset[cur+1];j++){
         const nb=adjList[j]; if(e[nb]<=0||seen[nb]===stamp)continue; seen[nb]=stamp;
         if(bt<bfs.length){bfs[bt]=nb;depth[bt]=dep+1;bt++;}
       }
     }
     const relief=maxH-minH;
     let cls;
     if(maxH>=1.0 || relief>=0.8)cls='mountainous';
     else if(maxH>=0.2 || relief>=0.15)cls='hilly';
     else cls='flat';
     coastClass[cls]++;co[cls]++;
   }
   for(const c of continents){const co=cc(c.id);Object.assign(c,{coastlineCells:co.cells,coastlineKm:co.km,coastActiveFraction:co.cells?co.active/co.cells:0,coastClasses:{flat:co.flat,hilly:co.hilly,mountainous:co.mountainous}});}
   const largestIslandDetails=largestIslands.map(x=>{const co=cc(x.id);return {...x,coastlineCells:co.cells,coastlineKm:co.km,coastClasses:{flat:co.flat,hilly:co.hilly,mountainous:co.mountainous}};});

   return {
     regions:N,landCells:e.reduce((a,v)=>a+(v>0),0),landFraction:e.reduce((a,v)=>a+(v>0),0)/N,
     componentCount:sizes.length,continentCount:4,islandCount:islandIds.length,
     continents,
     islands:{count:islandIds.length,totalCells:islandSizes.reduce((a,b)=>a+b,0),totalAreaKm2:islandAreaTotal,shareOfLand:islandSizes.reduce((a,b)=>a+b,0)/e.reduce((a,v)=>a+(v>0),0),medianAreaKm2:qtile(.5),p75AreaKm2:qtile(.75),p90AreaKm2:qtile(.9),p95AreaKm2:qtile(.95),p99AreaKm2:qtile(.99),maxAreaKm2:islandSizes.at(-1)*AREA,bins,largest:largestIslandDetails},
     coastline:{cells:coastCells.length,approxBoundaryKm:coastlineKm,activeCells:active,passiveCells:passive,activeFraction:active/coastCells.length,classes:coastClass,classFractions:{flat:coastClass.flat/coastCells.length,hilly:coastClass.hilly/coastCells.length,mountainous:coastClass.mountainous/coastCells.length},classificationRule:'native S-curve physical height within 5 land hops: mountainous if max>=1.0 km or relief>=0.8 km; else hilly if max>=0.2 km or relief>=0.15 km; else flat',activeRule:'r_stress > 0.15, matching v4 terrain-metrics shelf-width diagnostic'}
   };
 },{AREA,R});
 fs.writeFileSync(OUT,JSON.stringify(out,null,2));
 console.log(JSON.stringify(out,null,2));
}finally{await browser.close();s.close();}
