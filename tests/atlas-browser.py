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
        await page.route('http://127.0.0.1:8000/', lambda route: route.fulfill(
            body=(ROOT / 'index.html').read_text().replace('step="1" value="600"', 'step="1" value="0"'),
            content_type='text/html'))
        start = time.monotonic()
        await page.goto('http://127.0.0.1:8000/')
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
            return JSON.stringify([d.seed,Array.from(d.r_elevation),Array.from(d.r_temperature_summer||[])]);} """
        before = await page.evaluate(snapshot)
        await page.evaluate("const e=document.querySelector('#atlasEnabled');e.checked=true;e.dispatchEvent(new Event('change'))")
        await page.wait_for_timeout(1500)
        assert await page.evaluate(snapshot) == before, 'Enabling atlas changed physical fields'
        if mobile:
            await page.touchscreen.tap(195, 280)
        else:
            await page.mouse.click(800, 350)
        await page.wait_for_timeout(300)
        global_text = await page.locator('#atlasInfo').text_content()
        assert global_text.startswith('h3:'), global_text
        await page.select_option('#viewMode', 'map', force=True)
        await page.wait_for_timeout(500)
        assert await page.locator('#atlasInfo').text_content() == global_text
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
            'global': global_text, 'regional': regional_text, 'afterDetail': detail_text}, ensure_ascii=False, indent=2))
        await page.screenshot(path=f'/tmp/atlas-{"mobile" if mobile else "desktop"}.png')
        await browser.close()

asyncio.run(main())
