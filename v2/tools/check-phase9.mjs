// Headless acceptance checks for Phase 9 (steady detail: the terrain read on each plate's own crust, so a drifting
// continent keeps its coasts, shapes, ridges and rivers from frame to frame — changing only where the history changes).
// The developer's measure is a clear gain and an overall feel of stability, not perfection: the checks hold the gain
// against the world grid (anchorRecords: false) and set floors near what it reached.
// Usage: node v2/tools/check-phase9.mjs

import { check, section, finish, labMesh } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { CrustType } from '../js/tectonics/model/crust.js';
import { terrainMesh } from '../js/terrain/terrain-mesh.js';
import { synthesizeTerrain } from '../js/terrain/synthesize.js';
import { terrainConfig } from '../js/terrain/terrain-config.js';
import { buildAnchor } from '../js/terrain/anchor.js';
import { locate } from '../js/core/mesh-locate.js';
import { quatFromAxisAngle, quatMul, quatToMat3 } from '../js/core/rotation.js';

const SEED = 12345;
const mesh = labMesh(), n = mesh.numCells;
const corr = (xs, ys) => { const mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length; let a = 0, b = 0, c = 0; for (let i = 0; i < xs.length; i++) { a += (xs[i] - mx) * (ys[i] - my); b += (xs[i] - mx) ** 2; c += (ys[i] - my) ** 2; } return a / Math.sqrt(b * c); };
const scene = TERRAIN_SCENES.find(s => s.id === 'history');
const history = until => { const world = scene.build(mesh, SEED); return simulate(world, { untilMyr: until, drive: w => scene.drive(w), snapshotEveryMyr: 10 }).frames; };

// ── the frame carries every plate's crust ──
section('each plate\'s crust in the frame');
const frames150 = history(150);
{
    const f = frames150.at(-1);
    let masked = 0, carried = f.crustCells.length, beltsOk = f.crustBelt.length === 6 * carried && f.crustReach.length === 2 * carried;
    for (const p of f.plates) if (p?.alive) masked += p.cells;
    const A = buildAnchor(f, mesh), shown = new Set();
    for (let w = 0; w < n; w++) if (A.owner[w] >= 0) shown.add(A.owner[w] * n + A.cell[w]);
    let hiddenLand = 0;
    for (let i = 0; i < carried; i++) if (!shown.has(f.crustCells[i]) && f.crustType[i] !== CrustType.OCEAN) hiddenLand++;
    check('a frame carries every plate\'s crust cells and their belts — including those no world cell shows', carried >= 0.95 * masked && beltsOk && hiddenLand > 0,
        `${carried} crust cells carried (the plates hold ${masked}); ${hiddenLand} of them land that no world cell shows this frame`);
}

