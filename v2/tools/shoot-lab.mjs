// Screenshot the browser lab with Puppeteer (needs a server: node tuning/dev-server.mjs 8123).
// Usage: node v2/tools/shoot-lab.mjs [phase] [timeMyr] [baseUrl] [extraQuery]  → v2/out/lab_p<phase>_*.png
//        phase defaults to the lab's latest; extraQuery e.g. "scene=india"
// Exits non-zero on any console error, failed request, build error or undersized mobile touch target,
// so it doubles as a smoke test of the page.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'out');
const phase = process.argv[2] || '';
const when = Number(process.argv[3] || 100);
const base = process.argv[4] || 'http://localhost:8123';
const query = [phase && `phase=${phase}`, process.argv[5]].filter(Boolean).join('&');

const browser = await puppeteer.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const problems = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', r => r.failure()?.errorText !== 'net::ERR_ABORTED' && problems.push(   // (aborted = cancelled by our own reload)
    `requestfailed: ${r.url()} (${r.failure()?.errorText})`));

const wait = ms => new Promise(r => setTimeout(r, ms));
async function setTime(t) {
    await page.evaluate(v => {
        const el = document.getElementById('time');
        el.value = v;
        el.dispatchEvent(new Event('input'));
    }, t);
    await wait(700);
}
const shot = name => page.screenshot({ path: path.join(OUT, `lab_p${phase || 'latest'}_${name}.png`) });
async function noteBuildError() {
    const text = await page.$eval('#buildError', el => (el.hidden ? '' : el.textContent.trim())).catch(() => '');
    if (text) problems.push(`build error shown in the page: ${text}`);
}

await page.setViewport({ width: 1500, height: 950 });
await page.goto(`${base}/v2/?${query}`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => document.getElementById('phaseTitle').textContent.startsWith('Phase'), { timeout: 60000 });
await noteBuildError();
await setTime(when);
await shot('globe');
await page.click('#viewSwitch [data-view="map"]');
await wait(300);
await shot('map');
const layerCount = await page.$$eval('#layers button', b => b.length);
for (let i = 1; i < layerCount; i++) {
    await page.click(`#layers button[data-layer="${i}"]`);
    await wait(400);
    await shot(`map_layer${i}`);
}

await page.setViewport({ width: 400, height: 820, isMobile: true, hasTouch: true });
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => document.getElementById('phaseTitle').textContent.startsWith('Phase'), { timeout: 60000 });
await noteBuildError();
await setTime(when);
await shot('mobile');
const smallTargets = await page.$$eval('button, select, input[type="range"], input[type="checkbox"]', els => els
    .filter(el => el.offsetParent !== null)
    .map(el => ({ el, box: (el.closest('label') ?? el).getBoundingClientRect() }))
    .filter(({ box }) => box.height < 43.5)
    .map(({ el, box }) => `${el.id || el.textContent.trim().slice(0, 20)} (${Math.round(box.height)}px)`));
if (smallTargets.length) problems.push(`touch targets under 44px on mobile: ${smallTargets.join(', ')}`);

console.log(problems.length ? problems.join('\n') : 'no console errors, no build error, mobile touch targets ≥ 44px');
await browser.close();
process.exit(problems.length ? 1 : 0);
