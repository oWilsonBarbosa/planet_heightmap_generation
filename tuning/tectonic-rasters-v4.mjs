import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT=process.cwd(), OUT=path.join(ROOT,'tuning','results','tectonic-rasters-v4');
fs.mkdirSync(OUT,{recursive:true});
const CODE='06cy8w6z6a89kow6psje93', W=1440,H=720;
const MIME={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.txt':'text/plain','.xml':'application/xml','.webmanifest':'application/manifest+json'};
function serve(root){return new Promise(resolve=>{const s=http.createServer((req,res)=>{let p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(p==='/'||p==='')p='/index.html';const f=path.join(root,p);if(!f.startsWith(root)){res.writeHead(403);res.end();return;}fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});res.end(d);});});s.listen(0,'127.0.0.1',()=>resolve({s,port:s.address().port}));});}
function saveDataUrl(name,url){const b=Buffer.from(url.split(',')[1],'base64');fs.writeFileSync(path.join(OUT,name),b);}
const {s,port}=await serve(ROOT);
const browser=await puppeteer.launch({headless:true,protocolTimeout:30*60*1000,args:['--no-sandbox','--disable-setuid-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader','--js-flags=--max-old-space-size=6144']});
try{
 const page=await browser.newPage(); page.setDefaultTimeout(30*60*1000);
 await page.goto(`http://127.0.0.1:${port}/#${CODE}`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(async()=>{try{const {state}=await import('./js/state.js');const d=state.curData,dl=d?.debugLayers;return !!(d?.r_elevation&&dl?.boundaryType&&dl?.riftDistance&&dl?.ridgeDistance&&dl?.fractureDistance);}catch{return false;}},{timeout:30*60*1000});
 const urls=await page.evaluate(async ({W,H})=>{
   const {state}=await import('./js/state.js');
   const d=state.curData,dl=d.debugLayers,xyz=d.r_xyz,e=d.r_elevation,stress=d.r_stress,N=e.length;
   const bt=dl.boundaryType,rift=dl.riftDistance,ridge=dl.ridgeDistance,frac=dl.fractureDistance,sp=dl.superPlates,fold=dl.foldBeltWeight,phasor=dl.phasorRidge,back=dl.backArc;
   const pixN=W*H;
   const idxFor=(i)=>{const x=xyz[3*i],y=xyz[3*i+1],z=xyz[3*i+2];let lon=Math.atan2(x,z),lat=Math.asin(Math.max(-1,Math.min(1,y)));const px=Math.min(W-1,Math.max(0,Math.floor((lon+Math.PI)/(2*Math.PI)*W)));const py=Math.min(H-1,Math.max(0,Math.floor((Math.PI/2-lat)/Math.PI*H)));return py*W+px;};
   const count=new Uint16Array(pixN), land=new Uint16Array(pixN), ocean=new Uint16Array(pixN);
   const stressMax=new Float32Array(pixN), foldMax=new Float32Array(pixN), phasorMax=new Float32Array(pixN), backMax=new Float32Array(pixN);
   const b1=new Uint16Array(pixN),b2=new Uint16Array(pixN),b3=new Uint16Array(pixN),riftHit=new Uint16Array(pixN),ridgeHit=new Uint16Array(pixN),fracHit=new Uint16Array(pixN);
   for(let i=0;i<N;i++){
     const p=idxFor(i);count[p]++;if(e[i]>0)land[p]++;else ocean[p]++;
     if(stress[i]>stressMax[p])stressMax[p]=stress[i];
     if(fold?.[i]>foldMax[p])foldMax[p]=fold[i];
     if(Math.abs(phasor?.[i]||0)>Math.abs(phasorMax[p]))phasorMax[p]=phasor[i]||0;
     if(Math.abs(back?.[i]||0)>Math.abs(backMax[p]))backMax[p]=back[i]||0;
     const t=Math.round(bt[i]);if(t===1)b1[p]++;else if(t===2)b2[p]++;else if(t===3)b3[p]++;
     if(Number.isFinite(rift[i]))riftHit[p]++;
     if(Number.isFinite(ridge[i]))ridgeHit[p]++;
     if(Number.isFinite(frac[i]))fracHit[p]++;
   }
   let globalStress=0;for(let p=0;p<pixN;p++)if(stressMax[p]>globalStress)globalStress=stressMax[p];if(globalStress<=0)globalStress=1;

   function make(render){
     const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d'),im=ctx.createImageData(W,H),a=im.data;
     for(let p=0;p<pixN;p++){const [r,g,b,aa]=render(p);const q=p*4;a[q]=r;a[q+1]=g;a[q+2]=b;a[q+3]=aa;}
     ctx.putImageData(im,0,0);return c.toDataURL('image/png');
   }
   const base=(p)=> land[p]>=ocean[p]?[224,218,196,255]:[210,225,235,255];

   const boundary=make(p=>{let c=base(p);const m=Math.max(b1[p],b2[p],b3[p]);if(m===0)return c;if(m===b1[p])return [220,55,45,255];if(m===b2[p])return [40,110,220,255];return [240,180,40,255];});
   const stressUrl=make(p=>{const t=Math.min(1,stressMax[p]/globalStress);if(t<0.02)return base(p);return [Math.round(255*t),Math.round(80*(1-t)),Math.round(40*(1-t)),255];});
   const kinematics=make(p=>{const bh=b1[p],dh=b2[p],th=b3[p];if(riftHit[p])return [150,60,200,255];if(ridgeHit[p])return [30,160,235,255];if(fracHit[p])return [245,180,30,255];if(bh)return [220,55,45,255];if(dh)return [40,110,220,255];if(th)return [230,170,40,255];return base(p);});
   const orogenic=make(p=>{const f=Math.min(1,foldMax[p]||0),ph=Math.min(1,Math.abs(phasorMax[p]||0)*8),ba=Math.min(1,Math.abs(backMax[p]||0)*8);if(f>0.05)return [150+Math.round(105*f),70,50,255];if(ph>0.03)return [135,80+Math.round(120*ph),45,255];if(ba>0.03)return [80,110,170+Math.round(80*ba),255];return base(p);});
   const combined=make(p=>{let c=base(p);if(riftHit[p])c=[145,55,200,255];else if(ridgeHit[p])c=[35,145,230,255];else if(fracHit[p])c=[235,175,30,255];else {const m=Math.max(b1[p],b2[p],b3[p]);if(m===b1[p]&&m>0)c=[210,45,40,255];else if(m===b2[p]&&m>0)c=[45,110,210,255];else if(m===b3[p]&&m>0)c=[225,165,35,255];}return c;});
   return {boundary,stressUrl,kinematics,orogenic,combined};
 },{W,H});
 saveDataUrl('v4_major_boundary_types_1440x720.png',urls.boundary);
 saveDataUrl('v4_tectonic_stress_1440x720.png',urls.stressUrl);
 saveDataUrl('v4_rifts_ridges_fractures_1440x720.png',urls.kinematics);
 saveDataUrl('v4_orogenic_features_1440x720.png',urls.orogenic);
 saveDataUrl('v4_chapter2_tectonics_combined_1440x720.png',urls.combined);
 fs.writeFileSync(path.join(OUT,'README.txt'),[
   'V4 tectonic rasters, rendered from all 2,560,001 native cells.',
   'Projection: equirectangular 1440x720.',
   '',
   'major_boundary_types: red=convergent, blue=divergent, yellow=transform.',
   'tectonic_stress: intensity of native r_stress, normalized to raster maximum.',
   'rifts_ridges_fractures: purple=continental-rift footprint, cyan=mid-ocean ridge footprint, yellow=fracture-zone footprint; red/blue/yellow fallback boundary types.',
   'orogenic_features: red=fold-belt weight, green/brown=phasor ridges, blue=back-arc signal.',
   'chapter2_tectonics_combined: simplified Chapter 2 interpretation.',
   '',
   'These are display rasters only; classification and measurements come from the full native mesh.'
 ].join('\n'));
 console.log('wrote tectonic rasters to',OUT);
}finally{await browser.close();s.close();}
