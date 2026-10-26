/**
 * Are generated planets loosely Earth-like in their dryness? The climate on the worlds the app makes (lib/gen-planets.mjs:
 * Earth-like and non-Earth-like Generate planets, Evolution worlds, the synthetic test planets), against Earth:
 *
 *   arid (B) and desert (BW) share of the ice-free land, and its mean rain (mm/yr) — with Earth observed (Beck) and
 *   Earth simulated beside them; and "by latitude", the arid share Earth's observed land would have if it lay where the
 *   planet's land lies (each |latitude| band's observed arid fraction, weighted by the planet's land there).
 *
 *   node tuning/climate/planets-dry.mjs [--set KEY=value,…] [--only gen-2,evo-12345] [--climate <snapshot>]
 *   node tuning/climate/planets-dry.mjs --screen 12        rank Generate seeds 1…12 by how Earth-like their land is
 *                                                          (amount and |latitude| placement), at 40K
 */

import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences, truthAt01 } from './lib/ref.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { elevToHeightKm } from '../../js/color-map.js';
import { KOPPEN_CLASSES } from '../../v2/js/climate/koppen.js';
import { GEN_PLANETS, loadGenPlanets, dryness, landStats, placementDistance, v1HeightKm, cellLatDeg, ABS_LAT_BANDS } from './lib/gen-planets.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
// --climate <a snapshot with v2/js/climate/>: run another version's climate on the same planets (e.g. a `git archive`)
const climateBase = arg('--climate', null) ? pathToFileURL(path.resolve(arg('--climate')) + '/').href : new URL('../../', import.meta.url).href;
const { planetClimate } = await import(climateBase + 'v2/js/climate/climate.js');
const { setParams } = await import(climateBase + 'v2/js/climate/config.js');
const argSet = arg('--set', null);
if (argSet) setParams(Object.fromEntries(argSet.split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const pc = (x) => `${(100 * x).toFixed(0).padStart(3)} %`;

// ── Earth: its land placement, and observed / simulated dryness ──
const { gray, width, height } = loadEarthGrayscale();
const e = buildEarthMesh(gray, width, height, { N: 160000 });
const earth = { xyz: e.r_xyz, axes: 'y-up', elevKm: new Float32Array(e.mesh.numRegions) };
for (let r = 0; r < earth.elevKm.length; r++) earth.elevKm[r] = elevToHeightKm(e.r_elevation[r]);
const earthLand = landStats(earth.xyz, earth.elevKm, earth.axes);

if (process.argv.includes('--screen')) {
    const count = +arg('--screen', 12);
    console.log(`Earth: land ${pc(earthLand.landFrac)}, north ${pc(earthLand.northShare)}; land by |latitude| ${ABS_LAT_BANDS.slice(0, -1).map((b, i) => `${b}° ${pc(earthLand.share[i])}`).join(' ')}`);
    const rows = [];
    for (let seed = 1; seed <= count; seed++) {
        const p = v1HeightKm(seed, { N: 40000 }), s = landStats(p.xyz, p.elevKm, p.axes), d = placementDistance(s, earthLand);
        rows.push({ seed, s, d });
        console.log(`  seed ${String(seed).padStart(3)}: land ${pc(s.landFrac)}, north ${pc(s.northShare)}, placement unlike Earth's ${pc(d.tv)} — ${Array.from(s.share, pc).join(' ')}`);
    }
    rows.sort((a, b) => a.d.score - b.d.score);
    console.log(`most Earth-like: ${rows.slice(0, 4).map(r => r.seed).join(', ')} · least: ${rows.slice(-3).map(r => r.seed).join(', ')}`);
    process.exit(0);
}

const { koppen01, fields, grid: rg } = loadReferences();
const n = earth.elevKm.length, lat = cellLatDeg(earth.xyz, earth.axes, n);
const B = ABS_LAT_BANDS.length - 1, bandOf = (a) => { let b = 0; while (b < B - 1 && a >= ABS_LAT_BANDS[b + 1]) b++; return b; };
const yr = new Float64Array(rg.size);
for (let m = 0; m < 12; m++) for (let c = 0; c < rg.size; c++) yr[c] += fields.precip[m * rg.size + c];
const obs = { n: 0, b: 0, bw: 0, p: 0, pn: 0 }, bandN = new Float64Array(B), bandB = new Float64Array(B);
{
    const lon = new Float32Array(n);
    for (let r = 0; r < n; r++) { const x = earth.xyz[3 * r], z = earth.xyz[3 * r + 2]; lon[r] = Math.atan2(x, z) * 180 / Math.PI; }
    for (let r = 0; r < n; r++) {
        if (!(earth.elevKm[r] > 0)) continue;
        const t = truthAt01(koppen01, lat[r], lon[r]); if (!t) continue;
        const code = KOPPEN_CLASSES[t].code; if (code === 'EF') continue;
        obs.n++; const b = bandOf(Math.abs(lat[r])); bandN[b]++;
        if (code[0] === 'B') { obs.b++; bandB[b]++; if (code[1] === 'W') obs.bw++; }
        const p = yr[rg.cellAt(lat[r], lon[r])]; if (p === p) { obs.p += p; obs.pn++; }
    }
}
const bandArid = Array.from(bandN, (v, b) => v ? bandB[b] / v : 0);
const earthObs = { aridShare: obs.b / obs.n, desertShare: obs.bw / obs.n, rainMm: obs.p / obs.pn };

/** The arid share Earth's observed land would have where this planet's ice-free land lies. */
function byLatitude(res, xyz, axes) {
    const k = res.cell.koppen, la = cellLatDeg(xyz, axes, k.length), cnt = new Float64Array(B); let t = 0;
    for (let r = 0; r < k.length; r++) { if (!k[r] || KOPPEN_CLASSES[k[r]].code === 'EF') continue; cnt[bandOf(Math.abs(la[r]))]++; t++; }
    let s = 0; for (let b = 0; b < B; b++) s += cnt[b] / t * bandArid[b];
    return s;
}

const row = (label, d, exp, extra = '') => console.log(`  ${label.padEnd(36)} arid ${pc(d.aridShare)}${exp === null ? '      ' : ` (${pc(exp)})`}  desert ${pc(d.desertShare)}  rain ${d.rainMm.toFixed(0).padStart(5)} mm${extra}`);
console.log('Ice-free land: arid (B) share (by latitude: Earth\'s observed arid share where this land lies), desert (BW), mean rain');
row('Earth observed (Beck)', earthObs, byLatitudeObs());
function byLatitudeObs() { let s = 0; for (let b = 0; b < B; b++) s += bandN[b] / obs.n * bandArid[b]; return s; }
const resE = planetClimate({ xyz: earth.xyz, elevKm: earth.elevKm, axes: earth.axes });
row('Earth simulated', dryness(resE), byLatitude(resE, earth.xyz, earth.axes));

const only = arg('--only', null)?.split(',') ?? null;
const planets = await loadGenPlanets({ only });
let group = null;
for (const p of planets) {
    const g = GEN_PLANETS.find(q => q.key === p.key).group;
    if (g !== group) { group = g; console.log(g); }
    const t0 = performance.now();
    const res = planetClimate({ xyz: p.xyz, elevKm: p.elevKm, axes: p.axes });
    const s = landStats(p.xyz, p.elevKm, p.axes);
    row(p.label, dryness(res), byLatitude(res, p.xyz, p.axes),
        `   land ${pc(s.landFrac)}, unlike Earth's placement ${pc(placementDistance(s, earthLand).tv)} (${(performance.now() - t0).toFixed(0)} ms)`);
}
