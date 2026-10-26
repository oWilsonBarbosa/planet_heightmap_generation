// Debug helper: open a lab phase and scene in headless Chrome, press Play, and report how playback goes — the time shown
// each few seconds, the frame actually painted, and the page's long tasks (the main thread busy for over 200 ms: the page
// frozen that long). PROFILE=file saves a CPU profile of the page's thread while playing; EXTRA=query adds to the URL.
// Usage: node v2/tools/probe-play.mjs [phase] [scene] [seconds] [baseUrl]   (needs the dev server)

import puppeteer from 'puppeteer';

const [phase = '8b', scene = 'history', seconds = '40', base = 'http://localhost:8123'] = process.argv.slice(2);
const browser = await puppeteer.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage(), problems = [];
page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
await page.setViewport({ width: 1500, height: 950 });
const t0 = Date.now();
await page.goto(`${base}/v2/?phase=${phase}&scene=${scene}${process.env.EXTRA ? '&' + process.env.EXTRA : ''}`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => document.getElementById('phaseTitle').textContent.startsWith('Phase'), { timeout: 300000 });
console.log(`loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await page.evaluate(() => {
    window.__long = [];
    new PerformanceObserver(list => { for (const e of list.getEntries()) window.__long.push(e.duration); }).observe({ entryTypes: ['longtask'] });
});
await page.evaluate(() => { const el = document.getElementById('time'); el.value = el.min; el.dispatchEvent(new Event('input')); });
await new Promise(r => setTimeout(r, 1500));
const cdp = process.env.PROFILE ? await page.target().createCDPSession() : null;
if (cdp) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
await page.keyboard.press('Space');
const rows = [];
for (let s = 0; s < Number(seconds); s += 4) {
    await new Promise(r => setTimeout(r, 4000));
    const { t, shown, busy, longs } = await page.evaluate(() => ({ t: document.getElementById('time').value, shown: document.getElementById('timeLabel').textContent,
        busy: document.getElementById('busy').hidden ? '' : document.getElementById('busy').textContent, longs: window.__long.splice(0) }));
    rows.push(`${String(s + 4).padStart(3)} s: time ${t} Myr, showing ${shown}${busy ? ` (${busy})` : ''} · ${longs.length} long tasks${longs.length ? ` (longest ${Math.max(...longs).toFixed(0)} ms, ${longs.reduce((a, b) => a + b, 0).toFixed(0)} ms in all)` : ''}`);
}
console.log(rows.join('\n'));
if (cdp) { const { profile } = await cdp.send('Profiler.stop'); (await import('node:fs')).writeFileSync(process.env.PROFILE, JSON.stringify(profile)); console.log(`page-thread profile → ${process.env.PROFILE}`); }
if (problems.length) console.log(problems.join('\n'));
await browser.close();
