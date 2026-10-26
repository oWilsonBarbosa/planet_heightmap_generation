// Craton layout for the starting supercontinent: how many, how big, and where.
// Works on ideal circles ("discs"); landmass.js turns them into noisy outlines. The spacing
// used here already reserves room for that noise, so the hard minimum gaps survive shaping.

import { PLANET_RADIUS_KM } from '../../core/sim-mesh.js';
import { angleBetween, bearingTo, capFraction, destination, randomPoint, tangentBasis } from '../../core/sphere-geom.js';

/**
 * @typedef {Object} Craton
 * @property {number} id        1-based; also its terrane id
 * @property {string} letter    A, B, C… (WBP's bookkeeping)
 * @property {number[]} centre  unit vector
 * @property {number} radius    mean angular radius, radians
 * @property {{k:number, amp:number, phase:number}[]} lobes  low-order outline harmonics (a craton is not a circle)
 * @property {number} reach     largest radius the ideal outline attains = radius × (1 + Σ amp)
 * @property {number[][]} basis  tangent basis at the centre, for bearings
 */

/** Signed angular distance from a point to the craton's ideal (lobed) outline; negative inside. */
export function cratonSignedDistance(k, x, y, z) {
    const d = Math.acos(Math.max(-1, Math.min(1, x * k.centre[0] + y * k.centre[1] + z * k.centre[2])));
    const theta = Math.atan2(x * k.basis[1][0] + y * k.basis[1][1] + z * k.basis[1][2], x * k.basis[0][0] + y * k.basis[0][1] + z * k.basis[0][2]);
    let shape = 1;
    for (const l of k.lobes) shape += l.amp * Math.cos(l.k * theta + l.phase);
    return d - k.radius * shape;
}

/** Angular radii with a guaranteed spread of sizes, scaled so the cratons cover cratonShare × continentalFraction × areaScale of the sphere. */
function cratonRadii(rng, cfg, areaScale = 1) {
    const n = cfg.cratonCount, target = cfg.cratonShare * cfg.continentalFraction * areaScale;
    for (let ratio = cfg.cratonSizeRatio; ; ratio *= 0.93) {
        // a ladder from 1 to `ratio`, bent so that most cores are small and a few are big (real cratons are
        // not evenly graded), and jittered: always some big cores and some small (developer: not honeycombed)
        const shape = Array.from({ length: n }, (_, i) => Math.pow(ratio, n > 1 ? Math.pow(i / (n - 1), cfg.cratonSizeSkew) : 0) * (0.9 + 0.2 * rng()));
        let lo = 0, hi = 1;
        for (let it = 0; it < 40; it++) {
            const k = (lo + hi) / 2;
            const covered = shape.reduce((sum, s) => sum + capFraction(Math.min(Math.PI, s * k)), 0);
            if (covered < target) lo = k; else hi = k;
        }
        const radii = shape.map(s => s * lo);
        const largestKm = 2 * Math.max(...radii) * PLANET_RADIUS_KM;
        if (largestKm <= cfg.cratonMaxDiameterKm || ratio < 1.3) return radii;
    }
}

/** The ideal outline's radius (radians) at bearing `theta` in the craton's tangent basis. */
function radiusAt(k, theta) {
    let shape = 1;
    for (const l of k.lobes) shape += l.amp * Math.cos(l.k * theta + l.phase);
    return k.radius * shape;
}

const OUTLINE_SAMPLES = 72;

/** Points along the ideal outline (unit vectors), cached on the craton. */
function outlinePoints(k) {
    if (k.outline) return k.outline;
    const [e, n] = k.basis, out = [];
    for (let i = 0; i < OUTLINE_SAMPLES; i++) {
        const theta = i * 2 * Math.PI / OUTLINE_SAMPLES, r = radiusAt(k, theta), s = Math.sin(r), c = Math.cos(r), dx = Math.cos(theta), dy = Math.sin(theta);
        out.push([k.centre[0] * c + (e[0] * dx + n[0] * dy) * s, k.centre[1] * c + (e[1] * dx + n[1] * dy) * s, k.centre[2] * c + (e[2] * dx + n[2] * dy) * s]);
    }
    return (k.outline = out);
}

/** Smallest angular distance between two cratons' ideal outlines (0 if they overlap), sampling only when the discs alone cannot tell. */
function outlineGap(a, b) {
    const d = angleBetween(a.centre, b.centre);
    if (d >= a.reach + b.reach) return d - a.reach - b.reach;                         // even the longest lobes cannot meet
    if (d <= a.inner + b.inner) return 0;                                            // even the shortest radii overlap
    const A = outlinePoints(a), B = outlinePoints(b);
    let best = -2;
    for (const p of A) for (const q of B) { const t = p[0] * q[0] + p[1] * q[1] + p[2] * q[2]; if (t > best) best = t; }
    const gap = Math.acos(Math.min(1, best));
    // a point of one outline can sit between two samples of the other: allow for half a sample spacing
    return Math.max(0, gap - Math.max(a.reach, b.reach) * Math.PI / OUTLINE_SAMPLES);
}

