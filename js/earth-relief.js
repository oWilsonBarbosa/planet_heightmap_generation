// Earth-like heights for a V1 planet.
//
// The generator's height curve (js/color-map.js elevToHeightKm) is drawn for the eye: land 6·t⁴·(5 − 4t) km keeps the
// lowlands flat at sea level. On planet 06cy8w6z6a89kow6psje93 half the land lies below 28 m and a third below 10 m,
// the sea is 2.3 km deep on average with almost no shelf; Earth's land (Antarctica aside) is 442 m at the median and
// 830 m on average, 2 % of it below 10 m, its sea 3.7 km deep with 7 % of it shelf above 200 m. The climate cools
// 6.5 °C a kilometre up, so a planet that low is warm inland, without plateaus, its rivers on the flat.
//
// earthLikeHeights() keeps every region's place in its planet's order — the same coasts, the same mountains, the same
// way down for the water — and gives it the height Earth has at the same place in Earth's order: the land onto how much
// of Earth's land lies below each height, the sea floor onto how much of Earth's lies above each depth. Earth's two
// curves are ETOPO 2022's (NOAA NCEI, public domain), sampled every 6 arc-minutes and weighed by area, the land without
// Antarctica, whose height is the thickness of its ice: tuning/relief/fetch-etopo.mjs computes them. Nothing here is
// run by the pages yet: for headless exports (Node), next to js/water-new.js.

/** Earth's land height (km) at each half per cent of its area, from the lowest: 442 m at the median, 7.4 km at the top. */
export const EARTH_LAND_KM = [0, 0.002, 0.004, 0.006, 0.009, 0.013, 0.017, 0.021, 0.025, 0.029, 0.033, 0.036, 0.04, 0.044, 0.047, 0.05, 0.054, 0.057, 0.061, 0.064, 0.068, 0.072, 0.076, 0.08, 0.083, 0.087, 0.091, 0.095, 0.099, 0.102, 0.106, 0.109, 0.113, 0.117, 0.12, 0.124, 0.128, 0.132, 0.135, 0.139, 0.143, 0.147, 0.15, 0.154, 0.158, 0.162, 0.167, 0.171, 0.175, 0.18, 0.184, 0.188, 0.193, 0.197, 0.202, 0.207, 0.211, 0.216, 0.221, 0.226, 0.231, 0.236, 0.241, 0.246, 0.251, 0.256, 0.261, 0.266, 0.271, 0.275, 0.28, 0.285, 0.29, 0.294, 0.299, 0.304, 0.309, 0.314, 0.319, 0.324, 0.329, 0.334, 0.339, 0.345, 0.35, 0.355, 0.361, 0.367, 0.373, 0.378, 0.384, 0.39, 0.395, 0.401, 0.406, 0.412, 0.418, 0.424, 0.43, 0.436, 0.442, 0.449, 0.456, 0.463, 0.47, 0.476, 0.484, 0.491, 0.499, 0.507, 0.515, 0.524, 0.532, 0.541, 0.55, 0.559, 0.568, 0.578, 0.588, 0.598, 0.609, 0.62, 0.631, 0.642, 0.654, 0.666, 0.679, 0.692, 0.706, 0.719, 0.733, 0.749, 0.764, 0.78, 0.795, 0.812, 0.829, 0.846, 0.864, 0.882, 0.9, 0.918, 0.935, 0.952, 0.97, 0.988, 1.006, 1.024, 1.042, 1.06, 1.079, 1.096, 1.114, 1.133, 1.15, 1.17, 1.19, 1.211, 1.233, 1.257, 1.282, 1.307, 1.334, 1.362, 1.392, 1.423, 1.457, 1.492, 1.53, 1.57, 1.612, 1.657, 1.705, 1.757, 1.811, 1.869, 1.932, 1.995, 2.062, 2.131, 2.206, 2.285, 2.367, 2.452, 2.54, 2.629, 2.723, 2.823, 2.925, 3.029, 3.126, 3.227, 3.349, 3.481, 3.614, 3.749, 4.001, 4.397, 4.727, 5.037, 7.378];

