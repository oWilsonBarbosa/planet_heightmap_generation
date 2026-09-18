import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { PNG } from 'pngjs';

const ROOT = process.cwd();
const OLD_ROOT = process.env.OLD_ROOT || '/tmp/orogen-old';
const OUT = path.join(ROOT, 'tuning', 'results', 'global-raster-compare');
fs.mkdirSync(OUT, {recursive:true});

const CODE='06cy8w6z6a89kow6psje93';
const W=720,H=360,NP=W*H;
const POWER_A=4.574236096629359, POWER_B=1.4622457219144074;

const MIME={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.txt':'text/plain','.xml':'application/xml','.webmanifest':'application/manifest+json'};

function server(root){return new Promise(resolve=>{
 const s=http.createServer((req,res)=>{
  let p=decodeURIComponent(new URL(req.url,'http://x').pathname); if(p==='/'||p==='')p='/index.html';
  const f=path.join(root,p); if(!f.startsWith(root)){res.writeHead(403);res.end();return;}
  fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});res.end(d);});
 });
 s.listen(0,'127.0.0.1',()=>resolve({s,port:s.address().port}));
});}

async function generate(label, root, browser) {
 const {s,port}=await server(root);
 const page=await browser.newPage();
 page.setDefaultTimeout(30*60*1000);
 const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.goto(`http://127.0.0.1:${port}/#${CODE}`,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(async()=>{try{const {state}=await import('./js/state.js');return !!(state.curData?.r_elevation);}catch{return false;}},{timeout:30*60*1000});
  await page.evaluate(async()=>{
    const {state}=await import('./js/state.js');
    if(state.climateComputed)return;
    const {computeClimateViaWorker}=await import('./js/generate.js');
    await new Promise((resolve,reject)=>{
      const t=setTimeout(()=>reject(new Error('climate timeout')),30*60*1000);
      computeClimateViaWorker(null,()=>{clearTimeout(t);resolve();});
    });
  });
  const r=await page.evaluate(async ({W,H,A,B})=>{
    const d=(await import('./js/state.js')).state.curData;
    const nPix=W*H;
    const count=new Uint32Array(nPix), land=new Uint32Array(nPix);
    const elev=new Float64Array(nPix), nativeKm=new Float64Array(nPix), canonKm=new Float64Array(nPix);
    const temp=new Float64Array(nPix), precip=new Float64Array(nPix), wind=new Float64Array(nPix), current=new Float64Array(nPix);
    const kc=new Uint16Array(nPix*31);
    const ts=d.r_temperature_summer, tw=d.r_temperature_winter, ps=d.r_precip_summer, pw=d.r_precip_winter;
    const ws=d.debugLayers?.windSpeedSummer, ww=d.debugLayers?.windSpeedWinter;
    const cs=d.r_ocean_speed_summer, cw=d.r_ocean_speed_winter, kop=d.debugLayers?.koppen;
    const e=d.r_elevation, xyz=d.r_xyz;
    const classGlobal=new Uint32Array(31);
    let rawLand=0;
    for(let i=0;i<e.length;i++){
      const x=xyz[3*i],y=xyz[3*i+1],z=xyz[3*i+2];
      const lat=Math.asin(Math.max(-1,Math.min(1,y)));
      const lon=Math.atan2(x,z);
      let px=Math.floor((lon+Math.PI)/(2*Math.PI)*W); if(px<0)px=0;if(px>=W)px=W-1;
      let py=Math.floor((Math.PI/2-lat)/Math.PI*H); if(py<0)py=0;if(py>=H)py=H-1;
      const p=py*W+px, v=e[i];
      count[p]++; if(v>0){land[p]++;rawLand++;}
      elev[p]+=v;
      const t=Math.min(Math.max(v,0),1);
      nativeKm[p]+=v<=0?10*v:6*t*t*t*t*(5-4*t);
      canonKm[p]+=v<=0?10*v:A*Math.pow(v,B);
      if(ts&&tw) temp[p]+=(-45+90*((ts[i]+tw[i])*0.5));
      if(ps&&pw) precip[p]+=(ps[i]+pw[i])*0.5;
      if(ws&&ww) wind[p]+=(ws[i]+ww[i])*0.5;
      if(cs&&cw) current[p]+=(cs[i]+cw[i])*0.5;
      if(kop){const k=kop[i]||0;if(k<=30){kc[p*31+k]++;classGlobal[k]++;}}
    }
    const out={count:Array.from(count),landFrac:new Array(nPix),elev:new Array(nPix),nativeKm:new Array(nPix),canonKm:new Array(nPix),tempC:new Array(nPix),precip:new Array(nPix),wind:new Array(nPix),current:new Array(nPix),koppen:new Array(nPix),classGlobal:Array.from(classGlobal),regions:e.length,rawLand};
    for(let p=0;p<nPix;p++){
      const c=count[p]; if(!c){for(const k of ['landFrac','elev','nativeKm','canonKm','tempC','precip','wind','current'])out[k][p]=null;out.koppen[p]=0;continue;}
      out.landFrac[p]=land[p]/c;out.elev[p]=elev[p]/c;out.nativeKm[p]=nativeKm[p]/c;out.canonKm[p]=canonKm[p]/c;
      out.tempC[p]=temp[p]/c;out.precip[p]=precip[p]/c;out.wind[p]=wind[p]/c;out.current[p]=current[p]/c;
      let bk=0,bc=-1;for(let k=0;k<=30;k++){const v=kc[p*31+k];if(v>bc){bc=v;bk=k;}}out.koppen[p]=bk;
    }
    return out;
  },{W,H,A:POWER_A,B:POWER_B});
  r.label=label;r.errors=errors;
  return r;
 }finally{await page.close().catch(()=>{});s.close();}
}

