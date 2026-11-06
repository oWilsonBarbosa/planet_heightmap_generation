/**
 * Where the rain's seasons make the climate class, Earth against the observed (Beck et al. 2023), and the generated
 * worlds' wet tropics and coasts — the causes behind glance-check.mjs's numbers:
 *   1. Earth, winter and summer rain (mm/month) and the driest month, simulated / observed: the subtropical east coasts
 *      (Cfa needs a wet winter, else Cw), the Mediterranean coasts (Cs needs a wet winter and a dry summer), the wet
 *      tropics (Af needs no dry month);
 *   2. Earth and the generated worlds: land within 12° of the equator by distance from the sea — its share, rain, height
 *      and months with ≥ 60 mm (Af's threshold); and how many coasts are walled by mountains (cell mean ≥ 1 km and
 *      ≥ 2 km within ≈ 300 km inland).
 *
 *   node tuning/climate/diag-rain-seasons.mjs [--set KEY=value,…] [--planets gen-2,gen-6,gen-10,gen-1c|none]
 */

import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences } from './lib/ref.mjs';
import { loadGenPlanets } from './lib/gen-planets.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { planetClimate } from '../../v2/js/climate/climate.js';
import { setParams } from '../../v2/js/climate/config.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
if (arg('--set')) setParams(Object.fromEntries(arg('--set').split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const keys = arg('--planets', 'gen-2,gen-6,gen-10,gen-1c');
const fx = (x, p = 4) => (x === x ? x.toFixed(0) : '—').padStart(p);

// 1. Earth's seasons in the boxes where they decide the class
const { grid, fields: obs, land: obsLand } = loadReferences();
const { gray, width, height } = loadEarthGrayscale();
const e = buildEarthMesh(gray, width, height, { N: 160000 });
const earth = { key: 'earth', label: 'Earth', xyz: e.r_xyz, elevKm: Float32Array.from(e.r_elevation, v => elevToHeightKm(v)), axes: 'y-up' };
earth.res = planetClimate(earth);
{
    const G = grid.size, w = grid.w, S = earth.res.surface, P = earth.res.months.P;
    const box = ([la0, la1, lo0, lo1], f) => {
        let s = 0, k = 0;
        for (let j = 0; j < grid.h; j++) {
            const la = grid.lat[j]; if (la < la0 || la >= la1) continue;
            const wt = Math.cos(la * Math.PI / 180);
            for (let i = 0; i < w; i++) {
                const lo = grid.lon[i], c = j * w + i;
                if (lo < lo0 || lo >= lo1 || !obsLand[c] || S.landFrac[c] < 0.5) continue;
                const v = f(c); if (v === v) { s += wt * v; k += wt; }
            }
        }
        return s / k;
    };
    const season = (b, F, ms) => ms.reduce((a, m) => a + box(b, c => F[m * G + c]), 0) / ms.length;
    const driest = (b, F) => Math.min(...Array.from({ length: 12 }, (_, m) => box(b, c => F[m * G + c])));
    const DJF = [11, 0, 1], JJA = [5, 6, 7];
    const REGIONS = [
        ['subtropical east coasts (Cfa)'],
        ['SE United States', [29, 37, -92, -76], 'N'], ['SE China', [23, 31, 108, 122], 'N'], ['S Japan', [31, 36, 130, 141], 'N'],
        ['E Australia', [-34, -25, 148, 154], 'S'], ['S Brazil / Uruguay', [-34, -24, -58, -48], 'S'], ['Natal', [-31, -26, 29, 33], 'S'],
        ['Mediterranean coasts (Cs)'],
        ['California', [33, 40, -123, -117], 'N'], ['Iberia / Italy / Greece', [36, 42, -9, 24], 'N'], ['central Chile', [-38, -30, -73, -70], 'S'],
        ['SW Australia', [-35, -30, 114, 119], 'S'], ['Cape', [-35, -32, 17, 21], 'S'],
        ['wet tropics (Af, Am); "winter" = Dec–Feb'],
        ['Amazon west', [-8, 2, -75, -62], 'N'], ['Amazon east', [-6, 0, -62, -50], 'N'], ['Congo basin', [-4, 3, 15, 27], 'N'],
        ['Borneo / Sumatra', [-3, 4, 100, 118], 'N'],
    ];
    console.log('Earth, rain (mm/month) simulated / observed:     winter          summer          driest month');
    for (const [name, b, h] of REGIONS) {
        if (!b) { console.log(`  ${name}`); continue; }
        const win = h === 'N' ? DJF : JJA, sum = h === 'N' ? JJA : DJF;
        console.log(`    ${name.padEnd(42)} ${fx(season(b, P, win))} / ${fx(season(b, obs.precip, win))}     ${fx(season(b, P, sum))} / ${fx(season(b, obs.precip, sum))}     ${fx(driest(b, P))} / ${fx(driest(b, obs.precip))}`);
    }
}

// 2. Equatorial land by distance from the sea; walled coasts
const planets = [earth, ...(keys === 'none' ? [] : await loadGenPlanets({ only: keys.split(','), log: () => {} }))];
const BINS = [0, 300, 800, 1500, 2500, Infinity];
console.log('\nLand within 12° of the equator by distance from the sea: share % · rain mm/yr · height km · months ≥ 60 mm');
console.log(''.padEnd(26) + BINS.slice(0, -1).map((b, k) => `${b}–${BINS[k + 1] === Infinity ? '' : BINS[k + 1]} km`.padEnd(24)).join('') + 'coasts walled ≥ 1 / ≥ 2 km');
for (const p of planets) {
    const res = p.res ?? planetClimate({ xyz: p.xyz, elevKm: p.elevKm, axes: p.axes });
    const g = res.grid, G = g.size, w = g.w, h = g.h, S = res.surface, land = (c) => S.landFrac[c] >= 0.5;
    // distance from the sea (km): a breadth-first sweep over the grid, good enough for these bins
    const dist = new Float32Array(G).fill(Infinity), q = [];
    for (let c = 0; c < G; c++) if (!land(c)) { dist[c] = 0; q.push(c); }
    const kmLat = 111.2 * 180 / h;
    for (let qi = 0; qi < q.length; qi++) {
        const c = q[qi], j = Math.floor(c / w), i = c % w, kmLon = 111.2 * 360 / w * Math.cos(g.lat[j] * Math.PI / 180);
        for (const [n, d] of [[j * w + (i + 1) % w, kmLon], [j * w + (i - 1 + w) % w, kmLon], [j > 0 ? c - w : -1, kmLat], [j < h - 1 ? c + w : -1, kmLat]]) {
            if (n < 0 || dist[n] <= dist[c] + d) continue;
            dist[n] = dist[c] + d; q.push(n);
        }
    }
    const bins = BINS.slice(0, -1).map(() => ({ wt: 0, rain: 0, km: 0, wet: 0 }));
    let coast = 0, wall1 = 0, wall2 = 0;
    for (let j = 1; j < h - 1; j++) {
        const la = g.lat[j], cw = Math.cos(la * Math.PI / 180);
        for (let i = 0; i < w; i++) {
            const c = j * w + i; if (!land(c)) continue;
            if (Math.abs(la) < 12) {
                const o = bins[BINS.findIndex((x, k) => dist[c] >= x && dist[c] < BINS[k + 1])];
                let r = 0, wet = 0; for (let m = 0; m < 12; m++) { const pm = res.months.P[m * G + c]; r += pm; if (pm >= 60) wet++; }
                o.wt += cw; o.rain += cw * r; o.km += cw * (S.meanLandKm[c] || 0); o.wet += cw * wet;
            }
            // a coastal cell (a sea neighbour), equatorward of 65°: the highest land within ≈ 300 km
            if (Math.abs(la) > 65 || ![j * w + (i + 1) % w, j * w + (i - 1 + w) % w, c - w, c + w].some(n => !land(n))) continue;
            const R = Math.max(1, Math.round(3 / Math.max(cw, 0.3)));
            let mx = 0;
            for (let dj = -3; dj <= 3; dj++) for (let di = -R; di <= R; di++) {
                const jj = j + dj; if (jj < 0 || jj >= h) continue;
                const n = jj * w + (i + di + w) % w;
                if (land(n) && S.meanLandKm[n] > mx) mx = S.meanLandKm[n];
            }
            coast += cw; if (mx >= 1) wall1 += cw; if (mx >= 2) wall2 += cw;
        }
    }
    const tot = bins.reduce((a, o) => a + o.wt, 0);
    console.log(`  ${p.label.slice(0, 24).padEnd(24)}` + bins.map(o => o.wt ? `${fx(100 * o.wt / tot, 3)} ${fx(o.rain / o.wt, 5)} ${(o.km / o.wt).toFixed(2).padStart(5)} ${(o.wet / o.wt).toFixed(1).padStart(4)}    ` : '   —'.padEnd(24)).join('') +
        `${fx(100 * wall1 / coast, 3)} / ${fx(100 * wall2 / coast, 2)} %`);
}
