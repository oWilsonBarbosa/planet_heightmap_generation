/**
 * Do the ocean-current vectors close into gyres?
 *
 * Runs wind + ocean currents on the Earth heightmap and checks the one property
 * a surface circulation must have: in a subtropical gyre the flow is poleward on
 * a basin's WESTERN edge (Gulf Stream, Kuroshio, Brazil, East Australian,
 * Agulhas) and equatorward on its EASTERN edge (Canary, California, Humboldt,
 * Benguela, West Australian); in a subpolar gyre both reverse.
 *
 * The statistics are the ones tools/physical-audit (0r063N) scores a planet with,
 * so the same numbers can be read off this probe and off an exported planet.
 *
 *   node tuning/climate/probe-currents.mjs [--n 640000] [--dump FILE]
 *
 * --dump writes lat, lon (deg), isOcean, east, north (season mean) as a flat
 * Float32 file, for plotting.
 */
import fs from 'node:fs';
import { buildEarthContext } from './lib/earth-context.mjs';
import { SimplexNoise } from '../../js/simplex-noise.js';
import { resetClimateParams, setClimateParams } from '../../js/climate-config.js';
import { computeWind } from '../../js/wind.js';
import { computeOceanCurrents } from '../../js/ocean.js';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const N = parseInt(arg('--n', '640000'), 10);
const DUMP = arg('--dump', null);
const RAD = 180 / Math.PI;

// Ocean current vectors for a given set of climate parameter overrides
export function runOcean(ctx, overrides = {}) {
    resetClimateParams();
    setClimateParams(overrides);
    try {
        const noise = new SimplexNoise(ctx.seed);
        const wind = computeWind(ctx.mesh, ctx.r_xyz, ctx.r_elevation, ctx.plateIsOcean, ctx.r_plate, noise);
        return { wind, ocean: computeOceanCurrents(ctx.mesh, ctx.r_xyz, ctx.r_elevation, wind) };
    } finally {
        resetClimateParams();
    }
}

// ── gyre statistics ────────────────────────────────────────────────────────
export function gyreStats(ctx, ocean) {
    const n = ctx.mesh.numRegions;
    const NX = 360, NY = 180;                      // 1° bins
    const cnt = new Float32Array(NX * NY), ocn = new Float32Array(NX * NY);
    const sN = new Float64Array(NX * NY), sE = new Float64Array(NX * NY);
    let nz = 0, nzEq = 0;
    for (let r = 0; r < n; r++) {
        const lat = ctx.r_lat[r] * RAD;
        let lon = ctx.r_lon[r] * RAD; if (lon >= 180) lon -= 360;
        const b = Math.min(NY - 1, Math.max(0, Math.floor(lat + 90))) * NX + Math.min(NX - 1, Math.max(0, Math.floor(lon + 180)));
        cnt[b]++;
        if (ctx.r_elevation[r] > 0) continue;
        ocn[b]++;
        const vN = (ocean.r_ocean_current_north_summer[r] + ocean.r_ocean_current_north_winter[r]) / 2;
        sN[b] += vN; sE[b] += (ocean.r_ocean_current_east_summer[r] + ocean.r_ocean_current_east_winter[r]) / 2;
        for (const v of [ocean.r_ocean_current_north_summer[r], ocean.r_ocean_current_north_winter[r]]) {
            if (Math.abs(v) < 1e-9) continue;
            nz++; if (lat > 0 ? v < 0 : v > 0) nzEq++;
        }
    }
    const isOcean = b => ocn[b] > 0 && ocn[b] >= 0.5 * cnt[b];

    // For each latitude band: rows of open ocean >= 40° wide, mean meridional flow in the first and last 3°.
    function edges(lo, hi) {
        const E = { w: [], e: [], m: [] };
        for (let iy = 0; iy < NY; iy++) {
            const lat = -90 + iy + 0.5, al = Math.abs(lat);
            if (al < lo || al >= hi) continue;
            const row = Array.from({ length: NX }, (_, ix) => isOcean(iy * NX + ix));
            if (row.every(Boolean)) continue;
            const start = row.findIndex(v => !v);
            for (let s = 0; s < NX; s++) {
                const ix = (start + s) % NX;
                if (!row[ix] || (s > 0 && row[(ix - 1 + NX) % NX])) continue;
                let len = 0; while (row[(ix + len) % NX] && len < NX) len++;
                if (len < 40) continue;
                const seg = (a, b) => { let sv = 0, w = 0; for (let k = a; k < b; k++) { const bin = iy * NX + ((ix + k) % NX); sv += sN[bin]; w += ocn[bin]; } return w ? sv / w : 0; };
                // signed so that + means poleward
                const sign = lat > 0 ? 1 : -1;
                E.w.push(sign * seg(0, 3)); E.e.push(sign * seg(len - 3, len)); E.m.push(Math.abs(seg(Math.floor(len / 4), Math.floor((3 * len) / 4))));
            }
        }
        const pct = (a, pred) => (a.length ? (100 * a.filter(pred).length) / a.length : NaN);
        return { rows: E.w.length, westPole: pct(E.w, v => v > 0), eastEq: pct(E.e, v => v < 0), interior: E.m.length ? E.m.reduce((s, v) => s + v, 0) / E.m.length : NaN };
    }

    // Named boundary currents: mean poleward-signed flow in a lat/lon box hugging the coast
    const boxes = [
        ['Gulf Stream (W, N Atl.)', 28, 40, -80, -70, +1], ['Kuroshio (W, N Pac.)', 25, 38, 125, 140, +1],
        ['Brazil (W, S Atl.)', -35, -20, -52, -40, +1], ['E Australian (W, S Pac.)', -35, -22, 150, 160, +1],
        ['Agulhas (W, S Ind.)', -35, -25, 30, 40, +1],
        ['Canary (E, N Atl.)', 15, 35, -22, -12, -1], ['California (E, N Pac.)', 25, 42, -130, -120, -1],
        ['Humboldt (E, S Pac.)', -35, -10, -82, -72, -1], ['Benguela (E, S Atl.)', -32, -12, 4, 14, -1],
        ['W Australian (E, S Ind.)', -32, -18, 105, 115, -1],
    ];
    const named = boxes.map(([name, la0, la1, lo0, lo1, want]) => {
        let s = 0, c = 0;
        for (let r = 0; r < n; r++) {
            if (ctx.r_elevation[r] > 0) continue;
            const la = ctx.r_lat[r] * RAD; let lo = ctx.r_lon[r] * RAD; if (lo >= 180) lo -= 360;
            if (la < la0 || la > la1 || lo < lo0 || lo > lo1) continue;
            const v = (ocean.r_ocean_current_north_summer[r] + ocean.r_ocean_current_north_winter[r]) / 2;
            s += (la > 0 ? 1 : -1) * v; c++;
        }
        const m = c ? s / c : NaN;
        return { name, want: want > 0 ? 'poleward' : 'equatorward', mean: m, ok: want > 0 ? m > 0 : m < 0 };
    });
    return {
        eqShare: (100 * nzEq) / nz, nz,
        subtropical: edges(15, 35), gyreEdge: edges(35, 45), subpolar: edges(45, 60), audit: edges(15, 45),
        named,
    };
}

