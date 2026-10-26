/**
 * Compare two Köppen class maps cell by cell, with optional per-cell weights (grid area) — agreement, graded
 * (climatic-distance) agreement, major-group agreement, and per-class recall / precision / F1 / area ratio.
 */

import { KOPPEN_CLASSES } from '../../../v2/js/climate/koppen.js';
import { similarity } from './koppen-distance.mjs';

const NC = KOPPEN_CLASSES.length;

/**
 * @param {Uint8Array} truth  reference classes (0 = not scored)
 * @param {Uint8Array} sim    classes to score (0 counts as a miss when truth > 0)
 * @param {Float64Array|null} weight  per-cell weight (e.g. area); null → 1
 * @param {Uint8Array|null} mask      extra mask (cells with mask 0 skipped)
 */
export function compareClasses(truth, sim, weight = null, mask = null) {
    const conf = Array.from({ length: NC }, () => new Float64Array(NC));
    let total = 0, exact = 0, major = 0, graded = 0;
    for (let c = 0; c < truth.length; c++) {
        const t = truth[c];
        if (!t || (mask && !mask[c])) continue;
        const s = sim[c];
        const w = weight ? weight[c] : 1;
        total += w;
        conf[t][s] += w;
        if (t === s) exact += w;
        if (s && KOPPEN_CLASSES[t].code[0] === KOPPEN_CLASSES[s].code[0]) major += w;
        if (s) graded += w * similarity(t, s);
    }
    const perClass = {};
    let f1Sum = 0, f1N = 0;
    for (let k = 1; k < NC; k++) {
        let tp = conf[k][k], supp = 0, pred = 0;
        for (let j = 0; j < NC; j++) { supp += conf[k][j]; pred += conf[j][k]; }
        if (supp === 0 && pred === 0) continue;
        const recall = supp > 0 ? tp / supp : 0;
        const precision = pred > 0 ? tp / pred : 0;
        const f1 = recall + precision > 0 ? 2 * recall * precision / (recall + precision) : 0;
        perClass[KOPPEN_CLASSES[k].code] = { truthArea: supp / total, simArea: pred / total, areaRatio: supp > 0 ? pred / supp : Infinity, recall, precision, f1 };
        if (supp > 0) { f1Sum += f1; f1N++; }
    }
    return {
        exact: exact / total, major: major / total, graded: graded / total,
        macroF1: f1N ? f1Sum / f1N : 0, perClass, conf, total,
    };
}

/** Sum of per-class stats over a set of codes (e.g. all Cs*): truth area, sim area, recall (area-weighted). */
export function groupStats(result, codes) {
    let tA = 0, sA = 0, tp = 0;
    for (const code of codes) {
        const p = result.perClass[code];
        if (!p) continue;
        tA += p.truthArea; sA += p.simArea; tp += p.recall * p.truthArea;
    }
    return { truthArea: tA, simArea: sA, areaRatio: tA > 0 ? sA / tA : NaN, recall: tA > 0 ? tp / tA : NaN };
}

/** Area weights for a LatLonGrid (cos lat per cell). */
export function gridWeights(grid) {
    const w = new Float64Array(grid.size);
    for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) w[j * grid.w + i] = grid.rowArea[j];
    return w;
}

export const REGIMES = {
    'Cs (Mediterranean)': ['Csa', 'Csb', 'Csc'],
    'Cw (dry-winter temperate)': ['Cwa', 'Cwb', 'Cwc'],
    'Am (tropical monsoon)': ['Am'],
    'Dw (dry-winter continental)': ['Dwa', 'Dwb', 'Dwc', 'Dwd'],
    'Ds (dry-summer continental)': ['Dsa', 'Dsb', 'Dsc', 'Dsd'],
};