function statPair(a,b,mask=null){
 let n=0,sa=0,sb=0,sd=0,sad=0,sq=0,saa=0,sbb=0,sab=0;
 const abs=[];
 for(let i=0;i<a.length;i++){
  if(mask && !mask(i))continue; const x=a[i],y=b[i]; if(x==null||y==null||!Number.isFinite(x)||!Number.isFinite(y))continue;
  const d=y-x;n++;sa+=x;sb+=y;sd+=d;sad+=Math.abs(d);sq+=d*d;saa+=x*x;sbb+=y*y;sab+=x*y;abs.push(Math.abs(d));
 }
 abs.sort((x,y)=>x-y);
 const ma=sa/n,mb=sb/n; const cov=sab/n-ma*mb,va=saa/n-ma*ma,vb=sbb/n-mb*mb;
 const q=p=>abs[Math.min(abs.length-1,Math.floor(p*(abs.length-1)))];
 return {n,oldMean:ma,newMean:mb,bias:sd/n,mae:sad/n,rmse:Math.sqrt(sq/n),corr:cov/Math.sqrt(va*vb),absP50:q(.5),absP95:q(.95),absP99:q(.99)};
}
function major(k){if(k===0)return 'O';if(k<=3)return 'A';if(k<=7)return 'B';if(k<=16)return 'C';if(k<=28)return 'D';return 'E';}

function compare(o,n){
 const valid=i=>o.count[i]>0&&n.count[i]>0;
 let both=0, oldLand=0,newLand=0,inter=0,union=0,l2o=0,o2l=0,kEq=0,kMaj=0,kN=0;
 for(let i=0;i<NP;i++) if(valid(i)){
  both++; const a=o.landFrac[i]>=.5,b=n.landFrac[i]>=.5;
  if(a)oldLand++;if(b)newLand++;if(a&&b)inter++;if(a||b)union++;if(a&&!b)l2o++;if(!a&&b)o2l++;
  if(a&&b){kN++;if(o.koppen[i]===n.koppen[i])kEq++;if(major(o.koppen[i])===major(n.koppen[i]))kMaj++;}
 }
 return {
  grid:{width:W,height:H,validPixels:both},
  land:{oldPixels:oldLand,newPixels:newLand,jaccard:inter/union,oldToOcean:l2o,oceanToNewLand:o2l,changedFraction:(l2o+o2l)/both},
  rawElevation:statPair(o.elev,n.elev,valid),
  nativeHeightKm:statPair(o.nativeKm,n.nativeKm,valid),
  canonicalPowerHeightKm:statPair(o.canonKm,n.canonKm,valid),
  annualMeanTempC:statPair(o.tempC,n.tempC,valid),
  precipNormalized:statPair(o.precip,n.precip,valid),
  windNormalized:statPair(o.wind,n.wind,valid),
  oceanCurrentNormalized:statPair(o.current,n.current,i=>valid(i)&&o.landFrac[i]<.5&&n.landFrac[i]<.5),
  koppen:{commonLandPixels:kN,exactAgreement:kEq/kN,majorGroupAgreement:kMaj/kN,oldGlobal:o.classGlobal,newGlobal:n.classGlobal}
 };
}

function grayPng(vals, file, min, max){
 const png=new PNG({width:W,height:H,colorType:0,bitDepth:8});
 for(let i=0;i<NP;i++){const v=vals[i];png.data[i]=v==null?0:Math.max(0,Math.min(255,Math.round((v-min)/(max-min)*255)));}
 fs.writeFileSync(file,PNG.sync.write(png));
}
function diffPng(a,b,file,scale){
 const png=new PNG({width:W,height:H,colorType:0,bitDepth:8});
 for(let i=0;i<NP;i++){const x=a[i],y=b[i]; const d=(x==null||y==null)?0:(y-x);png.data[i]=Math.max(0,Math.min(255,Math.round(127.5+d/scale*127.5)));}
 fs.writeFileSync(file,PNG.sync.write(png));
}
function maskPng(r,file){
 const png=new PNG({width:W,height:H,colorType:0,bitDepth:8});
 for(let i=0;i<NP;i++)png.data[i]=(r.landFrac[i]??0)>=.5?255:0;
 fs.writeFileSync(file,PNG.sync.write(png));
}

const browser=await puppeteer.launch({headless:true,protocolTimeout:30*60*1000,args:['--no-sandbox','--disable-setuid-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader','--js-flags=--max-old-space-size=6144']});
try{
 const oldR=await generate('f9bb0812',OLD_ROOT,browser);
 fs.writeFileSync(path.join(OUT,'old-raster.json'),JSON.stringify(oldR));
 const newR=await generate('cc2662b4',ROOT,browser);
 fs.writeFileSync(path.join(OUT,'new-raster.json'),JSON.stringify(newR));
 const cmp=compare(oldR,newR);
 fs.writeFileSync(path.join(OUT,'comparison.json'),JSON.stringify(cmp,null,2));
 maskPng(oldR,path.join(OUT,'old-landmask-1deg.png')); maskPng(newR,path.join(OUT,'new-landmask-1deg.png'));
 grayPng(oldR.canonKm,path.join(OUT,'old-canonical-height-1deg.png'),-10,8);
 grayPng(newR.canonKm,path.join(OUT,'new-canonical-height-1deg.png'),-10,8);
 diffPng(oldR.canonKm,newR.canonKm,path.join(OUT,'delta-canonical-height-1deg.png'),3);
 diffPng(oldR.tempC,newR.tempC,path.join(OUT,'delta-tempC-1deg.png'),15);
 diffPng(oldR.precip,newR.precip,path.join(OUT,'delta-precip-1deg.png'),0.75);
 console.log(JSON.stringify(cmp,null,2));
}finally{await browser.close();}