// ── turned under the world grid: the same planet, the world grid half a cell over ──
section('the planet turned half a cell under the world grid');
{
    // as the history re-samples a moving plate: each world cell of the turned planet shows the crust cell under it on its
    // plate's raster, with the values the original frame shows for that crust cell (or, hidden, at its nearest world cell)
    const F = frames150.at(-1), q = quatFromAxisAngle(0.6, 0.8, 0, 0.6 * Math.PI / 180), Rm = quatToMat3(q, new Float64Array(9));
    const rotT = (x, y, z) => [Rm[0] * x + Rm[3] * y + Rm[6] * z, Rm[1] * x + Rm[4] * y + Rm[7] * z, Rm[2] * x + Rm[5] * y + Rm[8] * z];
    const AF = buildAnchor(F, mesh), inv = new Map();
    for (let w = 0; w < n; w++) if (AF.owner[w] >= 0) { const key = AF.owner[w] * n + AF.cell[w]; if (!inv.has(key)) inv.set(key, w); }
    const G = { plates: F.plates.map(p => p && { ...p, quat: quatMul(q, p.quat) }) }, src = new Int32Array(n), ownerG = new Int16Array(n);
    for (let w = 0; w < n; w++) {
        const [x, y, z] = rotT(mesh.xyz[3 * w], mesh.xyz[3 * w + 1], mesh.xyz[3 * w + 2]), from = mesh.index.nearest(x, y, z), o = F.owner[from];
        ownerG[w] = o;
        if (o < 0) { src[w] = from; continue; }
        const M = quatToMat3(G.plates[o].quat, new Float64Array(9)), X = mesh.xyz[3 * w], Y = mesh.xyz[3 * w + 1], Z = mesh.xyz[3 * w + 2];
        const r = mesh.index.nearest(M[0] * X + M[3] * Y + M[6] * Z, M[1] * X + M[4] * Y + M[7] * Z, M[2] * X + M[5] * Y + M[8] * Z);
        let s = inv.get(o * n + r);
        if (s === undefined) { const m = AF.mats, b = 9 * o, rx = mesh.xyz[3 * r], ry = mesh.xyz[3 * r + 1], rz = mesh.xyz[3 * r + 2]; s = mesh.index.nearest(m[b] * rx + m[b + 1] * ry + m[b + 2] * rz, m[b + 3] * rx + m[b + 4] * ry + m[b + 5] * rz, m[b + 6] * rx + m[b + 7] * ry + m[b + 8] * rz); }
        src[w] = s;
    }
    for (const [k, v] of Object.entries(F)) {
        if (k === 'plates') continue;
        if (ArrayBuffer.isView(v) && v.length === n) { const a = new v.constructor(n); for (let w = 0; w < n; w++) a[w] = v[src[w]]; G[k] = a; } else G[k] = v;
    }
    G.owner = ownerG;
    // (at 640K: on a coarser mesh the resolution fade leaves only the broadest belts' ridges — a handful of features, and a
    // correlation that swings by ±0.2 from one draw of their phases and noise to the next)
    const tm = terrainMesh(640000), c3 = [0, 0, 0], w3 = [0, 0, 0];
    const measure = anchor => {
        const cfg = terrainConfig({ anchorRecords: anchor });
        const TA = synthesizeTerrain(F, mesh, tm, { seed: SEED, cfg, parts: true }), TB = synthesizeTerrain(G, mesh, tm, { seed: SEED, cfg, parts: true });
        let coastN = 0, coastSame = 0; const hx = [], hy = [], sx = [], sy = [];
        for (let t = 0; t < tm.numCells; t++) {
            const [x, y, z] = rotT(tm.xyz[3 * t], tm.xyz[3 * t + 1], tm.xyz[3 * t + 2]);
            locate(tm, x, y, z, c3, w3);
            const at = F2 => w3[0] * F2[c3[0]] + w3[1] * F2[c3[1]] + w3[2] * F2[c3[2]], hB = TB.heightKm[t], hA = at(TA.heightKm), c = TB.sampler.cells[3 * t];
            if (G.owner[c] >= 0 && Math.abs(TB.rec.coastKm[c]) <= 300) { coastN++; if ((hB > 0) === (hA > 0)) coastSame++; }
            if (hB <= 0) continue;
            hx.push(hB); hy.push(hA);
            if (TB.parts.stripes[t] !== 0 || at(TA.parts.stripes) !== 0) { sx.push(TB.parts.stripes[t]); sy.push(at(TA.parts.stripes)); }
        }
        return { coast: coastSame / coastN, heights: corr(hx, hy), ridges: corr(sx, sy) };
    };
    const grid = measure(false), crust = measure(true);
    // (before Phase 9, measured once with that code: 92.4 %, 0.65 and 0.44–0.47 over two seeds)
    check('turned half a cell, a coastline stays where its crust is', crust.coast >= 0.965 && crust.coast >= grid.coast + 0.02,
        `land and sea agree at the same crust on ${(100 * crust.coast).toFixed(1)} % of cells within 300 km of a coast (read on the world grid: ${(100 * grid.coast).toFixed(1)} %; before Phase 9: 92.4 %)`);
    check('…and so does the land\'s shape', crust.heights >= 0.85 && crust.heights >= grid.heights + 0.1,
        `land heights correlate ${crust.heights.toFixed(2)} with the same crust before the turn (on the world grid: ${grid.heights.toFixed(2)}; before Phase 9: 0.65)`);
    // (the ridge kernels sit on the crust in both reads — that was their fix — so against the grid they differ only in the
    // records their height is read from)
    check('…and so do the ridges', crust.ridges >= 0.55 && crust.ridges >= grid.ridges + 0.03,
        `the ridges correlate ${crust.ridges.toFixed(2)} (records on the world grid: ${grid.ridges.toFixed(2)}; before Phase 9, kernels per world cell: 0.44–0.47)`);
}