/**
 * Pack the cratons into one cluster. Every pair of ideal outlines is at least
 * (cratonMinGapKm + 2 × cratonEdgeNoiseKm) apart — measured between the outlines themselves, not
 * between discs of their full reach, so lobed cores interlock — plus a random extra so belts vary in width.
 * `stretch` (1 → 0) makes the cluster rounder and tighter; the caller lowers it when a layout will not fit.
 * `areaScale` (≤ 1) shrinks every craton's area by that factor — the spacing stays, the cores give way.
 * @returns {{cratons: Craton[], centre: number[], elongation: number}}
 */
export function placeCratons(rng, cfg, stretch = 1, areaScale = 1) {
    const radii = cratonRadii(rng, cfg, areaScale);
    // random order (Fisher–Yates: a sort with a random comparator consumes an engine-dependent number of
    // random draws, which would make the same seed give different worlds in different browsers) …
    const order = radii.map((r, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    // … but start from the largest core so the cluster has a heart
    const big = order.reduce((a, b) => (radii[b] > radii[a] ? b : a));
    order.splice(order.indexOf(big), 1); order.unshift(big);

    const reserve = (cfg.cratonMinGapKm + 2 * cfg.cratonEdgeNoiseKm) / PLANET_RADIUS_KM;
    // Start near the equator. A supercontinent is ~150° across, so centred any higher it drapes over
    // a pole and is unreadable on the flat map; the history carries the pieces wherever they go anyway.
    let centre = randomPoint(rng);
    while (Math.abs(centre[2]) > Math.sin(cfg.startMaxLatitudeDeg * Math.PI / 180)) centre = randomPoint(rng);
    const axis = rng() * Math.PI, elongation = rng() * cfg.clusterElongation * stretch;   // 0 = round cluster, →1 = stretched along `axis`
    const placed = [];

    for (const idx of order) {
        const radius = radii[idx];
        // outline harmonics: k = 1 makes it egg-shaped, 2 oval, 3–5 lobed; each craton has its own raggedness,
        // so some cores come out nearly round and others deeply lobed
        const ragged = 0.4 + 0.6 * rng();
        const lobes = [1, 2, 3, 4, 5].map(k => ({ k, amp: ragged * rng() * cfg.cratonLobes / Math.sqrt(k), phase: rng() * 6.283 }));
        const sumAmp = lobes.reduce((sum, l) => sum + l.amp, 0), reach = radius * (1 + sumAmp), inner = radius * Math.max(0.2, 1 - sumAmp);
        const make = at => ({ centre: at, radius, lobes, reach, inner, basis: tangentBasis(at) });
        if (placed.length === 0) { placed.push(make(centre)); continue; }
        let best = null, bestScore = Infinity;
        for (let tries = 0; tries < 400 && (tries < 80 || !best); tries++) {
            const anchor = placed[(rng() * placed.length) | 0];
            const gap = reserve * (1 + rng() * cfg.gapVariety * stretch), bearing = rng() * 2 * Math.PI;
            // start where the anchor's outline actually is along this bearing, then back off until the outlines clear
            let p = null, candidate = null;
            const near = radiusAt(anchor, bearing) + inner + gap, far = anchor.reach + reach + gap, steps = Math.max(1, Math.ceil((far - near) / (0.25 * gap)));
            for (let i = 0; i <= steps; i++) {
                p = destination(anchor.centre, bearing, near + (far - near) * i / steps); candidate = make(p);
                if (i === steps || outlineGap(anchor, candidate) >= gap) break;         // (at `far` the discs alone clear)
            }
            if (placed.some(o => o !== anchor && outlineGap(o, candidate) < reserve)) continue;
            // compact, but cheaper along the cluster's long axis
            const across = Math.abs(Math.sin(bearingTo(centre, p) - axis));
            const score = angleBetween(p, centre) * (1 + 1.6 * elongation * across) + rng() * cfg.clusterLooseness * stretch;
            if (score < bestScore) { bestScore = score; best = p; }
        }
        if (!best) return null;                                   // could not fit — caller retries
        placed.push(make(best));
    }
    const cratons = placed.map((c, i) => ({ id: i + 1, letter: String.fromCharCode(65 + i), ...c }));
    return { cratons, centre, elongation };
}
