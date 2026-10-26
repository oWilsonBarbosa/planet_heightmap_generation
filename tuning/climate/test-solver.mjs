/**
 * Checks the climate grid's multigrid solver (v2/js/climate/solver.js): build A·T* for a known T*, solve from zero,
 * and compare. Covers the annual-mean problem (σ = B, real) and a seasonal harmonic (σ = B + iωC, land/sea mixed),
 * with and without winds.   node tuning/climate/test-solver.mjs
 */
import { LatLonGrid } from '../../v2/js/climate/grid.js';
import { HelmholtzSolver } from '../../v2/js/climate/solver.js';

const OMEGA = 2 * Math.PI / 3.156e7;
for (const step of [1, 2]) {
    const grid = new LatLonGrid(step), n = grid.size;
    const land = new Uint8Array(n), u = new Float64Array(n), v = new Float64Array(n), Ts = new Float64Array(n), Tsi = new Float64Array(n);
    for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) {
        const c = j * grid.w + i, lat = grid.lat[j], lon = grid.lon[i];
        land[c] = Math.sin(lat / 20) * Math.cos(lon / 30) > 0.3 ? 1 : 0;
        u[c] = 8 * Math.sin(3 * lat * Math.PI / 180); v[c] = 2 * Math.cos(lon * Math.PI / 90) * Math.cos(lat * Math.PI / 180);
        Ts[c] = 30 * Math.cos(lat * Math.PI / 180) + 5 * Math.sin(lon * Math.PI / 45) + (land[c] ? 3 : 0);
        Tsi[c] = 4 * Math.sin(lat * Math.PI / 180) * (land[c] ? 3 : 1);
    }
    for (const [label, harmonic, wind] of [['annual mean, no wind', 0, false], ['annual mean, wind', 0, true], ['seasonal (n=1), wind', 1, true]]) {
        const sr = new Float64Array(n).fill(2.1), si = new Float64Array(n);
        if (harmonic) for (let c = 0; c < n; c++) si[c] = harmonic * OMEGA * (land[c] ? 1e7 : 2.4e8);
        const S = new HelmholtzSolver(grid, 0.6);
        let t0 = performance.now();
        S.setOperator(sr, si, wind ? u : null, wind ? v : null, 3e5);
        const setMs = performance.now() - t0;
        const tr = harmonic ? Ts : Ts, ti = harmonic ? Tsi : new Float64Array(n);
        const fr = new Float64Array(n), fi = new Float64Array(n);
        S.apply(tr, ti, fr, fi);
        const xr = new Float64Array(n), xi = new Float64Array(n);
        t0 = performance.now();
        const res = S.solve(fr, fi, xr, xi, { maxCycles: 30, tol: 1e-8 });
        const solveMs = performance.now() - t0;
        let err = 0;
        for (let c = 0; c < n; c++) err = Math.max(err, Math.hypot(xr[c] - tr[c], xi[c] - ti[c]));
        console.log(`${step}° ${label.padEnd(22)} cycles ${String(res.cycles).padStart(2)}  rel.residual ${res.rel.toExponential(1)}  max error ${err.toExponential(1)} K`
            + `   setup ${setMs.toFixed(0)} ms, solve ${solveMs.toFixed(0)} ms (${(solveMs / res.cycles).toFixed(1)} ms/cycle)`);
    }
}
