// Browser E2E: actual Generate, Import and saved Evolution planet workflows.
// Distinct from the faster 6-page initialization smoke and numerical acceptance tests.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { encodePlanetCode } from '../js/planet-code.js';

const BASE = process.env.SITE_BASE ?? 'http://127.0.0.1:8765';
const browser = await chromium.launch({
  headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader','--disable-gpu-sandbox']
});
const options={jitter:0.4,P:12,numContinents:3,roughness:0.2,terrainWarp:0.25,
  smoothing:0.25,glacialErosion:0,hydraulicErosion:0.2,thermalErosion:0.1,
  ridgeSharpening:0.2,soilCreep:0.75,continentSizeVariety:0,
  greenhouse:0,precipitationOffset:0,landCoverage:0.3};
const code=seed=>encodePlanetCode(seed,5000,options.jitter,options.P,options.numContinents,
  options.roughness,options.terrainWarp,options.smoothing,options.glacialErosion,
  options.hydraulicErosion,options.thermalErosion,options.ridgeSharpening,
  options.soilCreep,options.continentSizeVariety,options.greenhouse,
  options.precipitationOffset,options.landCoverage);
mkdirSync('browser-interactions',{recursive:true});

async function open(page,url){
  const response=await page.goto(BASE+url,{waitUntil:'domcontentloaded',timeout:45000});
  assert.equal(response?.status(),200,'page must exist: '+url);
}
function capture(page){
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  return errors;
}
async function finishedMap(page,name){
  await page.waitForFunction(()=>{
    const map=document.querySelector('#mapTabs [data-layer="satellite"]');
    return !!map && !map.classList.contains('locked');
  },null,{timeout:120000});
  console.log('PASS FINISH',name,'satellite unlocked');
}
async function screenshot(page,name){
  await page.screenshot({path:'browser-interactions/'+name+'.png',fullPage:false});
}

try{
  // Use a real, small valid planet code so the page automatically builds at 5K.
  const generate=await browser.newPage({viewport:{width:1366,height:768}});
  const errsG=capture(generate);
  await generate.addInitScript(()=>{
    localStorage.setItem('atlas-engine-tutorial-seen','1');
    localStorage.setItem('wo-whatsnew-seen','8');
    localStorage.setItem('wo-survey-dismissed','1');
  });
  const first=code(4242),second=code(4243);
  await open(generate,'/generate.html?gpu=0#'+first);
  await generate.waitForFunction(()=>document.querySelector('#stats')?.textContent?.includes('Regions:'),null,{timeout:120000});
  await finishedMap(generate,'Generate 4242');
  assert.equal(await generate.locator('#seedCode').inputValue(),first);
  await screenshot(generate,'generated-small-world');
  // Actually load a different planet code via the visible page control.
  await generate.locator('#seedCode').fill(second);
  await generate.locator('#loadBtn').click({timeout:15000});
  await generate.waitForFunction(expected=>document.location.hash.slice(1)===expected
    && document.querySelector('#generate')?.disabled===false,second,{timeout:120000});
  await finishedMap(generate,'Generate code reload');
  assert.equal(await generate.locator('#seedCode').inputValue(),second);
  assert.deepEqual(errsG,[],'Generate page errors');
  console.log('PASS GENERATE',first,second);
  await generate.close();

  // Ignore the automatic Earth preview; upload and import a synthetic 2:1 grayscale PNG.
  const imported=await browser.newPage({viewport:{width:1366,height:768}});
  const errsI=capture(imported);
  await imported.route('**/assets/earth.png',r=>r.abort());
  await open(imported,'/import.html?gpu=0');
  await imported.locator('#mapCanvas').waitFor({state:'attached',timeout:30000});
  const dataUrl=await imported.evaluate(()=>{
    const c=document.createElement('canvas');c.width=128;c.height=64;
    const x=c.getContext('2d');
    const grad=x.createLinearGradient(0,0,128,0);
    grad.addColorStop(0,'#000000');grad.addColorStop(0.5,'#e0e0e0');
    grad.addColorStop(1,'#404040');x.fillStyle=grad;x.fillRect(0,0,128,64);
    return c.toDataURL('image/png');
  });
  const png=Buffer.from(dataUrl.split(',')[1],'base64');
  await imported.locator('#heightmapFile').setInputFiles({name:'synthetic-2to1.png',mimeType:'image/png',buffer:png});
  await imported.waitForFunction(()=>!document.querySelector('#importBtn')?.disabled,null,{timeout:30000});
  await imported.locator('#sN').evaluate(el=>{
    el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await imported.locator('#importBtn').click({timeout:15000});
  await imported.waitForFunction(()=>document.querySelector('#stats')?.textContent?.includes('Regions:'),
    null,{timeout:120000});
  await finishedMap(imported,'Import synthetic PNG');
  assert.match(await imported.locator('#importFileName').textContent(),/synthetic-2to1.png/);
  assert.deepEqual(errsI,[],'Import page errors');
  await screenshot(imported,'imported-synthetic-heightmap');
  console.log('PASS IMPORT','synthetic 128x64 grayscale heightmap');
  await imported.close();

  // Load an actual historical on-disk .orogen fixture, rather than only checking HTML.
  const evolution=await browser.newPage({viewport:{width:1366,height:768}});
  const errsE=capture(evolution);
  await evolution.addInitScript(()=>localStorage.setItem('orogen.evolution.tutorial-seen','1'));
  await open(evolution,'/evolution.html?gpu=0&seed=4242&len=300&sim=20000&terrain=160000');
  await evolution.locator('#timeSlider').waitFor({state:'attached',timeout:30000});
  // The Evolution script adds its file-change listener before it starts the initial build.
  await evolution.waitForTimeout(1000);
  const historical='v2/tools/fixtures/saves/format1-frame1-finish1-codec1.orogen';
  await evolution.locator('#loadFile').setInputFiles(historical);
  await evolution.waitForFunction(()=>{
    const status=document.querySelector('#buildStatus')?.textContent??'';
    if(status.includes('Could not open'))throw new Error(status);
    return status.includes('Opened format1-frame1-finish1-codec1.orogen');
  },null,{timeout:120000});
  assert.deepEqual(errsE,[],'Evolution page errors');
  await screenshot(evolution,'opened-historical-orogen');
  console.log('PASS EVOLUTION FILE',historical);
  await evolution.close();
} finally {
  await browser.close();
}
