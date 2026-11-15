/**
 * The Evolution's drainage check: one Evolution world finished (Add detail) at each of --cells, with its drainage
 * network (finishPlanet's `network`), checked as a river network must be — beyond the finite numbers and the closed
 * water budget the other checks see:
 *
 *   connectivity  every land cell drains to a neighbour (a lake's cells to its outlet); only a closed lake's water goes
 *                 no further; no loops; every cell's water reaches the sea or a closed lake; each cell's drainage area
 *                 is what drains into it down the network; no cell passes on more water than it gathers
 *   levels        a lake's surface is flat and above its bed; its shore is not below it but at its outlet; the rivers
 *                 run downhill (a climb is a pit the water could not leave); no dry land below sea level but a salt
 *                 sea's shore
 *   outlets       each fresh lake has one outlet, beside it, passing on no more than flows in and never back into it;
 *                 a closed lake none; what reaches the sea down the network is the water budget's
 *   scale         the network the same at every detail (CLAUDE.md: scale invariance): the land draining to the sea, the
 *                 largest rivers' discharge, the drawn rivers' length per area, the river points' regimes, the lakes
 *
 *   node tuning/evolution/drainage.mjs [--seed 10673275] [--cont 30] [--sim 40000] [--time 300]
 *                                      [--cells 160000,640000] [--set key=value,…]
 *
 * The world's history is cached under tuning/evolution/data/ (lib/world.mjs). Exit code 1 when a check fails.
 */

import { check, section, finish } from '../../v2/tools/lib/check-kit.mjs';
import { FINISH } from '../../v2/js/finish/finish-config.js';
import { Water, Regime } from '../../v2/js/finish/finish-hydro.js';
import { worldFrame, finishWorld } from './lib/world.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SEED = Number(arg('--seed', 10673275)), CONT = Number(arg('--cont', 30)), SIM = Number(arg('--sim', 40000)), TIME = Number(arg('--time', 300));
const CELLS = arg('--cells', '160000,640000').split(',').map(Number);
const SET = Object.fromEntries((arg('--set', '') || '').split(',').filter(Boolean).map(kv => { const [k, v] = kv.split('='); return [k, v === 'true' ? true : v === 'false' ? false : Number(v)]; }));
for (const k of Object.keys(SET)) if (!(k in FINISH)) throw new Error(`--set: no constant ${k} in FINISH`);
const F = { ...FINISH, ...SET }, SEC = 3.15576e7, R = 6371;
const CLIMB_KM = 0.001;          // a step up of more than 1 m along the network is a climb
const CLIMB_MAX_KM = 0.1, CLIMB_SHARE = 0.001;   // the pits left: none deeper than 100 m on a river, at most 0.1 % of the land
const DRAWN_M3S = 40;            // the rivers the page draws (finish-view: from 40 m³/s)
const t0 = performance.now(), log = (m) => console.error(`[${((performance.now() - t0) / 1000).toFixed(0)} s] ${m}`);
const pc = (a, b) => `${(100 * a / Math.max(1, b)).toFixed(2)} %`;

const frame = await worldFrame({ seed: SEED, cont: CONT, sim: SIM, time: TIME, log });
console.log(`Evolution world: seed ${SEED}, ${CONT} % continental, ${SIM.toLocaleString()} plate cells, ${TIME} Myr${Object.keys(SET).length ? `; ${JSON.stringify(SET)}` : ''}`);
const measures = [];

