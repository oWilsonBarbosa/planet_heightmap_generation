import test from 'node:test';
import assert from 'node:assert/strict';
import { travelMoments, travelTimes, riverEdgeKm } from '../v2/js/finish/river-travel.js';
import { hydrology, Water } from '../v2/js/finish/finish-hydro.js';
import { FINISH } from '../v2/js/finish/finish-config.js';

const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, String(a) + ' != ' + String(b));
const positions = km => Float64Array.from(km.flatMap(x => [x / 6371, 0, 0])); // controlled straight segments in km
function route(recv, water, km, nodes = recv.map((_, i) => i), through) {
    return travelMoments({ numCells: recv.length, nodes, xyz: positions(km), receiver: c => recv[c], own: c => water[c], through });
}

test('confluence moments agree with two independently measured source paths', () => {
    const m = route([2, 2, 3, -1], [2, 3, 0, 0], [0, 4, 10, 25], [3, 1, 2, 0]);
    near(m.q[3], 5);
    near(m.s1[3], 2 * 25 + 3 * 21);
    near(m.s2[3], 2 * 25 ** 2 + 3 * 21 ** 2);
    near(m.s2[3] / m.q[3] - (m.s1[3] / m.q[3]) ** 2, 3.84);
});

test('reversed receivers are routed before their downstream cell and use the new length', () => {
    const m = route([2, -1, 1], [7, 0, 0], [0, 20, 5], [0, 1, 2]);
    near(m.q[1], 7);
    near(m.s1[2] / m.q[2], 5);
    near(m.s1[1] / m.q[1], 20);
});

test('lake outlet losses scale all moments once; closed lakes pass none', () => {
    const recv = [2, 2, 3, -1], water = [2, 4, 0, 0], km = [0, 6, 10, 15];
    const open = route(recv, water, km, undefined, c => c === 2 ? 0.5 : 1);
    near(open.q[3], 3);
    near(open.s1[3], (2 * 15 + 4 * 9) / 2);
    near(open.s2[3], (2 * 15 ** 2 + 4 * 9 ** 2) / 2);
    const closed = route(recv, water, km, undefined, c => c === 2 ? 0 : 1);
    near(closed.q[3], 0);
    near(closed.s1[3], 0);
    near(closed.s2[3], 0);
});

test('subdivision preserves physical travel distance without a cell-hop threshold', () => {
    for (const n of [2, 11, 101]) {
        const recv = Array.from({ length: n }, (_, i) => i === n - 1 ? -1 : i + 1);
        const m = route(recv, recv.map((_, i) => i === 0 ? 1 : 0), recv.map((_, i) => 1200 * i / (n - 1)));
        near(m.s1[n - 1], 1200);
        near(m.s2[n - 1], 1200 ** 2, 1e-6);
    }
});

test('cycles, inactive receivers and invalid water cannot return a partial result', () => {
    assert.throws(() => route([1, 0], [1, 0], [0, 1]), /Cycle/);
    assert.throws(() => route([1, -1], [1, 0], [0, 1], [0]), /not active/);
    assert.throws(() => route([-1], [NaN], [0]), /water balance/);
});

test('monthly delay preserves the annual volume across New Year and a broad cascade', () => {
    for (const [delay, variance] of [[2, 0], [13.5, 0], [3, 2], [0.1, 4]]) {
        const w = travelTimes(delay, variance, new Float64Array(12));
        near(w.reduce((a, b) => a + b, 0), 1);
        assert.ok(w.every(v => Number.isFinite(v) && v >= 0));
        const impulse = Array.from({ length: 12 }, (_, m) => 120 * w[m]);
        near(impulse.reduce((a, b) => a + b, 0), 120);
        if (delay === 2) { near(impulse[2], 120); near(impulse[0], 0); }
    }
});

test('distance is the physical chord of the sphere', () => {
    near(riverEdgeKm(new Float64Array([1, 0, 0, 0, 1, 0]), 0, 1), 6371 * Math.sqrt(2));
});

test('an aggregated lake can have more than 255 incoming cells', () => {
    const n = 600, recv = Array.from({ length: n + 1 }, (_, i) => i === n ? -1 : n);
    const m = route(recv, recv.map((_, i) => i === n ? 0 : 1), recv.map((_, i) => i));
    near(m.q[n], n);
    near(m.s1[n], n * (n + 1) / 2);
});

