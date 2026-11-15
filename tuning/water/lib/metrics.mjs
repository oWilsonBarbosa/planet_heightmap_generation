// Metrics for the Earth river check. No model code or observed data is changed here.
// Use the upper median, as historical reports did. Infinite penalties are values,
// not missing observations; NaN is kept out only after callers report invalid data.
export function upperMedian(values) {
    const a = values.filter(v => typeof v === 'number' && !Number.isNaN(v)).sort((a, b) => a - b);
    return a.length ? a[a.length >> 1] : NaN;
}

export const mean = values => values.length ? values.reduce((s, v) => s + v, 0) / values.length : NaN;
const argmax = a => a.reduce((best, v, i) => v > a[best] ? i : best, 0);
const cv = a => a.every(v => v === a[0]) ? 0 : Math.sqrt(mean(a.map(v => (v - mean(a)) ** 2))) / mean(a);
const low = a => Math.max(0.01, Math.min(...a) / mean(a)); // historical low-flow floor, explicit
const top = a => Math.max(...a) / mean(a);
const corr = (a, b) => {
    const ma = mean(a), mb = mean(b);
    let cross = 0, aa = 0, bb = 0;
    for (let i = 0; i < 12; i++) { cross += (a[i] - ma) * (b[i] - mb); aa += (a[i] - ma) ** 2; bb += (b[i] - mb) ** 2; }
    return aa > 0 && bb > 0 ? cross / Math.sqrt(aa * bb) : 0;
};

/** Positive: the simulation comes early. A constant simulation has no peak or phase. */
export function seasonalMetrics(simulated, observed, floodRatio) {
    const valid = a => a?.length === 12 && Array.from(a).every(v => Number.isFinite(v) && v >= 0);
    if (!valid(observed) || !(mean(observed) > 0)) return { seasonalStatus: 'invalid-observed-year' };
    if (!valid(simulated)) return { seasonalStatus: 'invalid-simulated-year' };
    const a = Array.from(simulated), b = Array.from(observed);
    if (!(mean(a) > 0)) return { seasonalStatus: 'zero-simulated-year' };
    if (!(cv(b) > 0)) return { seasonalStatus: 'constant-observed-year' };
    const flat = cv(a) === 0, d = Math.abs(argmax(a) - argmax(b));
    let early = null;
    if (!flat) {
        let best = -Infinity;
        for (let k = -5; k <= 6; k++) {
            const r = corr(a.map((_, i) => a[(i - k + 12) % 12]), b);
            if (r > best) { best = r; early = k; }
        }
    }
    return { seasonalStatus: flat ? 'constant-simulated-year' : 'scored',
        r: flat ? 0 : corr(a, b), peak: flat ? null : Math.min(d, 12 - d) <= 1,
        range: cv(a) / cv(b), low: low(a) / low(b), early,
        top: top(a) / top(b), flood: top(a) >= floodRatio, floodMeasured: top(b) >= floodRatio,
        year: a.map(v => v / mean(a)), measured: b.map(v => v / mean(b)) };
}

function scoreTerm(row) {
    if (row.seasonalStatus === 'invalid-simulated-year' || !Number.isFinite(row.runoff) || row.runoff < 0) return NaN;
    // A zero-flow river is a failure against these positive-flow observations,
    // even when it is absent from the drawn network and has no monthly series.
    if (row.runoff === 0 || row.seasonalStatus === 'zero-simulated-year') return -Infinity;
    if (row.r === undefined) return null; // reported as unavailable, never invented as a flat year
    if (!Number.isFinite(row.r) || !Number.isFinite(row.range) || row.range < 0 || !Number.isFinite(row.low) || row.low < 0) return NaN;
    return row.r - Math.abs(Math.log(row.range)) - 0.5 * Math.abs(Math.log(row.low));
}

export function yearScore(rows) {
    const terms = rows.map(scoreTerm).filter(v => v !== null);
    // Invalid model output invalidates a tuning result. Valid -Infinity remains.
    return terms.some(Number.isNaN) ? NaN : upperMedian(terms);
}

export function compareScores(a, b) {
    if (Number.isNaN(a)) return Number.isNaN(b) ? 0 : 1;
    if (Number.isNaN(b)) return -1;
    return a === b ? 0 : a > b ? -1 : 1;
}

export function summarizeRows(rows) {
    const annual = rows.filter(x => Number.isFinite(x.runoff) && x.runoff >= 0);
    const yr = rows.filter(x => Number.isFinite(x.r));
    const peaks = yr.filter(x => typeof x.peak === 'boolean'), phases = yr.filter(x => Number.isFinite(x.early));
    const statuses = {};
    for (const x of rows) { const k = x.seasonalStatus ?? 'unavailable'; statuses[k] = (statuses[k] ?? 0) + 1; }
    const terms = rows.map(scoreTerm).filter(v => v !== null);
    return { matched: rows.length,
        annual: { n: annual.length, invalid: rows.length - annual.length,
            zero: annual.filter(x => x.runoff === 0).length,
            medianRatio: upperMedian(annual.map(x => x.runoff)),
            withinFactorTwo: annual.length ? annual.filter(x => x.runoff >= 0.5 && x.runoff <= 2).length / annual.length : NaN,
            rmsFactor: annual.length ? 10 ** Math.sqrt(mean(annual.map(x => Math.log10(x.runoff) ** 2))) : NaN },
        seasonal: { n: yr.length, unavailable: rows.length - yr.length, statuses,
            scoreN: terms.length, invalidScoreN: terms.filter(Number.isNaN).length,
            infinitePenaltyN: terms.filter(v => v === -Infinity).length, score: yearScore(rows),
            correlation: upperMedian(yr.map(x => x.r)), peakN: peaks.length,
            peakWithinMonth: peaks.length ? peaks.filter(x => x.peak).length / peaks.length : NaN,
            range: upperMedian(yr.map(x => x.range)), peakRatio: upperMedian(yr.map(x => x.top)), low: upperMedian(yr.map(x => x.low)),
            flood: yr.length ? yr.filter(x => x.flood).length / yr.length : NaN,
            floodMeasured: yr.length ? yr.filter(x => x.floodMeasured).length / yr.length : NaN,
            phaseN: phases.length, early: mean(phases.map(x => x.early)),
            greatN: phases.filter(x => x.great).length, greatEarly: mean(phases.filter(x => x.great).map(x => x.early)) } };
}

// JSON has no infinities or NaN. Keep their meaning rather than silently writing null.
export const metricJson = (_, v) => typeof v === 'number' && !Number.isFinite(v) ? String(v) : v;