// ── the fine detail renews slowly (detailRenewMyr): the same frame, its renewal clock run on ──
section('fine detail renews slowly');
{
    // (a frame read at a later time would change its records too — ages, quiet spells — so the frame stays and the
    // renewal's clock, time ÷ detailRenewMyr, is run on by shortening the period: t / P' = (t + Δt) / P. The coast's bays
    // and headlands, the coast distance's noise, are read 100–300 km inland, where it is always on the land side.)
    // (at 640K, as above: independent draws of the ridges then correlate within ±0.05)
    const F = frames150.at(-1), tm = terrainMesh(640000), P = terrainConfig().detailRenewMyr, t0 = F.time;
    const later = dt => synthesizeTerrain(F, mesh, tm, { seed: SEED, parts: true, cfg: terrainConfig({ detailRenewMyr: P * t0 / (t0 + dt) }) });
    const T0 = later(0), T10 = later(10), TP = later(P);
    const ridges = T => { const xs = [], ys = []; for (let t = 0; t < tm.numCells; t++) if (T0.parts.stripes[t] !== 0 || T.parts.stripes[t] !== 0) { xs.push(T0.parts.stripes[t]); ys.push(T.parts.stripes[t]); } return corr(xs, ys); };
    const bays = T => { const xs = [], ys = []; for (let t = 0; t < tm.numCells; t++) if (T0.parts.dcoastRaw[t] >= 100 && T0.parts.dcoastRaw[t] <= 300 && T0.parts.dcoast[t] > 0 && T.parts.dcoast[t] > 0) { xs.push(T0.parts.dcoast[t] - T0.parts.dcoastRaw[t]); ys.push(T.parts.dcoast[t] - T.parts.dcoastRaw[t]); } return corr(xs, ys); };
    const r10 = ridges(T10), rP = ridges(TP), b10 = bays(T10), bP = bays(TP);
    check('from one frame to the next (10 Myr) the fine detail holds…', P > 0 && r10 >= 0.9 && b10 >= 0.98,
        `renewing over ${P} Myr: the ridges correlate ${r10.toFixed(2)} with themselves 10 Myr before, the bays and headlands ${b10.toFixed(3)}`);
    check(`…and over ${P} Myr it is renewed`, Math.abs(rP) <= 0.15 && Math.abs(bP) <= 0.15,
        `${P} Myr on, the ridges correlate ${rP.toFixed(2)}, the bays and headlands ${bP.toFixed(2)}`);
}