function basin(speed) {
    const angles = [0, 1, 3, 8, 18, 19, 20].map(v => v * Math.PI / 180), n = angles.length;
    const xyz = Float64Array.from(angles.flatMap(a => [Math.sin(a), 0, Math.cos(a)]));
    const neighbours = Array.from({ length: n }, (_, i) => [i - 1, i + 1].filter(j => j >= 0 && j < n)), offsets = [0];
    for (const a of neighbours) offsets.push(offsets.at(-1) + a.length);
    const ctx = { mesh: { numCells: n, xyz, adjOffset: Int32Array.from(offsets), adjList: Int32Array.from(neighbours.flat()) },
        z: Float32Array.from([-1, 1, 0.9, 0.8, 0.7, 0.1, 0.2]), ocean: Uint8Array.from([1, 0, 0, 0, 0, 0, 0]),
        runoff: new Float32Array(n).fill(45), pet: new Float32Array(n).fill(100), rain: new Float32Array(n),
        wetMonths: new Float32Array(n).fill(12), network: true, debug: true,
        lat: new Float32Array(n), lon: Float32Array.from(angles, x => x * 180 / Math.PI),
        months: { at: (c, start, count, share, arid) => {
            for (let j = 0; j < count; j++) { share[j] = start + j === 0 ? 1 : 0; arid[j] = 0; }
        } } };
    const out = hydrology(ctx, { ...FINISH, lakeMinKm2: 0, lakeMinDepthM: 0, lakeKeepKm2: 0,
        closedBasins: true, closedBasinPluvial: 1, lakeEvapShare: 1, breachKm: 0,
        riverMinM3s: 1, bedLossMPerYear: 0, riverSpeedKmDay: speed });
    return { ctx, out };
}

test('a closed basin\'s outlet drains into the basin with its own area, not over the rim with the basin\'s', () => {
    const { ctx, out } = basin(40), n = ctx.mesh.numCells, cellKm2 = 4 * Math.PI * 6371 ** 2 / n;
    assert.equal(out.lake[5], Water.SALT);
    assert.equal(out.recv[2], 3); // the outlet, at the rim: it used to point over the rim, toward the sea
    near(out.area[2], cellKm2, 1e-6 * cellKm2); // (Float32 areas)
    assert.ok(out.q[2] > 0);
    // every dry region's area is what drains into it down the network, and its water ends at the sea or the salt lake
    const tree = new Float64Array(n);
    for (const c of [1, 2, 3, 4]) {
        let x = c;
        while (x >= 0 && !ctx.ocean[x] && !out.lake[x]) { tree[x] += cellKm2; x = out.recv[x]; }
        assert.ok(x >= 0 && (ctx.ocean[x] || out.lake[x] === Water.SALT));
    }
    for (const c of [1, 2, 3, 4]) near(out.area[c], tree[c], 1e-6 * tree[c]);
    assert.ok(Array.from(out.rivers.cell).includes(2));
});

test('a real basin redirection changes the hydrograph while conserving its annual flow', () => {
    const instant = basin(0), delayed = basin(40), a = instant.out, b = delayed.out;
    assert.equal(b.recv[3], 4); // it used to drain toward 2 in the original flood order
    near(b.stepKm[3], riverEdgeKm(delayed.ctx.mesh.xyz, 3, 4), 1e-3);
    assert.notEqual(b.stepKm[3], riverEdgeKm(delayed.ctx.mesh.xyz, 3, 2));
    assert.equal(b.lake[5], Water.SALT);
    assert.equal(b.recv[5], -1);
    assert.deepEqual(a.q, b.q);
    assert.deepEqual(a.rivers.cell, b.rivers.cell);
    for (let p = 0; p < b.rivers.cell.length; p++) {
        const before = a.rivers.months.subarray(12 * p, 12 * p + 12), after = b.rivers.months.subarray(12 * p, 12 * p + 12);
        near(after.reduce((s, v) => s + v, 0), before.reduce((s, v) => s + v, 0), 0.5);
    }
    const p = Array.from(b.rivers.cell).indexOf(4);
    assert.ok(b.rivers.months[12 * p + 1] > 0);
    assert.ok(b.rivers.months[12 * p] < a.rivers.months[12 * p]);
    near(b.stats.toSeaShare + b.stats.toBasinsShare + b.stats.lostShare, 1, 1e-7);
});
