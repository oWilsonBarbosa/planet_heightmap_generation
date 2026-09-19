import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT=process.cwd(), OUT=path.join(ROOT,'tuning','results','mean-temperature-v4');
fs.mkdirSync(OUT,{recursive:true});
const CODE='06cy8w6z6a89kow6psje93', W=1440,H=720, TMIN=-45,TRANGE=90;
const MIME={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.txt':'text/plain','.xml':'application/xml','.webmanifest':'application/manifest+json'};
function serve(root){return new Promise(resolve=>{const s=http.createServer((req,res)=>{let p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(p==='/'||p==='')p='/index.html';const f=path.join(root,p);if(!f.startsWith(root)){res.writeHead(403);res.end();return;}fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});res.end(d);});});s.listen(0,'127.0.0.1',()=>resolve({s,port:s.address().port}));});}
function saveDataUrl(name,url){fs.writeFileSync(path.join(OUT,name),Buffer.from(url.split(',')[1],'base64'));}

const {s,port}=await serve(ROOT);
const browser=await puppeteer.launch({headless:true,protocolTimeout:30*60*1000,args:['--no-sandbox','--disable-setuid-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader','--js-flags=--max-old-space-size=6144']});
try{
 const page=await browser.newPage();page.setDefaultTimeout(30*60*1000);
 await page.goto(`http://127.0.0.1:${port}/#${CODE}`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(async()=>{try{const {state}=await import('./js/state.js');const d=state.curData;return !!(d?.r_elevation&&d?.r_xyz);}catch{return false;}},{timeout:30*60*1000});
 await page.evaluate(async()=>{
   const {state}=await import('./js/state.js');
   if(!state.climateComputed){
     const {computeClimateViaWorker}=await import('./js/generate.js');
     await new Promise((resolve,reject)=>{
       const timer=setTimeout(()=>reject(new Error('Climate computation timed out')),30*60*1000);
       computeClimateViaWorker(null,()=>{clearTimeout(timer);resolve();});
     });
   }
 });
 const result=await page.evaluate(({W,H,TMIN,TRANGE})=>{
   const d=window.__dummy;
   return import('./js/state.js').then(({state})=>{
     const q=state.curData,N=q.r_elevation.length,xyz=q.r_xyz,e=q.r_elevation,ts=q.r_temperature_summer,tw=q.r_temperature_winter;
     const C=v=>TMIN+TRANGE*v;
     let sumA=0,sumS=0,sumW=0,sumLand=0,sumOcean=0,nLand=0,nOcean=0;
     let minA=1e9,maxA=-1e9,minS=1e9,maxS=-1e9,minW=1e9,maxW=-1e9;
     let freeze=0,hot30=0,hot35=0,coldm20=0;
     const bands=Array.from({length:18},(_,i)=>({latMin:-90+i*10,latMax:-80+i*10,cells:0,sum:0,landCells:0,landSum:0,oceanCells:0,oceanSum:0}));
     const pixN=W*H,cnt=new Uint16Array(pixN),sa=new Float32Array(pixN),ss=new Float32Array(pixN),sw=new Float32Array(pixN);
     function pix(i){const x=xyz[3*i],y=xyz[3*i+1],z=xyz[3*i+2],lon=Math.atan2(x,z),lat=Math.asin(Math.max(-1,Math.min(1,y)));return Math.min(H-1,Math.max(0,Math.floor((Math.PI/2-lat)/Math.PI*H)))*W+Math.min(W-1,Math.max(0,Math.floor((lon+Math.PI)/(2*Math.PI)*W)));}
     for(let i=0;i<N;i++){
       const s=C(ts[i]),w=C(tw[i]),a=(s+w)/2;
       sumA+=a;sumS+=s;sumW+=w;
       if(a<minA)minA=a;if(a>maxA)maxA=a;if(s<minS)minS=s;if(s>maxS)maxS=s;if(w<minW)minW=w;if(w>maxW)maxW=w;
       if(a<0)freeze++;if(a>30)hot30++;if(a>35)hot35++;if(a<-20)coldm20++;
       const lat=Math.asin(Math.max(-1,Math.min(1,xyz[3*i+1])))*180/Math.PI,bi=Math.max(0,Math.min(17,Math.floor((lat+90)/10))),b=bands[bi];b.cells++;b.sum+=a;
       if(e[i]>0){sumLand+=a;nLand++;b.landCells++;b.landSum+=a;}else{sumOcean+=a;nOcean++;b.oceanCells++;b.oceanSum+=a;}
       const p=pix(i);cnt[p]++;sa[p]+=a;ss[p]+=s;sw[p]+=w;
     }
     const profile=bands.map(b=>({...b,meanC:b.sum/b.cells,landMeanC:b.landCells?b.landSum/b.landCells:null,oceanMeanC:b.oceanCells?b.oceanSum/b.oceanCells:null}));
     function tempColor(t){
       // fixed -45..45 palette: dark blue -> cyan -> pale -> orange -> dark red
       const x=Math.max(-45,Math.min(45,t));
       const stops=[[-45,[25,35,110]],[-20,[55,120,190]],[0,[170,220,235]],[15,[225,225,180]],[30,[235,150,70]],[45,[150,35,30]]];
       for(let k=0;k<stops.length-1;k++){const [a,ca]=stops[k],[b,cb]=stops[k+1];if(x<=b){const u=(x-a)/(b-a);return ca.map((v,j)=>Math.round(v+(cb[j]-v)*u));}}
       return stops.at(-1)[1];
     }
     function make(arr){
       // fill populated pixels; empty pixels use one-pass nearest-neighbor average
       const vals=new Float32Array(pixN),valid=new Uint8Array(pixN);
       for(let p=0;p<pixN;p++)if(cnt[p]){vals[p]=arr[p]/cnt[p];valid[p]=1;}
       for(let pass=0;pass<3;pass++){const nv=vals.slice(),ok=valid.slice();for(let y=0;y<H;y++)for(let x=0;x<W;x++){const p=y*W+x;if(valid[p])continue;let s=0,n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const yy=y+dy,xx=(x+dx+W)%W;if(yy<0||yy>=H)continue;const j=yy*W+xx;if(valid[j]){s+=vals[j];n++;}}if(n){nv[p]=s/n;ok[p]=1;}}vals.set(nv);valid.set(ok);}
       const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d'),im=ctx.createImageData(W,H),data=im.data;
       for(let p=0;p<pixN;p++){const col=tempColor(vals[p]),q4=4*p;data[q4]=col[0];data[q4+1]=col[1];data[q4+2]=col[2];data[q4+3]=255;}ctx.putImageData(im,0,0);return c.toDataURL('image/png');
     }
     return {
       stats:{regions:N,annualMeanC:sumA/N,seasonA_GlobalMeanC:sumS/N,seasonB_GlobalMeanC:sumW/N,landAnnualMeanC:sumLand/nLand,oceanAnnualMeanC:sumOcean/nOcean,landCells:nLand,oceanCells:nOcean,annualMinC:minA,annualMaxC:maxA,seasonA_MinC:minS,seasonA_MaxC:maxS,seasonB_MinC:minW,seasonB_MaxC:maxW,annualBelow0Fraction:freeze/N,annualAbove30Fraction:hot30/N,annualAbove35Fraction:hot35/N,annualBelowMinus20Fraction:coldm20/N,temperatureOffsetC:0,normalizationRangeC:[-45,45]},
       latitudeProfile:profile,
       rasters:{annual:make(sa),seasonA:make(ss),seasonB:make(sw)}
     };
   });
 },{W,H,TMIN,TRANGE});
 fs.writeFileSync(path.join(OUT,'mean-planetary-temperature-v4-native.json'),JSON.stringify({stats:result.stats,latitudeProfile:result.latitudeProfile,method:{
   annualMean:'arithmetic mean of the two native seasonal temperature fields per cell, then equal-cell global mean',
   seasonalFields:'generator fields named summer and winter; the code applies local-season sign by hemisphere, so these represent opposite solstitial states rather than globally uniform summer/winter',
   conversion:'native normalized temperature converted with -45 + 90*T',
   raster:'1440x720 equirectangular display raster binned from all native cells; statistics are not computed from raster'
 }},null,2));
 saveDataUrl('v4_temperature_annual_mean_1440x720.png',result.rasters.annual);
 saveDataUrl('v4_temperature_season_A_1440x720.png',result.rasters.seasonA);
 saveDataUrl('v4_temperature_season_B_1440x720.png',result.rasters.seasonB);
 console.log(JSON.stringify(result.stats,null,2));
}finally{await browser.close();s.close();}