/** Earth's sea depth (km) at each half per cent of its area, from the shallowest: 4.1 km at the median, 10.6 at the deepest. */
export const EARTH_SEA_DEPTH_KM = [0, 0.008, 0.016, 0.023, 0.031, 0.039, 0.047, 0.055, 0.064, 0.074, 0.087, 0.102, 0.121, 0.145, 0.179, 0.224, 0.279, 0.34, 0.41, 0.486, 0.574, 0.69, 0.827, 0.973, 1.11, 1.237, 1.358, 1.474, 1.59, 1.699, 1.801, 1.899, 1.993, 2.08, 2.162, 2.241, 2.318, 2.392, 2.459, 2.525, 2.586, 2.642, 2.695, 2.744, 2.789, 2.832, 2.875, 2.917, 2.958, 2.996, 3.033, 3.068, 3.102, 3.135, 3.166, 3.196, 3.224, 3.251, 3.278, 3.305, 3.331, 3.356, 3.38, 3.405, 3.429, 3.452, 3.475, 3.498, 3.52, 3.541, 3.562, 3.583, 3.603, 3.623, 3.643, 3.663, 3.682, 3.702, 3.721, 3.74, 3.759, 3.778, 3.796, 3.814, 3.832, 3.85, 3.868, 3.886, 3.904, 3.921, 3.939, 3.956, 3.974, 3.991, 4.007, 4.024, 4.041, 4.058, 4.074, 4.091, 4.108, 4.124, 4.14, 4.156, 4.172, 4.188, 4.203, 4.219, 4.234, 4.25, 4.265, 4.28, 4.295, 4.309, 4.324, 4.338, 4.353, 4.367, 4.382, 4.396, 4.41, 4.425, 4.439, 4.454, 4.469, 4.484, 4.499, 4.514, 4.529, 4.544, 4.559, 4.575, 4.591, 4.606, 4.622, 4.637, 4.653, 4.668, 4.684, 4.7, 4.716, 4.733, 4.75, 4.766, 4.783, 4.799, 4.816, 4.832, 4.848, 4.864, 4.88, 4.896, 4.913, 4.929, 4.945, 4.961, 4.976, 4.992, 5.008, 5.024, 5.04, 5.055, 5.071, 5.087, 5.103, 5.118, 5.134, 5.15, 5.166, 5.182, 5.198, 5.215, 5.232, 5.25, 5.268, 5.286, 5.305, 5.323, 5.342, 5.361, 5.38, 5.4, 5.421, 5.441, 5.464, 5.487, 5.511, 5.536, 5.563, 5.59, 5.62, 5.651, 5.685, 5.721, 5.763, 5.811, 5.862, 5.924, 6.003, 6.144, 10.567];

/**
 * The climate's settings for a planet on these heights (v2/js/climate/config.js setParams): the air's supply of rain
 * bounded. Raised to Earth's heights, planet 06cy8w6z6a89kow6psje93's broad coastal ranges in moist trade winds drew up
 * to 16 m a year out of 1° cells (20 m a region; 0.06 % of its land above 10 m) — Earth's wettest 1° cells get ≈ 7.5 m,
 * its wettest stations ≈ 11.9 m. Bounded: at most 12.8 m a region, 0.018 % of the land above 10 m. Earth's own climate
 * is the same with the bound as without (Köppen against Kottek and against Beck, the stages' guardrails). And ice sheets
 * started only on land 0.6 km high or more (TEMP_ICE_START_KM): the climate starts every cold land under ice and keeps the
 * sheets that hold themselves, and on the same planet its lowland at 70–80° N, beside a polar sea frozen all year, kept
 * them — ice caps on half to most of it, summers 6–10 °C colder than Earth's at those latitudes, whose Arctic lowland is
 * tundra. Started on high land only, it is tundra (warmest month 6.9 and 3.8 °C at 70–75 and 75–80° N; Earth's simulated
 * 8.8 and 3.4, observed 8.7 and 2.9); Earth's own climate all but the same (Köppen against Beck 47.9 → 48.0 % exact;
 * docs/ARCTIC_20261029.md).
 */
export const EARTH_RELIEF_CLIMATE = Object.freeze({ RAIN_SUPPLY_START_MM: 5000, RAIN_SUPPLY_MAX_MM: 7500, TEMP_ICE_START_KM: 0.6 });

/** The lowest land, so that land stays above the sea (km). */
const LAND_FLOOR_KM = 1e-4;

/**
 * Each region's height (km) on Earth's curves, its order kept: land (elev > 0) onto EARTH_LAND_KM, sea (elev ≤ 0) onto
 * EARTH_SEA_DEPTH_KM — the planet's own heights at each half per cent, joined piecewise linearly to Earth's at the same
 * share. Equal elevations get equal heights (a run of equal knots takes the middle of Earth's span), so a flat stays flat.
 * @param {Float32Array} elev  V1's elevation, ≤ 0 water
 * @returns {Float32Array} heights in km, sea floor negative
 */
export function earthLikeHeights(elev) {
    const n = elev.length;
    let nl = 0;
    for (let r = 0; r < n; r++) if (elev[r] > 0) nl++;
    const landV = new Float32Array(nl), seaV = new Float32Array(n - nl);
    for (let r = 0, a = 0, b = 0; r < n; r++) { if (elev[r] > 0) landV[a++] = elev[r]; else seaV[b++] = -elev[r]; }
    landV.sort(); seaV.sort();
    const knots = (v) => Float64Array.from({ length: 201 }, (_, k) => v[Math.round(k / 200 * (v.length - 1))]);
    const landK = knots(landV), seaK = knots(seaV);
    // (the height at x: between the knots around it, or the middle of a run of knots equal to it)
    const onto = (x, K, E) => {
        let lo = 0, hi = 200;
        while (lo < hi) { const m = (lo + hi) >> 1; if (K[m] < x) lo = m + 1; else hi = m; }   // first knot ≥ x
        if (lo === 0) return E[0];
        if (K[lo] > x) return E[lo - 1] + (E[lo] - E[lo - 1]) * (x - K[lo - 1]) / (K[lo] - K[lo - 1]);
        let last = lo;
        while (last < 200 && K[last + 1] === x) last++;
        return (E[lo] + E[last]) / 2;
    };
    const out = new Float32Array(n);
    for (let r = 0; r < n; r++) {
        const e = elev[r];
        out[r] = e > 0 ? Math.max(LAND_FLOOR_KM, onto(e, landK, EARTH_LAND_KM)) : -onto(-e, seaK, EARTH_SEA_DEPTH_KM);
    }
    return out;
}
