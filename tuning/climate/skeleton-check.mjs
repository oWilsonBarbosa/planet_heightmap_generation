/**
 * Phase 1 — the new climate's skeleton, checked with real Earth data (the "oracle" run).
 *
 * Builds the imported Earth at several terrain resolutions, runs computeClimate() (v2/js/climate/core.js) with the
 * observed monthly temperature and rain as its anchor source, and scores the per-terrain-cell Köppen against Beck's
 * 0.1° map. With the physics stages replaced by observations, this measures everything else — the grid, the surface
 * aggregation, 12 months from K points, the height correction per cell, the classifier — and whether the result
 * drifts with terrain resolution (it must not).
 *
 *   node tuning/climate/skeleton-check.mjs [--n 160000,640000,2500000]
 *
 * Gate (plan): drift ≈ 0 across resolutions; the oracle ceiling recorded; the skeleton's cost within the budget.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEarthGrayscale } from './lib/earth-context.mjs';   // also installs Delaunator
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences, truthAt01 } from './lib/ref.mjs';
import { compareClasses, groupStats, REGIMES } from './lib/compare.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { computeClimate, observedAnchors } from '../../v2/js/climate/core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'results', 'climate');
const LAB_DIR = path.join(__dirname, 'data', 'lab');
const argN = process.argv.indexOf('--n');
const NS = argN > 0 ? process.argv[argN + 1].split(',').map(Number) : [160000, 640000, 2500000];

const { fields, koppen01 } = loadReferences();
const source = observedAnchors(fields.t2m, fields.precip);
const { gray, width, height } = loadEarthGrayscale();

const CONFIGS = [
    { key: 'k6', label: '6 points, height-corrected (default)', options: { anchors: 6 } },
    { key: 'k12', label: '12 months, height-corrected (ceiling)', options: { anchors: 12 } },
    { key: 'k6flat', label: '6 points, no height correction', options: { anchors: 6, lapseRateCPerKm: 0 } },
];
const GATE_REGIMES = ['Cs (Mediterranean)', 'Cw (dry-winter temperate)', 'Am (tropical monsoon)', 'Dw (dry-winter continental)'];
const pct = x => (100 * x).toFixed(1).padStart(5);

const results = { resolutions: [] };
for (const N of NS) {
    const tb = performance.now();
    const e = buildEarthMesh(gray, width, height, { N });
    const n = e.mesh.numRegions;
    const elevKm = new Float32Array(n);
    for (let r = 0; r < n; r++) elevKm[r] = elevToHeightKm(e.r_elevation[r]);
    const buildMs = performance.now() - tb;
    const row = { N: n, buildMs: Math.round(buildMs), configs: {} };
    console.log(`\n${n.toLocaleString()} terrain cells (Earth built in ${(buildMs / 1000).toFixed(1)} s)`);
    let truth = null;
    for (const cfg of CONFIGS) {
        const res = computeClimate({ xyz: e.r_xyz, elevKm, axes: 'y-up' }, { ...cfg.options, anchorSource: source });
        if (!truth) {
            truth = new Uint8Array(n);
            for (let r = 0; r < n; r++) truth[r] = truthAt01(koppen01, res.cell.lat[r], res.cell.lon[r]);
        }
        const cmp = compareClasses(truth, res.cell.koppen);
        const reg = Object.fromEntries(Object.entries(REGIMES).map(([k, codes]) => [k, groupStats(cmp, codes)]));
        const totalMs = res.timing.reduce((s, x) => s + x.ms, 0);
        // class shares over all land cells (the large-scale climate: must not depend on resolution)
        const share = new Float64Array(31);
        let landN = 0;
        for (let r = 0; r < n; r++) if (res.cell.koppen[r]) { share[res.cell.koppen[r]]++; landN++; }
        for (let k = 0; k < 31; k++) share[k] /= landN;
        row.configs[cfg.key] = {
            label: cfg.label, exact: cmp.exact, major: cmp.major, graded: cmp.graded, macroF1: cmp.macroF1, share: Array.from(share),
            regimes: Object.fromEntries(Object.entries(reg).map(([k, v]) => [k, { recall: v.recall, areaRatio: v.areaRatio }])),
            ms: Math.round(totalMs), timing: res.timing.map(t => ({ stage: t.stage, ms: +t.ms.toFixed(1) })),
        };
        console.log(`  ${cfg.label.padEnd(40)} exact ${pct(cmp.exact)} %  group ${pct(cmp.major)} %  graded ${pct(cmp.graded)} %  `
            + GATE_REGIMES.map(k => `${k.split(' ')[0]} ${pct(reg[k].recall)}`).join('  ') + `   ${Math.round(totalMs)} ms`);
        if (cfg.key === 'k6') console.log('    ' + res.timing.map(t => `${t.stage} ${t.ms.toFixed(0)} ms`).join(' · '));
        if (cfg.key === 'k6' && N === NS[0]) {
            // Evolution's frame: z is north, lon = atan2(y, x). The same planet in that frame must classify identically.
            const xyzZ = new Float32Array(3 * n);
            for (let r = 0; r < n; r++) { xyzZ[3 * r] = e.r_xyz[3 * r + 2]; xyzZ[3 * r + 1] = e.r_xyz[3 * r]; xyzZ[3 * r + 2] = e.r_xyz[3 * r + 1]; }
            const resZ = computeClimate({ xyz: xyzZ, elevKm, axes: 'z-up' }, { ...cfg.options, anchorSource: source });
            let diff = 0;
            for (let r = 0; r < n; r++) if (resZ.cell.koppen[r] !== res.cell.koppen[r]) diff++;
            results.zUpIdentical = diff === 0;
            console.log(`    Evolution axes (z north): ${diff === 0 ? 'identical classes' : `${diff} cells differ`}`);
        }
    }
    results.resolutions.push(row);
}

// Drift across resolutions. What must stay the same is the large-scale climate: how much of the land each class
// covers (total-variation distance between the class shares; group shares A/B/C/D/E). Agreement with the 0.1° truth
// may rise with resolution when heights are corrected per cell — finer terrain resolves more mountain climates — which
// is wanted; without the height correction it must not move.
const GROUPS = { A: [1, 2, 3], B: [4, 5, 6, 7], C: [8, 9, 10, 11, 12, 13, 14, 15, 16], D: [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28], E: [29, 30] };
const drift = {};
for (const cfg of CONFIGS) {
    const rows = results.resolutions.map(r => r.configs[cfg.key]);
    let tv = 0, groupSpread = 0;
    for (let a = 0; a < rows.length; a++) for (let b = a + 1; b < rows.length; b++) {
        let s = 0; for (let k = 1; k < 31; k++) s += Math.abs(rows[a].share[k] - rows[b].share[k]);
        tv = Math.max(tv, s / 2);
    }
    for (const ids of Object.values(GROUPS)) {
        const g = rows.map(r => ids.reduce((s, k) => s + r.share[k], 0));
        groupSpread = Math.max(groupSpread, Math.max(...g) - Math.min(...g));
    }
    const ex = rows.map(r => r.exact);
    drift[cfg.key] = { classShareTV: tv, groupShareSpread: groupSpread, exactSpread: Math.max(...ex) - Math.min(...ex) };
}
results.drift = drift;
const d = drift.k6, flat = drift.k6flat;
const pass = d.classShareTV <= 0.02 && d.groupShareSpread <= 0.01 && flat.exactSpread <= 0.005;
results.gate = { classShareTVMax: 0.02, groupShareSpreadMax: 0.01, flatExactSpreadMax: 0.005, pass };
console.log(`\nDrift across ${NS.map(x => x.toLocaleString()).join(' / ')}:`);
console.log(`  class shares differ by at most ${(100 * d.classShareTV).toFixed(2)} % of land (gate ≤ 2 %), group shares by ${(100 * d.groupShareSpread).toFixed(2)} pts (≤ 1)`);
console.log(`  agreement without height correction spreads ${(100 * flat.exactSpread).toFixed(2)} pts (≤ 0.5); with it ${(100 * d.exactSpread).toFixed(2)} pts (finer terrain → more mountain detail)`);
console.log(`  → ${pass ? 'GATE PASSED' : 'gate not met'}`);
console.log(`  (For comparison, V1 as shipped: temperate share 17.9 → 12.4 → 10.6 % from 40K to 640K — Phase 0 audit.)`);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'skeleton-check.json'), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(LAB_DIR, 'skeleton-check.json'), JSON.stringify(results));
console.log(`Wrote ${path.relative(process.cwd(), path.join(OUT_DIR, 'skeleton-check.json'))}`);
