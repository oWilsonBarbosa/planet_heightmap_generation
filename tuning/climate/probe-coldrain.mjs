/**
 * How wet is the cold land?
 *
 * Runs the climate chain on the Earth heightmap and reports mean annual rain on
 * land by latitude band and by Köppen class, in millimetres (index × 2 seasons ×
 * KOPPEN_PRECIP_SCALE_MM). Cold air holds little water vapour, so polar and
 * subpolar land is dry: Arctic tundra gets roughly 100–300 mm a year and the
 * boreal forest 300–800 mm, against ~1000 mm in the temperate west-coast belt.
 * A model with no temperature limit on moisture over-waters the far north.
 *
 *   node tuning/climate/probe-coldrain.mjs [--n 160000] [--params FILE]
 *
 * Köppen is scored over the same run, so rain and the objective read together.
 */
import fs from 'node:fs';
import { buildEarthContext } from './lib/earth-context.mjs';
import { runClimate, scoreKoppen } from './lib/score.mjs';
import { CLIMATE_DEFAULTS } from '../../js/climate-config.js';
import { KOPPEN_CLASSES } from '../../js/koppen.js';
import { elevToHeightKm } from '../../js/color-map.js';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const N = parseInt(arg('--n', '160000'), 10);
const paramsFile = arg('--params', null);
const overrides = paramsFile ? JSON.parse(fs.readFileSync(paramsFile, 'utf8')).params || JSON.parse(fs.readFileSync(paramsFile, 'utf8')) : {};
const RAD = 180 / Math.PI;

export function coldRainReport(ctx, run) {
    const n = ctx.mesh.numRegions;
    const scale = (overrides.KOPPEN_PRECIP_SCALE_MM ?? CLIMATE_DEFAULTS.KOPPEN_PRECIP_SCALE_MM);
    const pS = run.precipResult.r_precip_summer, pW = run.precipResult.r_precip_winter;
    const bands = [[80, 90], [70, 80], [60, 70], [50, 60], [40, 50], [30, 40], [20, 30], [10, 20], [0, 10]];
    const byBand = bands.map(() => ({ s: 0, c: 0 }));
    const byClass = new Map();
    const polarET = { s: 0, c: 0 };       // Arctic/Antarctic tundra proper: ET poleward of 60°, below 1 km
    const land = { s: 0, c: 0 };
    for (let r = 0; r < n; r++) {
        if (ctx.r_elevation[r] <= 0) continue;
        const mm = (pS[r] + pW[r]) * scale;
        land.s += mm; land.c++;
        const lat = Math.abs(ctx.r_lat[r] * RAD);
        if (KOPPEN_CLASSES[run.r_koppen[r]]?.code === 'ET' && lat >= 60 && elevToHeightKm(ctx.r_elevation[r]) < 1) { polarET.s += mm; polarET.c++; }
        const b = bands.findIndex(([lo, hi]) => lat >= lo && lat < hi);
        if (b >= 0) { byBand[b].s += mm; byBand[b].c++; }
        const code = KOPPEN_CLASSES[run.r_koppen[r]]?.code;
        if (code) { const e = byClass.get(code) || { s: 0, c: 0 }; e.s += mm; e.c++; byClass.set(code, e); }
    }
    return { bands: bands.map(([lo, hi], i) => ({ lo, hi, mm: byBand[i].c ? byBand[i].s / byBand[i].c : NaN, cells: byBand[i].c })), byClass, polarET, landMean: land.s / land.c };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const ctx = buildEarthContext({ N });
    const run = runClimate(ctx, overrides);
    const rep = coldRainReport(ctx, run);
    const score = scoreKoppen(ctx, run.r_koppen);
    console.log(`Earth heightmap, N=${N}${paramsFile ? `, params ${paramsFile}` : ''}`);
    console.log(`\nLand mean ${rep.landMean.toFixed(0)} mm/yr (Earth ~715; the 813.7 index scale in tools/precip-scale.mjs of the 0r063N repo was fitted so this reads 715)`);
    console.log('\nLand rain by latitude band (both hemispheres), mm/yr');
    for (const b of rep.bands) console.log(`  ${String(b.lo).padStart(2)}–${String(b.hi).padEnd(2)}°  ${Number.isFinite(b.mm) ? b.mm.toFixed(0).padStart(5) : '    —'}   (${b.cells} cells)`);
    console.log('\nLand rain by Köppen class, mm/yr');
    const want = ['ET', 'EF', 'Dfc', 'Dfb', 'Dwc', 'Dfd', 'Dwd', 'Dsc', 'Cfb', 'Aw', 'Af'];
    for (const code of want) { const e = rep.byClass.get(code); if (e) console.log(`  ${code.padEnd(4)} ${(e.s / e.c).toFixed(0).padStart(5)}   (${e.c} cells)`); }
    if (rep.polarET.c) console.log(`  ET poleward of 60°, below 1 km (polar tundra proper)  ${(rep.polarET.s / rep.polarET.c).toFixed(0).padStart(5)}   (${rep.polarET.c} cells)`);
    console.log(`\nKöppen objective ${score.objective.toFixed(4)}   exact ${(100 * score.exactAcc).toFixed(2)} %   major ${(100 * score.majorAcc).toFixed(2)} %   E polar ${(100 * score.groupFractions.E.sim).toFixed(2)} % (truth ${(100 * score.groupFractions.E.truth).toFixed(2)} %)   B arid ${(100 * score.groupFractions.B.sim).toFixed(2)} % (truth ${(100 * score.groupFractions.B.truth).toFixed(2)} %)`);
}
