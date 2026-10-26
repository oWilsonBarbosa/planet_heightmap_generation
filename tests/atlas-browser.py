"""Run against python -m http.server 8000. Requires Python playwright + Chromium.
ATLAS_MOBILE=1 selects touch emulation. No dependency is added to the application.
"""
import asyncio
import json
import os
import time
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=os.getenv('CHROMIUM_PATH', '/usr/bin/chromium'),
            args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        mobile = os.getenv('ATLAS_MOBILE') == '1'
        page = await browser.new_page(
            viewport={'width': 390, 'height': 844} if mobile else {'width': 1280, 'height': 800},
            is_mobile=mobile, has_touch=mobile,
            ignore_https_errors=os.getenv('ATLAS_IGNORE_HTTPS_ERRORS') == '1')
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        # Test fixture only: start at minimum Detail, preserving production defaults.
        await page.route('http://127.0.0.1:8000/generate.html', lambda route: route.fulfill(
            body=(ROOT / 'generate.html').read_text().replace('step="1" value="600"', 'step="1" value="0"'),
            content_type='text/html'))
        start = time.monotonic()
        await page.goto('http://127.0.0.1:8000/')
        assert not await page.locator('#sN').count(), 'Studio homepage was replaced by Generate'
        await page.goto('http://127.0.0.1:8000/generate.html')
        for _ in range(120):
            if await page.evaluate("async()=>!!(await import('/js/state.js')).state.curData"):
                break
            await page.wait_for_timeout(1000)
        else:
            raise AssertionError('Planet generation timed out')
        elapsed = time.monotonic() - start
        await page.evaluate("""document.querySelectorAll('#tutorialOverlay,#whatsNewOverlay').forEach(e=>e.classList.add('hidden'));
            document.querySelector('.atlas-panel').open=true;
            document.querySelector('#chkRotate').checked=false;""")
        snapshot = """async()=>{const d=(await import('/js/state.js')).state.curData;
            return JSON.stringify([d.seed,Array.from(d.r_elevation),Array.from(d.climate?.cells?.t?.year||[]),Array.from(d.climate?.cells?.p?.year||[])]);} """
        before = await page.evaluate(snapshot)
        await page.evaluate("const e=document.querySelector('#atlasEnabled');e.checked=true;e.dispatchEvent(new Event('change'))")
        await page.wait_for_timeout(1500)
        assert await page.evaluate(snapshot) == before, 'Enabling atlas changed physical fields'
        globe_target = await page.evaluate("""async()=>{
            const THREE=await import('three'),{state}=await import('/js/state.js');
            const {camera,canvas,ctrl}=await import('/js/scene.js');ctrl.autoRotate=false;
            state.planetMesh.updateMatrixWorld();
            const local=state.planetMesh.worldToLocal(camera.position.clone()).normalize();
            const v=state.planetMesh.localToWorld(local).project(camera),r=canvas.getBoundingClientRect();
            return {x:r.left+(v.x+1)/2*r.width,y:r.top+(1-v.y)/2*r.height};
        }""")
        if mobile:
            await page.touchscreen.tap(globe_target['x'], globe_target['y'])
        else:
            await page.mouse.click(globe_target['x'], globe_target['y'])
        await page.wait_for_timeout(300)
        global_text = await page.locator('#atlasInfo').text_content()
        assert global_text.startswith('h3:'), (global_text, globe_target)
        await page.select_option('#viewMode', 'map', force=True)
        await page.wait_for_timeout(500)
        assert await page.locator('#atlasInfo').text_content() == global_text
        projection_ids = []
        for projection, centre in [('equirect', 0), ('robinson', 0), ('mercator', 0), ('mollweide', 0), ('mollweide', 35)]:
            await page.select_option('#mapProjection', projection, force=True)
            await page.locator('#sMapCenterLon').evaluate("(e, value)=>{e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));}", str(centre))
            await page.wait_for_timeout(200)
            target = await page.evaluate("""async()=>{
                const {state}=await import('/js/state.js'),{P}=await import('/v2/js/view/projections.js');
                const THREE=await import('three'),{mapCamera,canvas}=await import('/js/scene.js');
                const {locate}=await import('/js/world-atlas.js'),p=P[state.mapProjection],o=state.mapProjOpts;
                const bounds=p.bounds(o),a=(bounds[1]-bounds[0])/(bounds[3]-bounds[2]);
                const f=p.fwd(20*Math.PI/180-state.mapCenterLon,10*Math.PI/180,o);
                const v=new THREE.Vector3((f[0]-bounds[0])/(bounds[1]-bounds[0])*2*a-a,(f[1]-bounds[2])/(bounds[3]-bounds[2])*2-1,0).project(mapCamera),r=canvas.getBoundingClientRect();
                return {x:r.left+(v.x+1)/2*r.width,y:r.top+(1-v.y)/2*r.height,id:'h3:'+locate(10,20)};
            }""")
            if mobile:
                await page.touchscreen.tap(target['x'], target['y'])
            else:
                await page.mouse.click(target['x'], target['y'])
            await page.wait_for_timeout(100)
            text = await page.locator('#atlasInfo').text_content()
            assert text.splitlines()[0] == target['id'], (projection, text, target)
            projection_ids.append({'projection': projection, 'centreLon': centre, 'id': text.splitlines()[0]})
        global_text = await page.locator('#atlasInfo').text_content()
        assert await page.evaluate(snapshot) == before, 'Projection selection changed physical fields'
        await page.select_option('#atlasLevel', 'regional', force=True)
        regional_text = await page.locator('#atlasInfo').text_content()
        assert 'Nível H3 3' in regional_text
        assert next(x for x in global_text.splitlines() if x.startswith('Referência global:')) == next(
            x for x in regional_text.splitlines() if x.startswith('Referência global:'))
        await page.evaluate("""async()=>{const {state}=await import('/js/state.js');
            const {generate}=await import('/js/generate.js');document.querySelector('#sN').value='400';
            generate(state.curData.seed,[],()=>{},false)}""")
        for _ in range(120):
            if await page.evaluate("async()=>(await import('/js/state.js')).state.curData.r_elevation.length>5001"):
                break
            await page.wait_for_timeout(1000)
        else:
            raise AssertionError('Detail rebuild timed out')
        await page.wait_for_timeout(500)
        detail_text = await page.locator('#atlasInfo').text_content()
        assert detail_text.splitlines()[0] == regional_text.splitlines()[0]
        assert 'Δ após Detail' in detail_text
        assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
        assert not errors, errors
        print(json.dumps({'mobile': mobile, 'initialLoadAndGenerationSeconds': elapsed,
            'heapBytes': await page.evaluate('performance.memory?.usedJSHeapSize'),
            'global': global_text, 'regional': regional_text, 'afterDetail': detail_text,
            'projections': projection_ids}, ensure_ascii=False, indent=2))
        await page.screenshot(path=f'/tmp/atlas-{"mobile" if mobile else "desktop"}.png')
        await browser.close()

asyncio.run(main())