for (const cells of CELLS) {
    const fin = await finishWorld({ frame, seed: SEED, sim: SIM, cells, F, network: true });
    log(`finished at ${cells.toLocaleString()} cells`);
    const { mesh, z, lake, lakeLevel, rivers, stats } = fin, { recv, lakeOutlet, q, area, runoff, sea, cellKm2 } = fin.network;
    const n = mesh.numCells, { adjOffset, adjList, xyz } = mesh, w = stats.water;
    const own = c => Math.max(0, runoff[c]) * cellKm2 * 1e3 / SEC;
    const isNb = (a, b) => { for (let k = adjOffset[a]; k < adjOffset[a + 1]; k++) if (adjList[k] === b) return true; return false; };
    const closedKind = k => k === Water.SALT || k === Water.PAN;
    let landN = 0;
    for (let c = 0; c < n; c++) if (!sea[c]) landN++;

    // ── the lakes: a fresh lake's cells by their outlet (its water may lie in parts, behind sills, as one lake); a closed
    // lake's — no outlet — by being connected ──
    const body = new Int32Array(n).fill(-1), bodies = [], byOutlet = new Map();
    for (let s = 0; s < n; s++) {
        if (sea[s] || !lake[s] || body[s] >= 0) continue;
        if (lakeOutlet[s] >= 0) {
            let id = byOutlet.get(lakeOutlet[s]);
            if (id === undefined) { id = bodies.length; byOutlet.set(lakeOutlet[s], id); bodies.push({ kind: lake[s], outlet: lakeOutlet[s], cells: [] }); }
            body[s] = id; bodies[id].cells.push(s);
            continue;
        }
        const id = bodies.length, cellsOf = [s];
        body[s] = id;
        for (let i = 0; i < cellsOf.length; i++) for (let k = adjOffset[cellsOf[i]]; k < adjOffset[cellsOf[i] + 1]; k++) {
            const nb = adjList[k];
            if (!sea[nb] && body[nb] < 0 && lake[nb] === lake[s] && lakeOutlet[nb] < 0) { body[nb] = id; cellsOf.push(nb); }
        }
        bodies.push({ kind: lake[s], outlet: -1, cells: cellsOf });
    }

    section(`${cells.toLocaleString()} cells: connectivity`);
    let dangling = 0, jumps = 0, selfs = 0;
    for (let c = 0; c < n; c++) {
        if (sea[c]) continue;
        const r = recv[c];
        if (r === c) selfs++;
        else if (r < 0) { if (!(lake[c] && closedKind(lake[c]))) dangling++; }
        else if (lake[c] && c !== lakeOutlet[c] ? r !== lakeOutlet[c] : !isNb(c, r)) jumps++;
    }
    check('every land cell drains to a neighbour, a lake cell to its outlet; only a closed lake\'s water goes no further',
        dangling + jumps + selfs === 0, `${dangling} land cells whose water vanishes, ${jumps} receivers that are not a neighbour (or the lake's outlet), ${selfs} self-loops, of ${landN.toLocaleString()} land cells`);
    // (the network in order, sources first: what is left unvisited is in a loop)
    const deg = new Int32Array(n), queue = new Int32Array(landN);
    for (let c = 0; c < n; c++) if (!sea[c] && recv[c] >= 0 && !sea[recv[c]]) deg[recv[c]]++;
    let tail = 0;
    for (let c = 0; c < n; c++) if (!sea[c] && deg[c] === 0) queue[tail++] = c;
    const tree = new Float64Array(n), gather = new Float64Array(n);
    for (let head = 0; head < tail; head++) {
        const c = queue[head], r = recv[c];
        tree[c] += cellKm2;
        if (r >= 0 && !sea[r]) { tree[r] += tree[c]; gather[r] += q[c]; if (--deg[r] === 0) queue[tail++] = r; }
    }
    check('no loops: every land cell\'s water, followed down, reaches the sea or a closed lake', tail === landN, `${(landN - tail).toLocaleString()} land cells in loops`);
    const ends = new Int8Array(n);              // 1 the sea, 2 a closed lake
    for (let i = tail - 1; i >= 0; i--) { const c = queue[i], r = recv[c]; ends[c] = r < 0 ? 2 : sea[r] ? 1 : ends[r]; }
    let toSeaKm2 = 0, toBasinKm2 = 0, areaBad = 0, areaWorst = 0, created = 0, createdWorst = 0;
    for (let c = 0; c < n; c++) {
        if (sea[c]) continue;
        if (ends[c] === 1) toSeaKm2 += cellKm2; else toBasinKm2 += cellKm2;
        if (lake[c]) continue;
        const dev = Math.abs(area[c] - tree[c]) / tree[c];
        if (dev > 1e-3) { areaBad++; areaWorst = Math.max(areaWorst, dev); }
        // (a dry cell passes on its own water and what flows in, less what its bed loses: never more — a lake's outlet
        // passes on its lake's outflow, checked with the lakes)
        if (byOutlet.has(c)) continue;
        const most = own(c) + gather[c];
        if (q[c] > most * (1 + 1e-4) + 1e-6) { created++; createdWorst = Math.max(createdWorst, q[c] - most); }
    }
    check('each dry cell\'s drainage area is what drains into it down the network', areaBad === 0, `${areaBad} cells off by more than 0.1 % (worst ${(100 * areaWorst).toFixed(1)} %)`);
    check('no dry cell passes on more water than its own runoff and what flows into it', created === 0, `${created} cells (worst ${createdWorst.toFixed(2)} m³/s more)`);

    section(`${cells.toLocaleString()} cells: levels`);
    let uneven = 0, unevenWorst = 0, sunk = 0, leaks = 0, leakWorst = 0, shoreCells = 0;
    for (const b of bodies) {
        if (b.kind === Water.PAN) continue;            // (a pan's floor is its level: not flat water)
        let lo = Infinity, hi = -Infinity;
        for (const x of b.cells) { lo = Math.min(lo, lakeLevel[x]); hi = Math.max(hi, lakeLevel[x]); if (lakeLevel[x] < z[x] - 1e-6) sunk++; }
        if (hi - lo > 1e-6) { uneven++; unevenWorst = Math.max(unevenWorst, hi - lo); }
        const L = lo;
        for (const x of b.cells) for (let k = adjOffset[x]; k < adjOffset[x + 1]; k++) {
            const nb = adjList[k];
            if (sea[nb] || lake[nb] || nb === b.outlet) continue;
            shoreCells++;
            // (a remnant of the sea that spills stands at seaCutFloorKm, 3 m — or below sea level, opened to the ocean nearby: the
            // lowland round it may lie down to the sea)
            const low = L <= F.seaCutFloorKm + 1e-6 ? Math.min(0, L) - CLIMB_KM : L - CLIMB_KM;
            if (z[nb] < low) { leaks++; leakWorst = Math.max(leakWorst, L - z[nb]); }
        }
    }
    check('a lake\'s surface is flat and above its bed', uneven === 0 && sunk === 0, `${uneven} lakes not flat (worst ${(1000 * unevenWorst).toFixed(1)} m), ${sunk} lake cells whose water is below the ground`);
    check('a lake\'s shore is not below its surface, but at its outlet', leaks === 0, `${leaks} of ${shoreCells.toLocaleString()} shore cells below the lake (worst ${(1000 * leakWorst).toFixed(0)} m)`);
    let climbs = 0, riverClimbs = 0, climbWorst = 0, riverClimbWorst = 0, dryBelow = 0;
    const saltShore = new Uint8Array(n);
    for (const b of bodies) if (b.kind === Water.SALT) for (const x of b.cells) for (let k = adjOffset[x]; k < adjOffset[x + 1]; k++) saltShore[adjList[k]] = 1;
    for (let c = 0; c < n; c++) {
        if (sea[c] || lake[c]) continue;
        if (z[c] < 0 && !saltShore[c] && !(ends[c] === 2)) dryBelow++;
        const r = recv[c];
        if (r < 0) continue;
        const to = sea[r] ? Math.min(0, z[r]) : lake[r] && lake[r] !== Water.PAN ? lakeLevel[r] : z[r], up = to - z[c];
        if (up > CLIMB_KM) { climbs++; climbWorst = Math.max(climbWorst, up); if (q[c] >= F.riverMinM3s) { riverClimbs++; riverClimbWorst = Math.max(riverClimbWorst, up); } }
    }
    // (a climb is a pit the water cannot leave. A few single cells remain — on 2026-10-29 at most 8 m at 640K, 97 m at
    // 2.56M in 19 cells; before the fixes of that day, 1.1–1.3 % of the land, up to 1,384 m: docs/DRAINAGE_20261029.md)
    check('the rivers run downhill: no river cell climbs more than 100 m to the cell it drains into', riverClimbWorst <= CLIMB_MAX_KM,
        `${riverClimbs} river cells (from ${F.riverMinM3s} m³/s) climb more than 1 m, at most ${(1000 * riverClimbWorst).toFixed(0)} m`);
    check('the land runs downhill: at most 0.1 % of the dry land climbs more than 1 m', climbs <= CLIMB_SHARE * landN,
        `${climbs} cells (${pc(climbs, landN)}), at most ${(1000 * climbWorst).toFixed(0)} m`);
    check('no dry land below sea level draining to the sea, but a salt sea\'s shore', dryBelow === 0, `${dryBelow} cells`);

    section(`${cells.toLocaleString()} cells: outlets`);
    let noOutlet = 0, farOutlet = 0, backflow = 0, overflow = 0, overWorst = 0, closedOut = 0, freshN = 0, closedN = 0;
    // (what flows into a lake: the rain on it — the hydrology counts its surface as land — what drains into its cells, and
    // what drains into its outlet besides the lake)
    const inflowOf = new Float64Array(bodies.length);
    for (let c = 0; c < n; c++) {
        if (sea[c]) continue;
        if (lake[c]) { inflowOf[body[c]] += own(c); continue; }
        const r = recv[c];
        if (r >= 0 && lake[r]) inflowOf[body[r]] += q[c];
        else if (r >= 0 && byOutlet.has(r)) inflowOf[byOutlet.get(r)] += q[c];
    }
    for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        if (closedKind(b.kind)) { closedN++; if (b.outlet >= 0 || b.cells.some(x => recv[x] >= 0)) closedOut++; continue; }
        freshN++;
        const o = b.outlet;
        if (o < 0) { noOutlet++; continue; }
        // (the outlet: the lake's last cell, its water's way out — under water, the dry cell it spills over, or, from a
        // remnant of the sea, the end of the gorge its water leaves by: reached from the lake over ground no higher than
        // its surface)
        if (body[o] !== i && !b.cells.some(x => isNb(x, o))) {
            const L = lakeLevel[b.cells[0]] + CLIMB_KM, seen = new Set(b.cells), st = [...b.cells];
            let reached = false;
            while (st.length && !reached) { const x = st.pop(); for (let k = adjOffset[x]; k < adjOffset[x + 1]; k++) { const nb = adjList[k]; if (seen.has(nb) || sea[nb] || z[nb] > L) continue; if (nb === o) { reached = true; break; } seen.add(nb); st.push(nb); } }
            if (!reached) farOutlet++;
        }
        const inflow = inflowOf[i] + own(o);
        if (q[o] > inflow * (1 + 1e-3) + 1e-6) { overflow++; overWorst = Math.max(overWorst, q[o] / Math.max(1e-9, inflow)); }
        let x = recv[o], g = 0;
        while (x >= 0 && !sea[x] && g < n) { if (body[x] === i) { backflow++; break; } x = recv[x]; g++; }
    }
    check('each fresh lake has one outlet, in it, beside it or at the end of a gorge no higher than it', noOutlet + farOutlet === 0, `${freshN} fresh lakes: ${noOutlet} with no outlet, ${farOutlet} with an outlet it does not reach`);
    check('a fresh lake passes on no more than flows into it, and never back into itself', overflow + backflow === 0, `${overflow} pass on more (worst ×${overWorst.toFixed(3)}), ${backflow} drain back into themselves`);
    check('a closed lake has no outlet: its water goes no further', closedOut === 0, `${closedOut} of ${closedN} closed lakes`);
    let total = 0, mouths = 0;
    const mouthQ = [];
    for (let c = 0; c < n; c++) { if (sea[c]) continue; total += own(c); const r = recv[c]; if (r >= 0 && sea[r]) { mouths += q[c]; mouthQ.push(q[c]); } }
    check('what reaches the sea down the network is the water budget\'s', Math.abs(mouths - w.toSeaShare * total) <= 1e-3 * total && Math.abs(w.toSeaShare + w.toBasinsShare + w.lostShare - 1) < 1e-6,
        `${mouths.toFixed(0)} m³/s at the mouths, the budget's ${(w.toSeaShare * total).toFixed(0)} of ${total.toFixed(0)}; to the sea + to closed basins + lost = ${(w.toSeaShare + w.toBasinsShare + w.lostShare).toFixed(7)}`);

    // ── the measures compared across the details ──
    mouthQ.sort((a, b) => b - a);
    let drawnKm = 0;
    for (let s = 0; s < rivers.start.length; s++) {
        const a = rivers.start[s], b = s + 1 < rivers.start.length ? rivers.start[s + 1] : rivers.lat.length;
        for (let i = a + 1; i < b; i++) {
            if (rivers.q[i - 1] < DRAWN_M3S) continue;
            const la1 = rivers.lat[i - 1] * Math.PI / 180, la2 = rivers.lat[i] * Math.PI / 180, dl = (rivers.lon[i] - rivers.lon[i - 1]) * Math.PI / 180;
            drawnKm += R * Math.acos(Math.min(1, Math.sin(la1) * Math.sin(la2) + Math.cos(la1) * Math.cos(la2) * Math.cos(dl)));
        }
    }
    const reg = [0, 0, 0, 0], drawnPts = [0, 0, 0, 0];
    for (let p = 0; p < rivers.regime.length; p++) { reg[rivers.regime[p]]++; if (rivers.q[p] >= DRAWN_M3S) drawnPts[rivers.regime[p]]++; }
    const drawnN = drawnPts.reduce((a, b) => a + b, 0);
    measures.push({ cells, landKm2: landN * cellKm2, toSea: toSeaKm2 / (toSeaKm2 + toBasinKm2), top: mouthQ.slice(0, 10), drawnKmPer1000: 1000 * drawnKm / (landN * cellKm2),
        steady: drawnPts[Regime.STEADY] / drawnN, flood: drawnPts[Regime.FLOOD] / drawnN, seasonal: (drawnPts[Regime.SEASONAL] + drawnPts[Regime.EPHEMERAL]) / drawnN,
        lakeShare: w.lakeShare, fresh: w.freshLakes, closed: w.saltLakes + w.pans, total, cellKm2, lakeKm2: bodies.map(b => b.cells.length * cellKm2) });
    log(`${cells.toLocaleString()} cells: ${w.freshLakes} fresh lakes, ${w.saltLakes} salt, ${w.pans} pans; climbs on dry land ${climbs}`);
}