// ── real frames: a drifting continent 10 Myr on ──
section('a drifting continent 10 Myr on');
for (const [frames, label] of [[frames150, '140→150 Myr'], [history(300), '290→300 Myr']]) {
    const A = frames.at(-2), B = frames.at(-1), tm = terrainMesh(640000);
    let p = -1, turned = 0;
    for (let i = 0; i < B.plates.length; i++) { const a = A.plates[i], b = B.plates[i]; if (!a?.alive || !b?.alive || b.landCells < 200) continue; const ang = 2 * Math.acos(Math.min(1, Math.abs(a.quat[0] * b.quat[0] + a.quat[1] * b.quat[1] + a.quat[2] * b.quat[2] + a.quat[3] * b.quat[3]))); if (ang > turned) { turned = ang; p = i; } }
    const MA = quatToMat3(A.plates[p].quat, new Float64Array(9)), MB = quatToMat3(B.plates[p].quat, new Float64Array(9)), c3 = [0, 0, 0], w3 = [0, 0, 0];
    const TA = synthesizeTerrain(A, mesh, tm, { seed: SEED, carve: true }), TB = synthesizeTerrain(B, mesh, tm, { seed: SEED, carve: true });
    let coastN = 0, coastSame = 0, moved = 0, rivers = 0, kept = 0; const hx = [], hy = [], s3 = [0, 0, 0], sw3 = [0, 0, 0];
    for (let t = 0; t < tm.numCells; t++) {
        const c = TB.sampler.cells[3 * t];
        if (B.owner[c] !== p) continue;
        const x = tm.xyz[3 * t], y = tm.xyz[3 * t + 1], z = tm.xyz[3 * t + 2], lx = MB[0] * x + MB[3] * y + MB[6] * z, ly = MB[1] * x + MB[4] * y + MB[7] * z, lz = MB[2] * x + MB[5] * y + MB[8] * z;
        const ax = MA[0] * lx + MA[1] * ly + MA[2] * lz, ay = MA[3] * lx + MA[4] * ly + MA[5] * lz, az = MA[6] * lx + MA[7] * ly + MA[8] * lz;
        locate(tm, ax, ay, az, c3, w3);
        const hA = w3[0] * TA.tectonicKm[c3[0]] + w3[1] * TA.tectonicKm[c3[1]] + w3[2] * TA.tectonicKm[c3[2]];
        // (only where the history itself kept the coast: the plate's own coast records — on its raster, the crust itself —
        // put the point on the same side of the coast in both frames. Phase 11 closes remnant seas from their shores and
        // welds redraw coasts: that is the history's change, not the terrain's)
        if (Math.abs(TB.rec.coastKm[c]) <= 300) {
            locate(mesh, lx, ly, lz, s3, sw3);
            const on = R => R ? sw3[0] * R.coast[s3[0]] + sw3[1] * R.coast[s3[1]] + sw3[2] * R.coast[s3[2]] : NaN;
            const cA = on(TA.rec.coastRaster.get(p)), cB = on(TB.rec.coastRaster.get(p));
            if (cA === cA && cB === cB && (cA > 0) !== (cB > 0)) moved++;
            else { coastN++; if ((TB.tectonicKm[t] > 0) === (hA > 0)) coastSame++; }
        }
        if (TB.tectonicKm[t] > 0) { hx.push(TB.tectonicKm[t]); hy.push(hA); }
        if (TB.drainage[t] >= 1e4 && TB.tectonicKm[t] > 0) {
            rivers++;
            let hit = false;
            for (let j = 0; j < 3 && !hit; j++) { const a = c3[j]; if (TA.drainage[a] >= 5e3) hit = true; for (let k = tm.adjOffset[a]; !hit && k < tm.adjOffset[a + 1]; k++) if (TA.drainage[tm.adjList[k]] >= 5e3) hit = true; }
            if (hit) kept++;
        }
    }
    const h = corr(hx, hy);
    check(`${label}: the continent that moved most keeps its coasts, its shape and its rivers`, coastN > 5000 && coastSame / coastN >= 0.95 && h >= 0.5 && kept / rivers >= 0.9,
        `plate ${p} turned ${(turned * 180 / Math.PI).toFixed(1)}°: land and sea agree at the same crust on ${(100 * coastSame / coastN).toFixed(1)} % of cells near its coasts (before Phase 9: 92–95 %; ${(100 * moved / (moved + coastN)).toFixed(1)} % more, where the history moved the coast, left out); land heights correlate ${h.toFixed(2)} (0.45–0.49 before; the rest is the history's own change); ${(100 * kept / rivers).toFixed(0)} % of its rivers over 10,000 km² run within a cell of one 10 Myr before`);
}

finish('Phase 9');
