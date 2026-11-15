import test from 'node:test';
import assert from 'node:assert/strict';
import { upperMedian, seasonalMetrics, yearScore, compareScores, summarizeRows, metricJson } from '../tuning/water/lib/metrics.mjs';

const observed = [1, 2, 3, 4, 9, 4, 3, 2, 1, 1, 1, 1];
const row = (sim, obs = observed) => ({ runoff: 1, ...seasonalMetrics(sim, obs, 2) });

test('two constant simulations cannot disappear behind a perfect simulation', () => {
    const perfect = row(observed), flat = row(Array(12).fill(3));
    assert.equal(yearScore([perfect]), 1);
    assert.equal(yearScore([flat, flat, perfect]), -Infinity);
    assert.equal(yearScore([flat]), -Infinity);
    assert.equal(flat.peak, null);
    assert.equal(flat.early, null);
    assert.equal(upperMedian([-Infinity, -Infinity, 1]), -Infinity);
    assert.equal(yearScore([row(Array(12).fill(0.1))]), -Infinity);
});

test('zero annual flow remains a failure without a drawn monthly series', () => {
    const zero = { runoff: 0, seasonalStatus: 'zero-annual-flow' };
    const s = summarizeRows([zero, zero, row(observed)]);
    assert.equal(s.annual.n, 3);
    assert.equal(s.annual.zero, 2);
    assert.equal(s.annual.withinFactorTwo, 1 / 3);
    assert.equal(s.annual.rmsFactor, Infinity);
    assert.equal(s.seasonal.n, 1);
    assert.equal(s.seasonal.scoreN, 3);
    assert.equal(s.seasonal.score, -Infinity);
});

test('missing series, invalid model values and constant observations are distinct', () => {
    const unavailable = { runoff: 0.3, seasonalStatus: 'no-river-series' };
    assert.equal(yearScore([unavailable]), NaN);
    assert.equal(seasonalMetrics(Array(12).fill(2), Array(12).fill(2), 2).seasonalStatus, 'constant-observed-year');
    const invalid = row([...observed.slice(0, 11), NaN]);
    assert.equal(invalid.seasonalStatus, 'invalid-simulated-year');
    assert.ok(Number.isNaN(yearScore([invalid, row(observed)])));
    assert.ok(Number.isNaN(yearScore([{ ...invalid, runoff: 0 }])));
    const s = summarizeRows([unavailable, row(observed), row(Array(12).fill(3))]);
    assert.equal(s.seasonal.n, 2);
    assert.equal(s.seasonal.peakN, 1);
    assert.equal(s.seasonal.phaseN, 1);
    assert.equal(s.seasonal.unavailable, 1);
});

test('phase and peak wrap across the end of the year; flood threshold is configurable', () => {
    const shifted = observed.map((_, i) => observed[(i + 1) % 12]);
    const m = seasonalMetrics(shifted, observed, 2);
    assert.equal(m.early, 1);
    assert.equal(m.peak, true);
    assert.equal(seasonalMetrics(observed, observed, 100).flood, false);
    assert.equal(seasonalMetrics(observed, observed, 1).flood, true);
});

test('ranking and JSON distinguish worst valid penalties from invalid results', () => {
    const scores = [NaN, -Infinity, 0.2, 1, -Infinity].sort(compareScores);
    assert.deepEqual(scores, [1, 0.2, -Infinity, -Infinity, NaN]);
    assert.deepEqual(JSON.parse(JSON.stringify({ rms: Infinity, score: -Infinity, invalid: NaN }, metricJson)),
        { rms: 'Infinity', score: '-Infinity', invalid: 'NaN' });
});