if (measures.length > 1) {
    section(`scale: the network at ${measures.map(m => m.cells.toLocaleString()).join(' and ')} cells`);
    const a = measures[0], b = measures.at(-1);
    const rel = (x, y) => Math.abs(x - y) / Math.max(Math.abs(x), Math.abs(y), 1e-12);
    check('the runoff the same (the climate\'s, at every detail)', rel(a.total, b.total) <= 0.02, `${a.total.toFixed(0)} → ${b.total.toFixed(0)} m³/s`);
    check('the land draining to the sea the same, within a point', Math.abs(a.toSea - b.toSea) <= 0.01, `${(100 * a.toSea).toFixed(2)} → ${(100 * b.toSea).toFixed(2)} %`);
    // (one river's basin moves with a divide; the largest together should not)
    const sum10 = m => m.top.reduce((s, v) => s + v, 0);
    check('the ten largest rivers at the sea carry the same, within 10 %, the largest within 20 %', rel(sum10(a), sum10(b)) <= 0.10 && rel(a.top[0], b.top[0]) <= 0.20,
        `${sum10(a).toFixed(0)} → ${sum10(b).toFixed(0)} m³/s; the largest ${a.top[0].toFixed(0)} → ${b.top[0].toFixed(0)}; the next four ${a.top.slice(1, 5).map(v => v.toFixed(0)).join(', ')} → ${b.top.slice(1, 5).map(v => v.toFixed(0)).join(', ')}`);
    check('the drawn rivers\' length per area (from 40 m³/s) the same, within 15 %', rel(a.drawnKmPer1000, b.drawnKmPer1000) <= 0.15, `${a.drawnKmPer1000.toFixed(1)} → ${b.drawnKmPer1000.toFixed(1)} km per 1000 km² of land`);
    check('the drawn river points\' regimes the same, within 5 points', Math.max(Math.abs(a.steady - b.steady), Math.abs(a.flood - b.flood), Math.abs(a.seasonal - b.seasonal)) <= 0.05,
        `steady ${(100 * a.steady).toFixed(1)} → ${(100 * b.steady).toFixed(1)} %, flood season ${(100 * a.flood).toFixed(1)} → ${(100 * b.flood).toFixed(1)} %, seasonal ${(100 * a.seasonal).toFixed(1)} → ${(100 * b.seasonal).toFixed(1)} %`);
    // (the lakes the coarser mesh can draw: from four of its cells — a finer one draws smaller lakes too)
    const T = 4 * Math.max(a.cellKm2, b.cellKm2), big = m => m.lakeKm2.filter(v => v >= T), bigKm2 = m => big(m).reduce((s, v) => s + v, 0) / m.landKm2;
    check(`the lakes from ${Math.round(T).toLocaleString()} km² the same share of the land, within 30 %`, rel(bigKm2(a), bigKm2(b)) <= 0.30,
        `${(100 * bigKm2(a)).toFixed(2)} → ${(100 * bigKm2(b)).toFixed(2)} % (${big(a).length} → ${big(b).length} lakes); all lakes ${(100 * a.lakeShare).toFixed(2)} → ${(100 * b.lakeShare).toFixed(2)} %, fresh ${a.fresh} → ${b.fresh}, closed ${a.closed} → ${b.closed}`);
}
finish('Evolution drainage');
