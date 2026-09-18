/**
 * Reproduce canonical planet on the pinned generator revision.
 * Writes a compact diagnostic artifact; does not modify canonical data.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tuning', 'results', 'canonical-cc2662b4.json');
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const PLANET_CODE = '06cy8w6z6a89kow6psje93';
const EXPECTED = {
  seed: 10673275,
  N: 2560000,
  P: 80,
  jitter: 0.75,
  nMag: 0.4,
  numContinents: 4,
  continentSizeVariety: 0.35,
  landCoverage: 0.22,
  terrainWarp: 0.75,
  smoothing: 0.10,
  glacialErosion: 0.50,
  hydraulicErosion: 0.50,
  thermalErosion: 0.10,
  ridgeSharpening: 0.50,
  temperatureOffset: 0,
  precipitationOffset: 0
};

const MIME = {
  '.html':'text/html','.js':'application/javascript','.mjs':'application/javascript',
  '.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg',
  '.svg':'image/svg+xml','.txt':'text/plain','.xml':'application/xml',
  '.webmanifest':'application/manifest+json'
};

function startServer() {
  return new Promise(resolve => {
    const server = http.createServer((req,res)=>{
      let p = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if (p === '/' || p === '') p = '/index.html';
      const f = path.join(ROOT,p);
      if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(f,(err,data)=>{
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()] || 'application/octet-stream'});
        res.end(data);
      });
    });
    server.listen(0,'127.0.0.1',()=>resolve({server,port:server.address().port}));
  });
}

function summarizeArray(a, stride=1) {
  let min=Infinity,max=-Infinity,sum=0,n=0,nan=0;
  for (let i=0;i<a.length;i+=stride) {
    const v=a[i];
    if (!Number.isFinite(v)) { nan++; continue; }
    if (v<min) min=v; if (v>max) max=v; sum+=v; n++;
  }
  return {length:a.length,min,max,mean:n?sum/n:null,nan,sampleStride:stride};
}

const {server,port} = await startServer();
const browser = await puppeteer.launch({
  headless:true,
  protocolTimeout: 30 * 60 * 1000,
  args:[
    '--no-sandbox','--disable-setuid-sandbox',
    '--enable-webgl','--use-gl=angle','--use-angle=swiftshader-webgl',
    '--enable-unsafe-swiftshader',
    '--js-flags=--max-old-space-size=6144'
  ]
});

let result = {planetCode:PLANET_CODE, expected:EXPECTED, generatedAt:new Date().toISOString()};
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(30*60*1000);
  await page.setViewport({width:1200,height:900});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',msg=>{
    const t=msg.text();
    if (msg.type()==='error') errors.push(t);
    if (/World Orogen|Generation complete|WARNING/.test(t)) process.stdout.write(t+'\n');
  });

  await page.goto(`http://127.0.0.1:${port}/#${PLANET_CODE}`, {waitUntil:'domcontentloaded',timeout:120000});

  await page.waitForFunction(async () => {
    try {
      const {state} = await import('./js/state.js');
      return !!(state.curData && state.curData.mesh && state.curData.r_elevation);
    } catch { return false; }
  }, {timeout:30*60*1000});

  // At >300k regions the app intentionally skips climate on initial generation.
  // Trigger the current generator's full climate pipeline explicitly.
  await page.evaluate(async () => {
    const {state} = await import('./js/state.js');
    if (state.climateComputed) return;
    const {computeClimateViaWorker} = await import('./js/generate.js');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Climate computation timed out')), 30 * 60 * 1000);
      computeClimateViaWorker(null, () => { clearTimeout(timer); resolve(); });
    });
  });

  result.observed = await page.evaluate(async () => {
    const {state} = await import('./js/state.js');
    const d=state.curData, m=d.mesh, e=d.r_elevation;
    let land=0, ocean=0, elevMin=Infinity,elevMax=-Infinity,sum=0;
    for(let i=0;i<e.length;i++){
      const v=e[i]; if(v>0) land++; else ocean++;
      if(v<elevMin)elevMin=v;if(v>elevMax)elevMax=v;sum+=v;
    }
    const uniquePlates = new Set(d.r_plate);
    const metrics = window.__terrainMetrics || null;
    const debugKeys = d.debugLayers ? Object.keys(d.debugLayers).sort() : [];
    const sampleIdx=[0,1,2,3,10,100,1000,10000,100000,500000,1000000,1500000,2000000,2500000,2559999,2560000].filter(i=>i<e.length);
    function stats(a) {
      if (!a) return null;
      let min=Infinity,max=-Infinity,sum=0,n=0,nan=0;
      for (let i=0;i<a.length;i++) { const v=a[i]; if(!Number.isFinite(v)){nan++;continue;} if(v<min)min=v;if(v>max)max=v;sum+=v;n++; }
      return {length:a.length,min,max,mean:n?sum/n:null,nan};
    }
    const koppenCounts = {};
    if (d.debugLayers?.koppen) for (const k of d.debugLayers.koppen) koppenCounts[k]=(koppenCounts[k]||0)+1;
    const samples=sampleIdx.map(i=>({
      i,
      xyz:[d.r_xyz[3*i],d.r_xyz[3*i+1],d.r_xyz[3*i+2]],
      plate:d.r_plate[i],
      elev:e[i],
      stress:d.r_stress?.[i] ?? null
    }));
    return {
      seed:d.seed,
      regions:m.numRegions,
      triangles:m.numTriangles,
      land,
      ocean,
      landFraction:land/m.numRegions,
      uniquePlates:uniquePlates.size,
      plateSeeds:d.plateSeeds?.size ?? null,
      oceanPlateCount:d.plateIsOcean?.size ?? null,
      elev:{min:elevMin,max:elevMax,mean:sum/e.length},
      climateComputed:state.climateComputed,
      climate: {
        windSpeedSummer: stats(d.debugLayers?.windSpeedSummer),
        windSpeedWinter: stats(d.debugLayers?.windSpeedWinter),
        precipSummer: stats(d.r_precip_summer),
        precipWinter: stats(d.r_precip_winter),
        tempSummer: stats(d.r_temperature_summer),
        tempWinter: stats(d.r_temperature_winter),
        tempContinentality: stats(d.debugLayers?.tempContinentality),
        koppenCounts
      },
      debugKeys,
      metrics,
      samples
    };
  });

  result.errors=errors;
  result.status='terrain-generated';
  fs.writeFileSync(OUT, JSON.stringify(result,null,2));
  console.log('WROTE',OUT);
} catch (err) {
  result.status='failed';
  result.error=String(err?.stack || err);
  fs.writeFileSync(OUT, JSON.stringify(result,null,2));
  console.error(err);
  process.exitCode=1;
} finally {
  await browser.close().catch(()=>{});
  server.close();
}

// workflow trigger marker
