// The ocean's seasons on Earth (plans/V1_NEW_CLIMATE_PLAN.md, "Seasonal currents"): V1's Earth mesh (40K) through the new
// climate; a few named boxes for January and July, and the Köppen map saved to compare with another run.
//   node tuning/climate/diag-seasonal-ocean.mjs <name> [--set KEY=value,…] [--compare <other name>]
//   e.g.  … off --set OCEAN_SEASON_SCALE=0   then   … on --compare off
import fs from 'node:fs';
const R = new URL('../../', import.meta.url).pathname;
const OUT = R + 'tuning/results/climate/';
fs.mkdirSync(OUT, { recursive: true });
const { loadEarthGrayscale } = await import(R + 'tuning/climate/lib/earth-context.mjs');
const { buildEarthMesh } = await import(R + 'tuning/climate/lib/earth-mesh.mjs');
const { elevToHeightKm } = await import(R + 'js/color-map.js');
const { planetClimate } = await import(R + 'v2/js/climate/climate.js');
const { setParams } = await import(R + 'v2/js/climate/config.js');
const { KOPPEN_CLASSES } = await import(R + 'v2/js/climate/koppen.js');
const name = process.argv[2] ?? 'run';
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
if (arg('--set')) setParams(Object.fromEntries(arg('--set').split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const { gray, width, height } = loadEarthGrayscale();
const earth = buildEarthMesh(gray, width, height, { N: 40000 });
const elevKm = new Float32Array(earth.mesh.numRegions);
for (let r = 0; r < elevKm.length; r++) elevKm[r] = elevToHeightKm(earth.r_elevation[r]);
const t0 = performance.now();
const res = planetClimate({ xyz: earth.r_xyz, elevKm, axes: 'y-up' });
const ms = performance.now() - t0;
const g = res.grid, G = g.size, O = res.stages.ocean, T = res.stages.temperature;
const month = (f, m) => (f.length === 12 * G ? f.subarray(m * G, (m + 1) * G) : f);
const box = (f, la0, la1, lo0, lo1, sea = true) => {
    let s = 0, n = 0;
    for (let j = 0; j < g.h; j++) { const la = g.lat[j]; if (la < la0 || la > la1) continue;
        for (let i = 0; i < g.w; i++) { const lo = g.lon[i]; if (lo < lo0 || lo > lo1) continue;
            const c = j * g.w + i; if (sea && !(O.seaMask[c] > 0.5)) continue; if (f[c] === f[c]) { s += f[c]; n++; } } }
    return n ? s / n : NaN;
};
const mon = O.monthly;
const fmt = x => (x === x ? x.toFixed(3) : '—');
const rows = [
    ['Somali Current, v (m/s, + north)  2–10°N 45–55°E', m => box(mon ? month(mon.v, m) : O.v, 2, 10, 45, 55)],
    ['Arabian Sea upwelling (m/day)     10–20°N 52–60°E', m => box(mon ? month(mon.upwelling, m) : O.upwelling, 10, 20, 52, 60)],
    ['Arabian Sea SST (°C)              10–20°N 55–65°E', m => box(month(T.monthlySL, m), 10, 20, 55, 65)],
    ['Equatorial countercurrent u       4–9°N 150–110°W', m => box(mon ? month(mon.u, m) : O.u, 4, 9, -150, -110)],
    ['California upwelling (m/day)      34–42°N 128–122°W', m => box(mon ? month(mon.upwelling, m) : O.upwelling, 34, 42, -128, -122)],
    ['Gulf Stream u (m/s)               35–40°N 75–60°W', m => box(mon ? month(mon.u, m) : O.u, 35, 40, -75, -60)],
    ['W Europe air T (°C, grid)         45–55°N 0–10°E', m => box(month(res.months.T, m), 45, 55, 0, 10, false)],
    ['India rain (mm/month)             15–25°N 72–85°E', m => box(month(res.months.P, m), 15, 25, 72, 85, false)],
];
console.log(`${name}: climate ${ms.toFixed(0)} ms, ocean ${res.timing.filter(t => /ocean|temperature ↔/.test(t.stage)).map(t => `${t.stage} ${t.ms.toFixed(0)}`).join(', ')}`);
console.log(`${'box'.padEnd(52)} ${'Jan'.padStart(8)} ${'Jul'.padStart(8)}`);
for (const [label, f] of rows) console.log(`${label.padEnd(52)} ${fmt(f(0)).padStart(8)} ${fmt(f(6)).padStart(8)}`);
fs.writeFileSync(`${OUT}${name}.koppen`, Buffer.from(res.cell.koppen.buffer));
const base = arg('--compare');
if (base) {
    const b = new Uint8Array(fs.readFileSync(`${OUT}${base}.koppen`)), k = res.cell.koppen;
    let land = 0, diff = 0, grp = 0; const moves = {};
    for (let r = 0; r < k.length; r++) { if (!k[r] && !b[r]) continue; land++; if (k[r] !== b[r]) { diff++; if (KOPPEN_CLASSES[k[r]].code[0] !== KOPPEN_CLASSES[b[r]].code[0]) grp++; const key = `${KOPPEN_CLASSES[b[r]].code}→${KOPPEN_CLASSES[k[r]].code}`; moves[key] = (moves[key] ?? 0) + 1; } }
    console.log(`Köppen vs ${base}: ${diff} of ${land} land cells changed (${(100 * diff / land).toFixed(2)} %), ${grp} changed major group`);
    console.log('  most common:', Object.entries(moves).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v}`).join(' · '));
}
