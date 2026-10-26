/**
 * Phase 7 — the new climate on Evolution's planets: the V2 engine's whole-planet history, its last frame's terrain
 * (z north, heights in km), through planetClimate(). What physics expects of any planet: deserts under the
 * subtropical highs and in the lee of ranges, wet tropics, a supercontinent's interior dry and continental, the same
 * climate at 160K and 640K terrain cells; and the time it takes.
 *
 *   node tuning/climate/evolution-check.mjs [--seed 12345] [--endings none,supercontinent]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Delaunator from 'delaunator';
import { setDelaunator } from '../../js/sphere-mesh.js';
import { evolutionWorld } from '../../v2/js/climate-lab/evolution-world.js';
import { planetClimate } from '../../v2/js/climate/climate.js';
import { KOPPEN_CLASSES } from '../../v2/js/climate/koppen.js';

setDelaunator(Delaunator);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'results', 'climate');
const LAB_DIR = path.join(__dirname, 'data', 'lab');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SEED = +arg('--seed', 12345), ENDINGS = arg('--endings', 'none,supercontinent').split(',');
const pc = (x) => `${(100 * x).toFixed(0)} %`;

/** Area share of each major group (A–E) and of each class on land, and a few latitude bands. */
function summarise(res) {
    const k = res.cell.koppen, lat = res.cell.lat, n = k.length;
    const groups = { A: 0, B: 0, C: 0, D: 0, E: 0 }, classes = {};
    const band = (a, b) => ({ a, b, n: 0, arid: 0, wet: 0 });
    const bands = [band(-10, 10), band(15, 35), band(-35, -15), band(40, 60), band(-60, -40)];
    let landN = 0;
    for (let r = 0; r < n; r++) {
        if (!k[r]) continue;
        landN++;
        const code = KOPPEN_CLASSES[k[r]].code;
        groups[code[0]]++; classes[code] = (classes[code] ?? 0) + 1;
        for (const b of bands) if (lat[r] >= b.a && lat[r] < b.b) { b.n++; if (code[0] === 'B') b.arid++; if (code === 'Af' || code === 'Am' || code[0] === 'C' && code[1] === 'f') b.wet++; }
    }
    for (const g of Object.keys(groups)) groups[g] /= landN;
    for (const c of Object.keys(classes)) classes[c] /= landN;
    return { landN, groups, classes, bands: bands.map(b => ({ lat: `${b.a}…${b.b}`, land: b.n / landN, arid: b.n ? b.arid / b.n : NaN, wet: b.n ? b.wet / b.n : NaN })) };
}