export function printStats(label, g) {
    const f = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '—');
    console.log(`\n── ${label}`);
    console.log(`  equatorward share of non-zero meridional samples: ${f(g.eqShare, 1)} %  (Earth: roughly half)`);
    for (const [name, s, want] of [['15–35° (subtropical gyres)', g.subtropical, 'W poleward, E equatorward'],
        ['35–45° (gyre edge)', g.gyreEdge, 'W poleward, E equatorward'], ['45–60° (subpolar)', g.subpolar, 'W equatorward, E poleward'],
        ['15–45° (physical-audit band)', g.audit, 'W poleward, E equatorward']]) {
        const wPct = name.startsWith('45') ? 100 - s.westPole : s.westPole, ePct = name.startsWith('45') ? 100 - s.eastEq : s.eastEq;
        console.log(`  ${name.padEnd(30)} ${String(s.rows).padStart(3)} rows   W ${f(wPct).padStart(3)} %   E ${f(ePct).padStart(3)} %   interior |N| ${f(s.interior, 3)}   [want ${want}]`);
    }
    console.log('  boundary currents:  ' + g.named.map(c => `${c.ok ? '✓' : '✗'} ${c.name} ${c.mean >= 0 ? '+' : ''}${f(c.mean, 2)}`).join('  '));
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const ctx = buildEarthContext({ N });
    console.log(`Earth context N=${N}, built in ${(ctx.buildMs / 1000).toFixed(1)} s`);
    const t0 = performance.now();
    const { ocean } = runOcean(ctx);
    console.log(`wind + ocean in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    printStats('as shipped', gyreStats(ctx, ocean));
    console.log('\nocean stages: ' + ocean._oceanTiming.map(t => `${t.stage} ${t.ms.toFixed(0)} ms`).join(' · '));
    if (DUMP) {
        const n = ctx.mesh.numRegions, out = new Float32Array(5 * n);
        for (let r = 0; r < n; r++) {
            out[5 * r] = ctx.r_lat[r] * RAD; out[5 * r + 1] = ctx.r_lon[r] * RAD; out[5 * r + 2] = ctx.r_elevation[r] > 0 ? 0 : 1;
            out[5 * r + 3] = (ocean.r_ocean_current_east_summer[r] + ocean.r_ocean_current_east_winter[r]) / 2;
            out[5 * r + 4] = (ocean.r_ocean_current_north_summer[r] + ocean.r_ocean_current_north_winter[r]) / 2;
        }
        fs.writeFileSync(DUMP, Buffer.from(out.buffer));
        console.log(`dumped ${n} cells to ${DUMP}`);
    }
}
