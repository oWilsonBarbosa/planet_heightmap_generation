// Synthetic test planets for the new climate: simple continents on an ocean world, whose climates physics predicts
// without reference to Earth. Each stage must behave sensibly on them — the Earth benchmark alone could be passed
// by memorising Earth. DOM-free; the caller supplies V1's buildSphere (with Delaunator set) and an RNG.
//
// Frame: V1's (y north, lon = atan2(x, z)) — the same as the Earth mesh — so `axes: 'y-up'`.

export const TEST_PLANETS = {
    midlat: {
        label: 'Mid-latitude continent',
        blurb: 'One continent from 20° to 60°N, 80° wide (like a flat North America). Expect: big seasons inland, a mild west coast and a harsh east coast under the westerlies, hot summers and cold winters compared with the sea at the same latitude.',
        blobs: [{ lat: 40, lon: 0, a: 20, b: 40 }],
    },
    tropical: {
        label: 'Tropical continent',
        blurb: 'A flat continent across the equator, 30°S–30°N and 45° wide (the TRACMIP idealised continent). Expect: small seasons near the equator, growing toward 30°; the land warmer than the sea in its summer.',
        blobs: [{ lat: 0, lon: 22.5, a: 30, b: 22.5 }],
    },
    mountains: {
        label: 'Continent with a coastal range',
        blurb: 'The mid-latitude continent with a 3 km mountain range running north–south 8° inland from its west coast (like the Cascades or the Andes). Expect: a wet windward (west) slope under the westerlies and a rain shadow east of the range.',
        blobs: [{ lat: 40, lon: 0, a: 20, b: 40 }],
        ridges: [{ lat0: 24, lat1: 56, lon: -30, halfWidthDeg: 2.5, heightKm: 3 }],
    },
    supercontinent: {
        label: 'Supercontinent',
        blurb: 'One huge continent, 60°S–60°N and 110° wide (Pangaea-like). Expect: extreme seasons deep inside at mid-latitudes, far larger than on the coasts or over the sea.',
        blobs: [{ lat: 0, lon: 0, a: 60, b: 55 }],
    },
};

/** Land height (km, negative = sea floor) at lat/lon (degrees) for a test planet: rounded rectangles, flat interiors. */
export function testPlanetHeightKm(kind, latDeg, lonDeg) {
    let best = Infinity;
    for (const b of TEST_PLANETS[kind].blobs) {
        let dl = lonDeg - b.lon; dl = ((dl + 540) % 360) - 180;
        const d = (Math.abs(latDeg - b.lat) / b.a) ** 6 + (Math.abs(dl) / b.b) ** 6;       // superellipse
        best = Math.min(best, d);
    }
    if (best >= 1) return -4;
    let hKm = 0.15 + 0.25 * Math.min(1, (1 - best) * 3);
    for (const r of TEST_PLANETS[kind].ridges ?? []) {                  // Gaussian ridges, tapered at their ends
        let dl = lonDeg - r.lon; dl = ((dl + 540) % 360) - 180;
        const along = Math.min(1, Math.max(0, Math.min(latDeg - r.lat0, r.lat1 - latDeg) / 4));
        hKm += r.heightKm * along * Math.exp(-((dl / r.halfWidthDeg) ** 2));
    }
    return hKm;
}

/** Build a test planet: { mesh, xyz, elevKm, axes }. */
export function buildTestPlanet(kind, N, buildSphere, rng) {
    const { mesh, r_xyz } = buildSphere(N, 0.75, rng);
    const n = mesh.numRegions, elevKm = new Float32Array(n);
    for (let r = 0; r < n; r++) {
        const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2];
        elevKm[r] = testPlanetHeightKm(kind, Math.asin(Math.max(-1, Math.min(1, y))) * 180 / Math.PI, Math.atan2(x, z) * 180 / Math.PI);
    }
    return { mesh, xyz: r_xyz, elevKm, axes: 'y-up' };
}
