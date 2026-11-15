// Headless browser initialization smoke. The physical planet checks run separately in Node.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base=process.env.SITE_BASE??'http://127.0.0.1:8765';
const browser=await chromium.launch({
  headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox']
});
mkdirSync('browser-smoke',{recursive:true});
try{
  for(const device of [
    {name:'desktop',viewport:{width:1366,height:768},isMobile:false,hasTouch:false},
    {name:'mobile',viewport:{width:390,height:844},isMobile:true,hasTouch:true}
  ]){
    const context=await browser.newContext({viewport:device.viewport,isMobile:device.isMobile,hasTouch:device.hasTouch});
    for(const tool of ['generate','import','evolution']){
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      const response=await page.goto(base+'/'+tool+'.html?gpu=0',{waitUntil:'domcontentloaded',timeout:35000});
      assert.equal(response?.status(),200,tool+' HTML must be served');
      await page.locator('#canvas').waitFor({state:'attached',timeout:15000});
      await page.locator('#generate, #importBtn').first().waitFor({state:'attached',timeout:15000});
      // Generate and Import add their map canvas from their ES modules.
      if(tool!=='evolution'){
        await page.waitForFunction(()=>document.querySelector('#mapCanvas')!==null,null,{timeout:40000});
      } else {
        await page.locator('#timeSlider').waitFor({state:'attached',timeout:15000});
      }
      if(tool==='generate') {
        const copy=await page.locator('#whatsNewCard').textContent();
        assert.match(copy,/Salt lakes and salt pans/);
        assert.match(copy,/Evolution's drainage defaults are unchanged/);
      }
      await page.waitForTimeout(1200);
      assert.deepEqual(errors,[],tool+' '+device.name+' JavaScript errors');
      await page.screenshot({path:'browser-smoke/'+tool+'-'+device.name+'.png',fullPage:false});
      console.log('PASS UI',tool,device.name,'no uncaught page errors');
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}
