/**
 * Which settings dry or wet the generated planets, and what do they cost Earth? Each setting is moved a quarter of its
 * literature range (PARAM_PRIORS) up and down from its default, one at a time; printed: Earth's Köppen (continents
 * equal), Earth's arid share, and the arid share of a few generated planets (lib/gen-planets.mjs). A setting that wets
 * the planets while Earth holds is a candidate for the tune; one that only moves Earth is where Earth gets fitted.
 *
 *   node tuning/climate/probe-planets.mjs [--prefix RAIN_,CIRC_] [--keys A,B] [--planets gen-2,gen-6,gen-10,evo-101,evo-202]
 */

import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences, truthAt01 } from './lib/ref.mjs';
import { compareClasses } from './lib/compare.mjs';
import { continentOf, TUNED_CONTINENTS } from './lib/continents.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { planetClimate } from '../../v2/js/climate/climate.js';
import { PARAMS_DEFAULTS, PARAM_PRIORS, setParams, resetParams } from '../../v2/js/climate/config.js';
import { loadGenPlanets, dryness } from './lib/gen-planets.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PREFIX = arg('--prefix', 'RAIN_,CIRC_,OCEAN_COAST,OCEAN_UPWELL').split(',');
const KEYS = arg('--keys', null)?.split(',') ?? Object.keys(PARAM_PRIORS).filter(k => PREFIX.some(p => k.startsWith(p)));
const PLANETS = arg('--planets', 'gen-2,gen-6,gen-10,evo-101,evo-202').split(',');

const { koppen01 } = loadReferences();
const { gray, width, height } = loadEarthGrayscale();
const e = buildEarthMesh(gray, width, height, { N: 160000 });
const n = e.mesh.numRegions, elevKm = new Float32Array(n), truth = new Uint8Array(n), masks = {};
for (let r = 0; r < n; r++) elevKm[r] = elevToHeightKm(e.r_elevation[r]);
for (const k of TUNED_CONTINENTS) masks[k] = new Uint8Array(n);
for (let r = 0; r < n; r++) {
    const x = e.r_xyz[3 * r], y = e.r_xyz[3 * r + 1], z = e.r_xyz[3 * r + 2];
    const lat = Math.asin(Math.max(-1, Math.min(1, y))) * 180 / Math.PI, lon = Math.atan2(x, z) * 180 / Math.PI;
    truth[r] = truthAt01(koppen01, lat, lon);
    const c = continentOf(lat, lon); if (masks[c]) masks[c][r] = 1;
}
const planets = await loadGenPlanets({ only: PLANETS, log: () => {} });

function measure() {
    const res = planetClimate({ xyz: e.r_xyz, elevKm, axes: 'y-up' });
    let cont = 0; for (const k of TUNED_CONTINENTS) cont += compareClasses(truth, res.cell.koppen, null, masks[k]).exact / TUNED_CONTINENTS.length;
    const arid = planets.map(p => dryness(planetClimate({ xyz: p.xyz, elevKm: p.elevKm, axes: p.axes })).aridShare);
    return { cont, earthArid: dryness(res).aridShare, arid, aridMean: arid.reduce((a, b) => a + b, 0) / arid.length };
}

const pt = (x) => (100 * x).toFixed(1).padStart(5);
const sg = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(100 * x).toFixed(1)}`.padStart(6);
const base = measure();
console.log(`defaults: Earth continents ${pt(base.cont)} %, Earth arid ${pt(base.earthArid)} %, planets arid ${pt(base.aridMean)} % (${PLANETS.map((k, i) => `${k} ${pt(base.arid[i])}`).join(', ')})`);
console.log('setting (value)                     Δ Earth continents   Δ Earth arid   Δ planets arid   (each planet)');
const rows = [];
for (const k of KEYS) {
    const pr = PARAM_PRIORS[k]; if (!pr) continue;
    for (const dir of [-1, 1]) {
        const v = Math.max(pr.min, Math.min(pr.max, PARAMS_DEFAULTS[k] + dir * 0.25 * (pr.max - pr.min)));
        if (v === PARAMS_DEFAULTS[k]) continue;
        resetParams(); setParams({ [k]: v });
        const m = measure();
        const row = { k, v, dCont: m.cont - base.cont, dEarth: m.earthArid - base.earthArid, dPlan: m.aridMean - base.aridMean, each: m.arid.map((a, i) => a - base.arid[i]) };
        rows.push(row);
        console.log(`${`${k} (${+v.toPrecision(3)})`.padEnd(36)} ${sg(row.dCont)}               ${sg(row.dEarth)}         ${sg(row.dPlan)}       ${row.each.map(sg).join(' ')}`);
    }
}
resetParams();
console.log('\nwetting the planets most per point of Earth\'s continents lost (planets ≥ 1 pt wetter):');
for (const r of rows.filter(r => r.dPlan <= -0.01).sort((a, b) => (a.dPlan / Math.max(0.002, -a.dCont)) - (b.dPlan / Math.max(0.002, -b.dCont))).slice(0, 12))
    console.log(`  ${`${r.k} (${+r.v.toPrecision(3)})`.padEnd(36)} planets ${sg(r.dPlan)}, Earth continents ${sg(r.dCont)}, Earth arid ${sg(r.dEarth)}`);
