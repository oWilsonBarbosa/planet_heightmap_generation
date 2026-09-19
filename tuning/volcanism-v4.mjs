import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT=process.cwd(), OUT=path.join(ROOT,'tuning','results','volcanism-v4');
fs.mkdirSync(OUT,{recursive:true});
const CODE='06cy8w6z6a89kow6psje93', R=6371, AREA=4*Math.PI*R*R/2560001, DEG=180/Math.PI, W=1440,H=720;
const MIME={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.txt':'text/plain','.xml':'application/xml','.webmanifest':'application/manifest+json'};
function serve(root){return new Promise(resolve=>{const s=http.createServer((req,res)=>{let p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(p==='/'||p==='')p='/index.html';const f=path.join(root,p);if(!f.startsWith(root)){res.writeHead(403);res.end();return;}fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});res.end(d);});});s.listen(0,'127.0.0.1',()=>resolve({s,port:s.address().port}));});}
function saveDataUrl(name,url){fs.writeFileSync(path.join(OUT,name),Buffer.from(url.split(',')[1],'base64'));}

const {s,port}=await serve(ROOT);
const browser=await puppeteer.launch({headless:true,protocolTimeout:30*60*1000,args:['--no-sandbox','--disable-setuid-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader','--js-flags=--max-old-space-size=6144']});
try{
 const page=await browser.newPage();page.setDefaultTimeout(30*60*1000);
 await page.goto(`http://127.0.0.1:${port}/#${CODE}`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(async()=>{try{const {state}=await import('./js/state.js');const dl=state.curData?.debugLayers;return !!(dl?.volcanicArc&&dl?.hotspotChain&&dl?.lip&&dl?.islandArcOrigin&&dl?.volcanicArcOrigin&&dl?.hotspotOrigin&&dl?.lipOrigin);}catch{return false;}},{timeout:30*60*1000});

 const result=await page.evaluate(async ({R,AREA,DEG,W,H})=>{
   const {state}=await import('./js/state.js');
   const d=state.curData,dl=d.debugLayers,xyz=d.r_xyz,e=d.r_elevation,rp=d.r_plate,sp=dl.superPlates,N=e.length;
   const arc=dl.volcanicArc,islandArc=dl.islandArc,hot=dl.hotspotChain,lip=dl.lip;
   const arcO=dl.volcanicArcOrigin,islandO=dl.islandArcOrigin,hotO=dl.hotspotOrigin,lipO=dl.lipOrigin;
   const plateOcean=d.plateIsOcean,superOcean=d.superPlateIsOcean;
   const latlon=i=>{const x=xyz[3*i],y=xyz[3*i+1],z=xyz[3*i+2];return [Math.asin(Math.max(-1,Math.min(1,y)))*DEG,Math.atan2(x,z)*DEG];};
   const records=[];
   function collectOrigins(layer,type){
     for(let i=0;i<N;i++)if(layer[i]>0){
       const [lat,lon]=latlon(i),pid=rp[i],sid=Math.round(sp[i]);
       records.push({type,region:i,lat,lon,nativePlate:pid,majorPlate:sid,plateType:plateOcean.has(pid)?'oceanic':'continental',majorPlateType:superOcean.has(sid)?'oceanic':'continental'});
     }
   }
   collectOrigins(arcO,'subduction volcanic edifice');
   collectOrigins(islandO,'island-arc origin');
   collectOrigins(hotO,'hotspot head');
   collectOrigins(lipO,'LIP center');

   const stats={};
   for(const [name,layer] of Object.entries({volcanicArc:arc,islandArc,hotspotChain:hot,LIP:lip})){
     let cells=0,sum=0,max=0,land=0;
     for(let i=0;i<N;i++){const v=Math.abs(layer[i]||0);if(v>1e-6){cells++;sum+=v;if(v>max)max=v;if(e[i]>0)land++;}}
     stats[name]={cells,areaKm2:cells*AREA,meanContribution:cells?sum/cells:0,maxContribution:max,landCellFraction:cells?land/cells:0};
   }

   const pixN=W*H;
   const land=new Uint16Array(pixN),ocean=new Uint16Array(pixN);
   const A=new Float32Array(pixN),I=new Float32Array(pixN),Hh=new Float32Array(pixN),L=new Float32Array(pixN);
   const OA=new Uint16Array(pixN),OI=new Uint16Array(pixN),OH=new Uint16Array(pixN),OL=new Uint16Array(pixN);
   function pix(i){const x=xyz[3*i],y=xyz[3*i+1],z=xyz[3*i+2];const lon=Math.atan2(x,z),lat=Math.asin(Math.max(-1,Math.min(1,y)));return Math.min(H-1,Math.max(0,Math.floor((Math.PI/2-lat)/Math.PI*H)))*W+Math.min(W-1,Math.max(0,Math.floor((lon+Math.PI)/(2*Math.PI)*W)));}
   let ma=0,mi=0,mh=0,ml=0;
   for(let i=0;i<N;i++){
     const p=pix(i);if(e[i]>0)land[p]++;else ocean[p]++;
     const av=Math.abs(arc[i]||0),iv=Math.abs(islandArc[i]||0),hv=Math.abs(hot[i]||0),lv=Math.abs(lip[i]||0);
     if(av>A[p])A[p]=av;if(iv>I[p])I[p]=iv;if(hv>Hh[p])Hh[p]=hv;if(lv>L[p])L[p]=lv;
     if(arcO[i]>0)OA[p]++;if(islandO[i]>0)OI[p]++;if(hotO[i]>0)OH[p]++;if(lipO[i]>0)OL[p]++;
     if(av>ma)ma=av;if(iv>mi)mi=iv;if(hv>mh)mh=hv;if(lv>ml)ml=lv;
   }
   function make(render){const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d'),im=ctx.createImageData(W,H),a=im.data;for(let p=0;p<pixN;p++){const q=p*4,[r,g,b,aa]=render(p);a[q]=r;a[q+1]=g;a[q+2]=b;a[q+3]=aa;}ctx.putImageData(im,0,0);return c.toDataURL('image/png');}
   const base=p=>land[p]>=ocean[p]?[224,218,196,255]:[210,225,235,255];
   const arcUrl=make(p=>{const t=ma?Math.min(1,A[p]/ma):0;if(OA[p])return [255,255,255,255];if(t>0.01)return [220,Math.round(180*(1-t)),40,255];return base(p);});
   const islandUrl=make(p=>{const t=mi?Math.min(1,I[p]/mi):0;if(OI[p])return [255,255,255,255];if(t>0.01)return [210,60,Math.round(120+120*t),255];return base(p);});
   const hotUrl=make(p=>{const t=mh?Math.min(1,Hh[p]/mh):0;if(OH[p])return [255,255,255,255];if(t>0.01)return [245,Math.round(80+120*(1-t)),30,255];return base(p);});
   const lipUrl=make(p=>{const t=ml?Math.min(1,L[p]/ml):0;if(OL[p])return [255,255,255,255];if(t>0.01)return [120,50,Math.round(130+120*t),255];return base(p);});
   const combined=make(p=>{let c=base(p);const ta=ma?A[p]/ma:0,ti=mi?I[p]/mi:0,th=mh?Hh[p]/mh:0,tl=ml?L[p]/ml:0,m=Math.max(ta,ti,th,tl);if(m<0.01)return c;if(m===ta)c=[220,70,35,255];else if(m===ti)c=[190,55,180,255];else if(m===th)c=[245,150,25,255];else c=[110,55,190,255];if(OA[p]||OI[p]||OH[p]||OL[p])c=[255,255,255,255];return c;});
   return {records,stats,rasters:{arcUrl,islandUrl,hotUrl,lipUrl,combined}};
 },{R,AREA,DEG,W,H});

 fs.writeFileSync(path.join(OUT,'volcanic-register-v4-native.json'),JSON.stringify({records:result.records,stats:result.stats,notes:{
   source:'cc2662b4 full 2,560,001-cell v4 state',
   activityState:'v4 does not simulate extinct/dormant/active chronology; this register is volcanic mechanism/potential, not eruption status',
   volcanicArc:'individual subduction-related volcanic edifices selected by applyVolcanicArcs',
   islandArc:'ocean-ocean convergent island-arc uplift systems',
   hotspotChain:'mantle-upwelling hotspot domes and age-progressive chains',
   LIP:'large igneous province uplift at hotspot-chain tails'
 }},null,2));
 saveDataUrl('v4_subduction_volcanic_arcs_1440x720.png',result.rasters.arcUrl);
 saveDataUrl('v4_island_arc_volcanism_1440x720.png',result.rasters.islandUrl);
 saveDataUrl('v4_hotspot_chains_1440x720.png',result.rasters.hotUrl);
 saveDataUrl('v4_large_igneous_provinces_1440x720.png',result.rasters.lipUrl);
 saveDataUrl('v4_volcanic_potential_combined_1440x720.png',result.rasters.combined);
 console.log(JSON.stringify({counts:result.records.reduce((o,r)=>(o[r.type]=(o[r.type]||0)+1,o),{}),stats:result.stats},null,2));
}finally{await browser.close();s.close();}
