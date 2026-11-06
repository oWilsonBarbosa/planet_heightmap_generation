/**
 * The glance test: what a viewer sees on the Köppen maps of Earth and of the generated worlds, measured on the PNGs that
 * render-koppen-maps.mjs draws (their class colours read back to classes), equirectangular, area-weighted. Earth's
 * observed map is the target the worlds should look like, not match cell by cell: how much land is arid, whether the
 * equator is rain forest, whether a subtropical desert gives way to a humid east coast, whether the west coasts at
 * 30–45° are Mediterranean.
 *
 *   node tuning/climate/render-koppen-maps.mjs --tag <name> [--tests]
 *   node tuning/climate/glance-check.mjs --tag <name>
 *
 * Columns (shares of ice-free land unless said, %):
 *   arid, desert         B, BW
 *   Cs, Cw, Dw           dry-summer temperate, dry-winter temperate and cold
 *   Af+Am                tropical rain forest and monsoon forest
 *   E<60                 polar classes (ET, EF) equatorward of 60°, of all land
 *   eq wet, eq arid      Af+Am and B within 10° of the equator
 *   sub W/E/in arid      B at 15–35°: west coasts, east coasts, interiors
 *   mid W/E/in arid      B at 35–60° (polar classes aside)
 *   mid W marit          Cfb, Cfc, Csb, Csc on the west coasts at 35–60°
 *   Cs W                 Cs on the west coasts at 30–45°
 * A west coast is land within 300 km of the sea to its west (along the parallel) with at least 800 km of land to its east;
 * an east coast the mirror; an interior at least 800 km from the sea both ways.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { KOPPEN_CLASSES } from '../../v2/js/climate/koppen.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DIR = path.join(__dirname, '..', 'results', 'climate', 'maps', arg('--tag', 'now'));
if (!fs.existsSync(DIR)) { console.error(`No maps in ${DIR}: run render-koppen-maps.mjs --tag <name> first`); process.exit(1); }

const rgb = (r, g, b) => (r << 16) | (g << 8) | b;
const fromColour = new Map(KOPPEN_CLASSES.map((k, i) => [rgb(...k.color.map(v => Math.round(255 * v))), i]));
const code = KOPPEN_CLASSES.map(k => k.code);
const starts = (k, pre) => pre.some(p => code[k].startsWith(p));
const COAST_KM = 300, LAND_KM = 800;

function measure(file) {
    const png = PNG.sync.read(fs.readFileSync(file)), W = png.width, H = png.height;
    const cls = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) cls[i] = fromColour.get(rgb(png.data[4 * i], png.data[4 * i + 1], png.data[4 * i + 2])) ?? 0;
    const acc = {};
    const add = (name, w, v) => { const o = acc[name] ??= [0, 0]; o[0] += w * v; o[1] += w; };
    for (let y = 0; y < H; y++) {
        const lat = 90 - (y + 0.5) * 180 / H, al = Math.abs(lat), w = Math.cos(lat * Math.PI / 180);
        const kmPx = 360 / W * 111.2 * w, row = y * W;
        let anySea = false;
        for (let x = 0; x < W; x++) if (!cls[row + x]) { anySea = true; break; }
        for (let x = 0; x < W; x++) {
            const k = cls[row + x]; if (!k) continue;
            // distance to the sea along the parallel, westward and eastward (wrapping)
            let dW = Infinity, dE = Infinity;
            if (anySea) {
                let a = 1; while (cls[row + (x - a + W) % W]) a++;
                let b = 1; while (cls[row + (x + b) % W]) b++;
                dW = a * kmPx; dE = b * kmPx;
            }
            const B = starts(k, ['B']) ? 1 : 0, polar = starts(k, ['E']);
            if (al < 60) add('E<60', w, polar ? 1 : 0);
            if (code[k] === 'EF') continue;                        // the rest: ice-free land
            add('arid', w, B); add('desert', w, starts(k, ['BW']) ? 1 : 0);
            add('Cs', w, starts(k, ['Cs']) ? 1 : 0); add('Cw', w, starts(k, ['Cw']) ? 1 : 0); add('Dw', w, starts(k, ['Dw']) ? 1 : 0);
            add('Af+Am', w, starts(k, ['Af', 'Am']) ? 1 : 0);
            if (al < 10) { add('eq wet', w, starts(k, ['Af', 'Am']) ? 1 : 0); add('eq arid', w, B); }
            const west = dW <= COAST_KM && dE >= LAND_KM, east = dE <= COAST_KM && dW >= LAND_KM, inner = dW >= LAND_KM && dE >= LAND_KM;
            if (al >= 15 && al < 35) {
                if (west) add('sub W arid', w, B);
                if (east) add('sub E arid', w, B);
                if (inner) add('sub in arid', w, B);
            }
            if (al >= 35 && al < 60 && !polar) {
                if (west) { add('mid W arid', w, B); add('mid W marit', w, ['Cfb', 'Cfc', 'Csb', 'Csc'].includes(code[k]) ? 1 : 0); }
                if (east) add('mid E arid', w, B);
                if (inner) add('mid in arid', w, B);
            }
            if (al >= 30 && al < 45 && west) add('Cs W', w, starts(k, ['Cs']) ? 1 : 0);
        }
    }
    return Object.fromEntries(Object.entries(acc).map(([n, [s, wt]]) => [n, wt ? s / wt : NaN]));
}

const COLS = ['arid', 'desert', 'Cs', 'Cw', 'Dw', 'Af+Am', 'E<60', 'eq wet', 'eq arid', 'sub W arid', 'sub E arid', 'sub in arid',
    'mid W arid', 'mid E arid', 'mid in arid', 'mid W marit', 'Cs W'];
const ORDER = ['earth-observed', 'earth'];
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4))
    .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));
const W0 = 15, WC = 8;
console.log(`glance test, ${path.relative(process.cwd(), DIR)} (% of ice-free land; see the header for each column)`);
console.log(''.padEnd(W0) + COLS.map(c => c.padStart(Math.max(WC, c.length + 1))).join(''));
const out = {};
for (const f of files) {
    const r = measure(path.join(DIR, f + '.png'));
    out[f] = r;
    console.log(f.padEnd(W0) + COLS.map(c => (r[c] === r[c] ? (100 * r[c]).toFixed(0) : '—').padStart(Math.max(WC, c.length + 1))).join(''));
}
fs.writeFileSync(path.join(DIR, 'glance.json'), JSON.stringify(out, null, 1));
