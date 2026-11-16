/**
 * The glance test (lib/glance.mjs) on the Köppen maps that render-koppen-maps.mjs draws: each map's metrics, read back
 * from its class colours, and its glance error — the mean distance from Earth's observed map on the lines that most
 * mislead the eye (arid share, rain forest at the equator, arid subtropical and mid-latitude east coasts, Mediterranean
 * west coasts), each counted by how much land it covers.
 *
 *   node tuning/climate/render-koppen-maps.mjs --tag <name> [--tests]
 *   node tuning/climate/glance-check.mjs --tag <name>        → a table, and <maps>/<name>/glance.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { KOPPEN_CLASSES } from '../../v2/js/climate/koppen.js';
import { glanceMetrics, glanceError, GLANCE_COLUMNS } from './lib/glance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DIR = path.join(__dirname, '..', 'results', 'climate', 'maps', arg('--tag', 'now'));
if (!fs.existsSync(DIR)) { console.error(`No maps in ${DIR}: run render-koppen-maps.mjs --tag <name> first`); process.exit(1); }

const rgb = (r, g, b) => (r << 16) | (g << 8) | b;
const fromColour = new Map(KOPPEN_CLASSES.map((k, i) => [rgb(...k.color.map(v => Math.round(255 * v))), i]));
function measure(file) {
    const png = PNG.sync.read(fs.readFileSync(file));
    const cls = new Uint8Array(png.width * png.height);
    for (let i = 0; i < cls.length; i++) cls[i] = fromColour.get(rgb(png.data[4 * i], png.data[4 * i + 1], png.data[4 * i + 2])) ?? 0;
    return glanceMetrics(cls, png.width, png.height);
}

const ORDER = ['earth-observed', 'earth'];
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4))
    .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));
const ref = files.includes('earth-observed') ? measure(path.join(DIR, 'earth-observed.png')) : null;
const W0 = 20, wc = (c) => Math.max(8, c.length + 1);
console.log(`glance test, ${path.relative(process.cwd(), DIR)} (% of ice-free land; columns: lib/glance.mjs)`);
console.log(''.padEnd(W0) + GLANCE_COLUMNS.map(c => c.padStart(wc(c))).join('') + (ref ? '   error' : ''));
const out = {};
for (const f of files) {
    const m = f === 'earth-observed' ? ref : measure(path.join(DIR, f + '.png'));
    const e = ref ? glanceError(m, ref) : null;
    out[f] = { ...m.values, error: e?.err };
    console.log(f.padEnd(W0) + GLANCE_COLUMNS.map(c => (Number.isFinite(m.values[c]) ? (100 * m.values[c]).toFixed(0) : '—').padStart(wc(c))).join('')
        + (e ? (100 * e.err).toFixed(1).padStart(8) : ''));
}
fs.writeFileSync(path.join(DIR, 'glance.json'), JSON.stringify(out, null, 1));