const out = { seed: SEED, worlds: {} };
for (const ending of ENDINGS) {
    const W = evolutionWorld({ seed: SEED, ending, cells: 160000 });
    const t0 = performance.now();
    const res = planetClimate({ xyz: W.xyz, elevKm: W.heightKm, axes: 'z-up' });
    const ms = performance.now() - t0;
    const S = summarise(res);
    // interior vs coast: land cells far from the sea (> 1500 km by the 1° grid's land fraction around them) — the
    // interior of a supercontinent should be drier and more continental than its coasts
    const g = res.grid, lf = res.surface.landFrac, G = g.size;
    const inland = new Uint8Array(G), R = 13;                                  // ≈ 1500 km at 1°
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
        let all = true;
        for (let dj = -R; dj <= R && all; dj += 3) for (let di = -R; di <= R && all; di += 3) {
            const jj = j + dj; if (jj < 0 || jj >= g.h) continue;
            if (lf[jj * g.w + ((i + Math.round(di / Math.max(0.2, Math.cos(g.lat[j] * Math.PI / 180))) + 10 * g.w) % g.w)] < 0.5) all = false;
        }
        inland[j * g.w + i] = all ? 1 : 0;
    }
    let inN = 0, inArid = 0, coN = 0, coArid = 0, inSwing = 0, coSwing = 0;
    const T = res.months.T;
    for (let r = 0; r < res.cell.koppen.length; r++) {
        const kk = res.cell.koppen[r]; if (!kk) continue;
        const c = g.cellAt(res.cell.lat[r], res.cell.lon[r]);
        if (Math.abs(res.cell.lat[r]) > 60) continue;
        let tmax = -1e9, tmin = 1e9; for (let m = 0; m < 12; m++) { const v = T[m * G + c]; if (v > tmax) tmax = v; if (v < tmin) tmin = v; }
        const arid = KOPPEN_CLASSES[kk].code[0] === 'B' ? 1 : 0;
        if (inland[c]) { inN++; inArid += arid; inSwing += tmax - tmin; } else { coN++; coArid += arid; coSwing += tmax - tmin; }
    }
    const inter = { inlandShare: inN / (inN + coN), inlandArid: inArid / inN, coastArid: coArid / coN, inlandSwing: inSwing / inN, coastSwing: coSwing / coN };
    // the same world at 640K terrain cells: the class shares must agree
    const W6 = evolutionWorld({ seed: SEED, ending, cells: 640000 });
    const res6 = planetClimate({ xyz: W6.xyz, elevKm: W6.heightKm, axes: 'z-up' });
    const S6 = summarise(res6);
    let tv = 0; for (const c of new Set([...Object.keys(S.classes), ...Object.keys(S6.classes)])) tv += Math.abs((S.classes[c] ?? 0) - (S6.classes[c] ?? 0)) / 2;
    console.log(`\nEvolution world, seed ${SEED}, ending "${ending}" — ${W.timeMyr} Myr${ending !== 'none' ? (W.reachedEnding ? ' (reached)' : ' (not reached)') : ''}; land ${pc(W.landShare)} of the planet; history ${(W.ms.history / 1000).toFixed(0)} s, terrain ${(W.ms.terrain / 1000).toFixed(1)} s, climate ${ms.toFixed(0)} ms`);
    console.log(`  groups: ${Object.entries(S.groups).map(([k, v]) => `${k} ${pc(v)}`).join(', ')}`);
    console.log(`  top classes: ${Object.entries(S.classes).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${pc(v)}`).join(', ')}`);
    console.log(`  bands (land share, arid, wet): ${S.bands.map(b => `${b.lat}° ${pc(b.land)} / ${pc(b.arid)} / ${pc(b.wet)}`).join(' · ')}`);
    console.log(`  interior (> ~1500 km from the sea, ${pc(inter.inlandShare)} of land below 60°): arid ${pc(inter.inlandArid)} vs coasts ${pc(inter.coastArid)}; seasons ${inter.inlandSwing.toFixed(1)} vs ${inter.coastSwing.toFixed(1)} °C`);
    console.log(`  640K terrain cells: class shares differ by ${(100 * tv).toFixed(2)} %`);
    out.worlds[ending] = { timeMyr: W.timeMyr, reachedEnding: W.reachedEnding, landShare: W.landShare, ms: { ...W.ms, climate: ms }, ...S, interior: inter, drift640: tv,
        checks: [
            { text: 'the subtropics (15–35°) are more arid than the equator (±10°)', ok: S.bands[1].arid > S.bands[0].arid && S.bands[2].arid > S.bands[0].arid },
            { text: 'the interior is drier than the coasts', ok: inter.inlandArid > inter.coastArid || inter.inlandShare < 0.02 },
            { text: 'the interior has bigger seasons than the coasts', ok: inter.inlandSwing > inter.coastSwing || inter.inlandShare < 0.02 },
            { text: 'the same climate at 160K and 640K terrain cells (class shares within 2 %)', ok: tv < 0.02 },
        ] };
    for (const c of out.worlds[ending].checks) console.log(`    ${c.ok ? 'PASS' : 'FAIL'}  ${c.text}`);
}
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'evolution-check.json'), JSON.stringify(out, null, 2));
fs.writeFileSync(path.join(LAB_DIR, 'evolution-check.json'), JSON.stringify(out));
console.log(`\nWrote ${path.relative(process.cwd(), path.join(OUT_DIR, 'evolution-check.json'))}`);
