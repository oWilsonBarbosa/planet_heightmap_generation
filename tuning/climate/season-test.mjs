/**
 * Phase 0 — can the climate be computed at only a few points in the year?
 *
 * Takes Earth's 12 observed monthly means (Beck 1991–2020, 1°), keeps only K of them (the "anchors"), rebuilds
 * 12 months with v2/js/climate/seasons.js, classifies with the Beck rules, and compares with the classification
 * from all 12 months. Tries every anchor phase (the worst phase is what counts: the model's anchors will not
 * line up with Earth's calendar), point vs 3-month-mean anchors, and several rain transforms.
 *
 * Also checks the classifier itself: Köppen from the observed 12 months vs Beck's published 1° map.
 *
 *   node tuning/climate/season-test.mjs
 *
 * Gate (plan): with 4 anchors, ≥ 95 % of land keeps its class and Cs, Cw, Am, Dw each keep ≥ 90 % of their area.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadReferences } from './lib/ref.mjs';
import { compareClasses, groupStats, gridWeights, REGIMES } from './lib/compare.mjs';
import { classifyField, classifyCell } from '../../v2/js/climate/koppen.js';
import { synthesizeCell } from '../../v2/js/climate/seasons.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'results', 'climate');
const LAB_DIR = path.join(__dirname, 'data', 'lab');
const GATE_REGIMES = ['Cs (Mediterranean)', 'Cw (dry-winter temperate)', 'Am (tropical monsoon)', 'Dw (dry-winter continental)'];

const { grid, fields, koppen, land } = loadReferences();
const n = grid.size, T = fields.t2m, P = fields.precip;
const weights = gridWeights(grid);

// 1. The classifier against Beck's own map
const full12 = classifyField(T, P, n, land);
const oracle = compareClasses(koppen, full12, weights, land);
console.log(`Classifier check — observed 12 months → Beck rules vs Beck's published 1° map:`);
console.log(`  exact ${(100 * oracle.exact).toFixed(1)} %   major group ${(100 * oracle.major).toFixed(1)} %   graded ${(100 * oracle.graded).toFixed(1)} %`);
console.log(`  (the map is the majority class of 1 km cells; classifying the 1° mean climate differs at mixed cells)\n`);

// 2. Rebuild 12 months from K anchors
// only: 'both' rebuilds T and P from anchors; 'T' keeps observed rain (12 months); 'P' keeps observed temperature
function runConfig(K, phase, anchor, transform, eps, only = 'both') {
    const out = new Uint8Array(n);
    const tA = new Float64Array(K), pA = new Float64Array(K);
    const T12 = new Float64Array(12), P12 = new Float64Array(12);
    const step = 12 / K;
    for (let c = 0; c < n; c++) {
        if (!land[c]) continue;
        for (let k = 0; k < K; k++) {
            const m = phase + k * step;                       // integer for the configs used here
            if (anchor === 'point') { tA[k] = T[(m % 12) * n + c]; pA[k] = P[(m % 12) * n + c]; }
            else {                                            // 3-month mean centred on m
                let st = 0, sp = 0;
                for (let d = -1; d <= 1; d++) { const mm = ((m + d) % 12 + 12) % 12; st += T[mm * n + c]; sp += P[mm * n + c]; }
                tA[k] = st / 3; pA[k] = sp / 3;
            }
        }
        synthesizeCell(tA, pA, { phase, transform, eps, attenuation: anchor === 'mean3' ? 3 : 0 }, T12, P12);
        if (only === 'T') for (let m = 0; m < 12; m++) P12[m] = P[m * n + c];
        if (only === 'P') for (let m = 0; m < 12; m++) T12[m] = T[m * n + c];
        out[c] = classifyCell(T12, P12);
    }
    return out;
}

const transforms = [['linear', 0], ['sqrt', 0], ['log', 1], ['log', 5], ['log', 20]];
const results = [];
for (const K of [2, 4, 6]) {
    for (const anchor of ['point', 'mean3']) {
        for (const [transform, eps] of transforms) {
            const phases = [];
            for (let phase = 0; phase < 12 / K; phase++) {
                const cls = runConfig(K, phase, anchor, transform, eps);
                const cmp = compareClasses(full12, cls, weights, land);
                const regimes = Object.fromEntries(Object.entries(REGIMES).map(([name, codes]) => [name, groupStats(cmp, codes)]));
                phases.push({ phase, agreement: cmp.exact, graded: cmp.graded, regimes, cls });
            }
            const worst = phases.reduce((a, b) => (b.agreement < a.agreement ? b : a));
            const aligned = phases[0];                        // anchors on Jan / Jul (+ Apr / Oct …): Earth's extremes
            const worstRecall = Object.fromEntries(Object.keys(REGIMES).map(r => [r, Math.min(...phases.map(p => p.regimes[r].recall))]));
            const alignedRecall = Object.fromEntries(Object.keys(REGIMES).map(r => [r, aligned.regimes[r].recall]));
            const worstRatioDev = Object.fromEntries(Object.keys(REGIMES).map(r => [r, Math.max(...phases.map(p => Math.abs(p.regimes[r].areaRatio - 1)))]));
            const passWorst = worst.agreement >= 0.95 && GATE_REGIMES.every(r => worstRecall[r] >= 0.90);
            const passAligned = aligned.agreement >= 0.95 && GATE_REGIMES.every(r => alignedRecall[r] >= 0.90);
            results.push({
                K, anchor, transform: transform === 'log' ? `log ε=${eps}` : transform,
                worstAgreement: worst.agreement, meanAgreement: phases.reduce((s, p) => s + p.agreement, 0) / phases.length,
                alignedAgreement: aligned.agreement, alignedRecall,
                worstRecall, worstRatioDev, pass: passWorst, passAligned, worstPhase: worst.phase, _cls: aligned.cls,
            });
        }
    }
}

// Report
const pct = x => (100 * x).toFixed(1).padStart(5);
const short = { 'Cs (Mediterranean)': 'Cs', 'Cw (dry-winter temperate)': 'Cw', 'Am (tropical monsoon)': 'Am', 'Dw (dry-winter continental)': 'Dw', 'Ds (dry-summer continental)': 'Ds' };
const regimeCols = Object.values(short).map(s => s.padStart(5)).join(' ');
console.log('Rebuilt-from-anchors Köppen vs all-12-months Köppen (land, area-weighted).');
console.log('"aligned" = anchors on Jan/Jul (+Apr/Oct, …), where Earth\'s seasons peak; "worst" = the worst anchor timing.');
console.log(`  K  anchors  rain          agree aligned / worst   recall aligned: ${regimeCols}   | recall worst: ${regimeCols}  gate(aligned/worst)`);
for (const r of results) {
    console.log(`  ${r.K}  ${r.anchor.padEnd(7)}  ${r.transform.padEnd(12)}  ${pct(r.alignedAgreement)} / ${pct(r.worstAgreement)}          `
        + `                ${Object.keys(REGIMES).map(k => pct(r.alignedRecall[k])).join(' ')}   |               ${Object.keys(REGIMES).map(k => pct(r.worstRecall[k])).join(' ')}`
        + `  ${r.passAligned ? 'PASS' : 'fail'}/${r.pass ? 'PASS' : 'fail'}`);
}

const best4 = results.filter(r => r.K === 4).reduce((a, b) => (b.alignedAgreement > a.alignedAgreement ? b : a));
console.log(`\nBest with 4 anchors: ${best4.anchor} anchors, rain ${best4.transform} — aligned agreement ${pct(best4.alignedAgreement)} %, `
    + GATE_REGIMES.map(r => `${short[r]} ${pct(best4.alignedRecall[r])} %`).join(', ') + ` → ${best4.passAligned ? 'GATE PASSED (aligned)' : 'gate not met'}`);

// Where does the 4-anchor error come from — temperature or rain?
const [bT, bE] = best4.transform.startsWith('log') ? ['log', +best4.transform.split('=')[1]] : [best4.transform, 0];
const decomposition = [];
for (const only of ['T', 'P']) {
    const cls = runConfig(4, 0, best4.anchor, bT, bE, only);
    const cmp = compareClasses(full12, cls, weights, land);
    const reg = Object.fromEntries(Object.entries(REGIMES).map(([name, codes]) => [name, groupStats(cmp, codes)]));
    decomposition.push({ rebuilt: only === 'T' ? 'temperature' : 'rain', agreement: cmp.exact,
        recall: Object.fromEntries(Object.keys(REGIMES).map(k => [k, reg[k].recall])) });
    console.log(`  only ${only === 'T' ? 'temperature' : 'rain'} rebuilt from 4 anchors (other observed): agreement ${pct(cmp.exact)} %, `
        + Object.keys(REGIMES).map(k => `${short[k]} ${pct(reg[k].recall)}`).join(', '));
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(LAB_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'season-test.json'), JSON.stringify({
    classifierCheck: { exact: oracle.exact, major: oracle.major, graded: oracle.graded },
    results: results.map(({ _cls, ...r }) => r),
    best4: (({ _cls, ...r }) => r)(best4),
    decomposition4: decomposition,
}, null, 2));
fs.writeFileSync(path.join(LAB_DIR, 'koppen_obs12.u8'), full12);
fs.writeFileSync(path.join(LAB_DIR, 'koppen_obs4.u8'), best4._cls);
const best2 = results.filter(r => r.K === 2).reduce((a, b) => (b.alignedAgreement > a.alignedAgreement ? b : a));
const best6 = results.filter(r => r.K === 6).reduce((a, b) => (b.alignedAgreement > a.alignedAgreement ? b : a));
fs.writeFileSync(path.join(LAB_DIR, 'koppen_obs6.u8'), best6._cls);
fs.writeFileSync(path.join(LAB_DIR, 'koppen_obs2.u8'), best2._cls);
console.log(`\nWrote ${path.relative(process.cwd(), path.join(OUT_DIR, 'season-test.json'))} and lab maps in ${path.relative(process.cwd(), LAB_DIR)}`);
