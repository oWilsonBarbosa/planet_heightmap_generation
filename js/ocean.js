// Ocean current simulation: rule-based geographic approach with wind-belt-driven gyres.
// Wind belts drive zonal currents; continental shelves deflect them into gyres.
// Warmth is classified geographically: western coasts = warm, eastern coasts = cold.
//
// Gyres. A subtropical gyre turns poleward along a basin's WESTERN edge (strong: Gulf
// Stream, Kuroshio) and equatorward along its EASTERN edge (weaker, broad: Canary,
// California, Humboldt, Benguela); a subpolar gyre is the reverse. See gyreSense().

console.log('[ocean.js] Module loaded');
import { smoothstep } from './wind.js';
import { makeItczLookup, percentile } from './climate-util.js';

const DEG = Math.PI / 180;

// ── Coast distance & classification via BFS ─────────────────────────────────

function computeCoastFields(mesh, r_xyz, r_isOcean,
    r_eastX, r_eastY, r_eastZ, ballHops) {
    const { adjOffset, adjList, numRegions } = mesh;

    const westSeeds = [];
    const eastSeeds = [];
    const allCoastSeeds = [];

    for (let r = 0; r < numRegions; r++) {
        if (!r_isOcean[r]) continue;

        let landDirX = 0, landDirY = 0, landDirZ = 0;
        let hasLandNeighbor = false;

        const end = adjOffset[r + 1];
        for (let ni = adjOffset[r]; ni < end; ni++) {
            const nb = adjList[ni];
            if (!r_isOcean[nb]) {
                hasLandNeighbor = true;
                landDirX += r_xyz[3 * nb] - r_xyz[3 * r];
                landDirY += r_xyz[3 * nb + 1] - r_xyz[3 * r + 1];
                landDirZ += r_xyz[3 * nb + 2] - r_xyz[3 * r + 2];
            }
        }

        if (!hasLandNeighbor) continue;

        allCoastSeeds.push(r);

        // Project land direction into tangent frame east component
        const normalE = landDirX * r_eastX[r] + landDirY * r_eastY[r] + landDirZ * r_eastZ[r];

        // normalE < -0.2 → land is to the west → western coast seed
        // normalE > +0.2 → land is to the east → eastern coast seed
        if (normalE < -0.2) {
            westSeeds.push(r);
        } else if (normalE > 0.2) {
            eastSeeds.push(r);
        } else {
            if (normalE <= 0) westSeeds.push(r);
            else eastSeeds.push(r);
        }
    }

    // BFS: compute hop distance from seed set through ocean cells.
    // Reuses a single queue array (capacity allocated once) across all three passes.
    const bfsQueue = new Int32Array(numRegions);

    // `carry` (optional, one value per region, set on the seeds) is handed on to every
    // water cell from the neighbour it was reached through, i.e. from its nearest seed.
    function bfsDistance(seeds, carry) {
        const dist = new Int32Array(numRegions);
        dist.fill(-1);
        let qLen = 0;
        for (const s of seeds) {
            dist[s] = 0;
            bfsQueue[qLen++] = s;
        }
        let head = 0;
        while (head < qLen) {
            const r = bfsQueue[head++];
            const d = dist[r] + 1;
            const end = adjOffset[r + 1];
            for (let ni = adjOffset[r]; ni < end; ni++) {
                const nb = adjList[ni];
                if (r_isOcean[nb] && dist[nb] === -1) {
                    dist[nb] = d;
                    if (carry) carry[nb] = carry[r];
                    bfsQueue[qLen++] = nb;
                }
            }
        }
        return dist;
    }

    // Which way does the land lie, as seen from the water beside it? Each coast seed
    // averages the east component of the direction to every land cell within ballHops,
    // so a cove or a fjord facing west on an east-facing shore cannot flip it: the
    // continent behind it decides. +1 = land due east (the basin's eastern boundary),
    // −1 = land due west, 0 = land to the north or south, or on both sides. A seed's
    // value passes to the water out to the edge of the coast window as it is reached.
    // (Classifying every seed by its own two or three land neighbours, as the warm/cold
    // seeds above do, flips with every notch in the shore, so most coastal water ends up
    // with both kinds of coast a few cells away.)
    const r_landEast = new Float32Array(numRegions);
    {
        const stamp = new Int32Array(numRegions);
        const hops = new Uint8Array(numRegions);
        let mark = 0;
        for (const s of allCoastSeeds) {
            mark++;
            const sx = r_xyz[3 * s], sy = r_xyz[3 * s + 1], sz = r_xyz[3 * s + 2];
            const ex = r_eastX[s], ey = r_eastY[s], ez = r_eastZ[s];
            let head = 0, qLen = 1, cosSum = 0, landN = 0;
            bfsQueue[0] = s; stamp[s] = mark; hops[s] = 0;
            while (head < qLen) {
                const c = bfsQueue[head++];
                if (!r_isOcean[c]) {
                    const dx = r_xyz[3 * c] - sx, dy = r_xyz[3 * c + 1] - sy, dz = r_xyz[3 * c + 2] - sz;
                    cosSum += (dx * ex + dy * ey + dz * ez) / Math.sqrt(dx * dx + dy * dy + dz * dz);
                    landN++;
                }
                if (hops[c] >= ballHops) continue;
                const end = adjOffset[c + 1];
                for (let ni = adjOffset[c]; ni < end; ni++) {
                    const nb = adjList[ni];
                    if (stamp[nb] !== mark) {
                        stamp[nb] = mark;
                        hops[nb] = hops[c] + 1;
                        bfsQueue[qLen++] = nb;
                    }
                }
            }
            // Mean cosine is 2/π for land filling one half-plane: scale so a straight
            // north–south shore reads ±1. A shore with little land behind it (an islet:
            // a few percent of the ball against ~half for a continent) drives no
            // boundary current, so it fades out.
            r_landEast[s] = landN
                ? Math.max(-1, Math.min(1, (Math.PI / 2) * cosSum / landN)) * smoothstep(0.08, 0.3, landN / qLen)
                : 0;
        }
    }

    const r_coastDist = bfsDistance(allCoastSeeds, r_landEast);
    const r_westCoastDist = bfsDistance(westSeeds);
    const r_eastCoastDist = bfsDistance(eastSeeds);

    return { r_coastDist, r_westCoastDist, r_eastCoastDist, r_landEast };
}

// ── Circumpolar channel detection ───────────────────────────────────────────

function hasCircumpolarChannel(r_lat, r_lon, r_isOcean, numRegions, targetLat, bandWidth) {
    const NUM_BINS = 72;
    const binHasOcean = new Uint8Array(NUM_BINS);
    const latMin = targetLat - bandWidth;
    const latMax = targetLat + bandWidth;

    for (let r = 0; r < numRegions; r++) {
        if (!r_isOcean[r]) continue;
        const lat = r_lat[r];
        if (lat < latMin || lat > latMax) continue;

        let bin = Math.floor(((r_lon[r] + Math.PI) / (2 * Math.PI)) * NUM_BINS);
        bin = ((bin % NUM_BINS) + NUM_BINS) % NUM_BINS;
        binHasOcean[bin] = 1;
    }

    for (let i = 0; i < NUM_BINS; i++) {
        if (!binHasOcean[i]) return false;
    }
    return true;
}

// ── Gyre sense ──────────────────────────────────────────────────────────────
// +1: the subtropical sense (poleward on a basin's western edge, equatorward on its
// eastern edge); −1: the subpolar sense, the reverse. Earth's subtropical gyres reach
// ~45° (the Gulf Stream and Kuroshio run poleward to ~40–45°, the California and
// Canary currents equatorward from ~45°) and its subpolar gyres sit at ~50–65°
// (Labrador and Oyashio equatorward, Alaska and Norwegian currents poleward). The
// polar cell goes back to the subtropical sense. bandLatDeg is the season-shifted
// latitude, as for the wind bands.

function gyreSense(bandLatDeg) {
    if (bandLatDeg < 40) return 1;
    if (bandLatDeg < 50) return 1 - 2 * smoothstep(40, 50, bandLatDeg);
    if (bandLatDeg < 60) return -1;
    if (bandLatDeg < 70) return -1 + 2 * smoothstep(60, 70, bandLatDeg);
    return 1;
}

// ── Geographic heat classification ──────────────────────────────────────────
// Warmth is determined by coast type and wind cell. The prevailing wind
// direction determines which side of a basin accumulates warm water:
//   Hadley cell (trades westward):   western=warm, eastern=cold
//   Ferrel cell (westerlies eastward): western=cold, eastern=warm  (flipped)
//   Polar cell (easterlies westward):  western=warm, eastern=cold  (flipped back)

function classifyWarmth(r_isOcean, r_lat, numRegions,
    r_westCoastDist, r_eastCoastDist, fadeRange, seasonalShiftDeg) {
    const r_warmth = new Float32Array(numRegions);

    for (let r = 0; r < numRegions; r++) {
        if (!r_isOcean[r]) continue;

        // Shifted latitude for cell boundaries (matches wind band shift)
        const bandLatDeg = Math.abs(r_lat[r] / DEG - seasonalShiftDeg);

        // Wind cell sign: trades/polar push water west (western=warm → +1),
        // westerlies push water east (western=cold → -1)
        let cellSign;
        if (bandLatDeg < 28) {
            cellSign = 1;
        } else if (bandLatDeg < 35) {
            cellSign = 1 - 2 * smoothstep(28, 35, bandLatDeg);
        } else if (bandLatDeg < 55) {
            cellSign = -1;
        } else if (bandLatDeg < 65) {
            cellSign = -1 + 2 * smoothstep(55, 65, bandLatDeg);
        } else {
            cellSign = 1;
        }

        const wDist = r_westCoastDist[r];
        const eDist = r_eastCoastDist[r];

        let warm = 0;

        if (wDist >= 0 && wDist < fadeRange) {
            const t = 1 - wDist / fadeRange;
            warm += cellSign * t * t;
        }

        if (eDist >= 0 && eDist < fadeRange) {
            const t = 1 - eDist / fadeRange;
            warm -= cellSign * t * t;
        }

        r_warmth[r] = Math.max(-1, Math.min(1, warm));
    }

    return r_warmth;
}

// ── Laplacian smoothing (ocean only) ────────────────────────────────────────

function smoothOcean(mesh, field, r_isOcean, passes) {
    const { adjOffset, adjList, numRegions } = mesh;
    const tmp = new Float32Array(numRegions);

    for (let pass = 0; pass < passes; pass++) {
        for (let r = 0; r < numRegions; r++) {
            if (!r_isOcean[r]) { tmp[r] = field[r]; continue; }

            let sum = field[r], count = 1;
            const end = adjOffset[r + 1];
            for (let ni = adjOffset[r]; ni < end; ni++) {
                const nb = adjList[ni];
                if (r_isOcean[nb]) {
                    sum += field[nb];
                    count++;
                }
            }
            tmp[r] = sum / count;
        }
        field.set(tmp);
    }
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Compute ocean surface currents using rule-based geographic approach.
 * Wind belts drive zonal currents, continental shelves deflect them into
 * gyres. Warmth is classified geographically by coast type.
 *
 * @param {SphereMesh} mesh
 * @param {Float32Array} r_xyz - per-region 3D positions
 * @param {Float32Array} r_elevation - per-region elevation
 * @param {object} windResult - output from computeWind() (includes lat, lon, sinLat, isLand, tangent frames, ITCZ arrays)
 * @returns {object} current vectors, warmth, and speed arrays for both seasons
 */
export function computeOceanCurrents(mesh, r_xyz, r_elevation, windResult) {
    console.log('[ocean.js] computeOceanCurrents called, numRegions:', mesh.numRegions);
    const numRegions = mesh.numRegions;
    const avgEdgeKm = (Math.PI * 6371) / Math.sqrt(numRegions);
    const timing = [];

    const { r_lat, r_sinLat, r_isLand,
        r_eastX, r_eastY, r_eastZ,
        r_northX, r_northY, r_northZ } = windResult;

    // Ocean mask
    const r_isOcean = new Uint8Array(numRegions);
    for (let r = 0; r < numRegions; r++) r_isOcean[r] = r_isLand[r] ? 0 : 1;

    // Step 0: Setup — r_lon and ITCZ lookups
    let t0 = performance.now();
    let r_lon = windResult.r_lon;
    if (!r_lon) {
        r_lon = new Float32Array(numRegions);
        for (let r = 0; r < numRegions; r++) {
            r_lon[r] = Math.atan2(r_xyz[3 * r], r_xyz[3 * r + 2]);
        }
    }

    const itczLookupSummer = makeItczLookup(windResult.itczLons, windResult.itczLatsSummer);
    const itczLookupWinter = makeItczLookup(windResult.itczLons, windResult.itczLatsWinter);
    timing.push({ stage: 'Ocean: setup (ITCZ lookup + lon)', ms: performance.now() - t0 });

    // Step 1: Coast distance & classification (shared between seasons)
    t0 = performance.now();
    // Coast orientation is read over ~175 km, so a notch in the shore does not flip it
    const coastBallHops = Math.max(3, Math.round(175 / avgEdgeKm));
    const { r_coastDist, r_westCoastDist, r_eastCoastDist, r_landEast } =
        computeCoastFields(mesh, r_xyz, r_isOcean,
            r_eastX, r_eastY, r_eastZ, coastBallHops);
    timing.push({ stage: 'Ocean: coast BFS (3 passes) + coast orientation', ms: performance.now() - t0 });

    // Step 2: Circumpolar channel detection
    t0 = performance.now();
    const circumpolarNH = hasCircumpolarChannel(r_lat, r_lon, r_isOcean, numRegions, 60 * DEG, 5 * DEG);
    const circumpolarSH = hasCircumpolarChannel(r_lat, r_lon, r_isOcean, numRegions, -60 * DEG, 5 * DEG);
    console.log(`[ocean.js] Circumpolar: NH=${circumpolarNH}, SH=${circumpolarSH}`);
    timing.push({ stage: 'Ocean: circumpolar detection', ms: performance.now() - t0 });

    // Coast influence threshold
    const coastThreshold = Math.max(5, Math.round(Math.sqrt(numRegions) * 0.035));
    // Warmth fade range — extends beyond coast deflection zone
    const warmthRange = coastThreshold * 2;

    const result = {};
    const seasons = [
        { name: 'summer', itczLookup: itczLookupSummer },
        { name: 'winter', itczLookup: itczLookupWinter }
    ];

    for (const { name, itczLookup } of seasons) {
        // Seasonal shift: wind cells migrate ~5° toward summer hemisphere
        const seasonalShiftDeg = name === 'summer' ? 5 : -5;

        // Steps 3–4: Wind band classification + current vectors
        t0 = performance.now();
        const currentE = new Float32Array(numRegions);
        const currentN = new Float32Array(numRegions);

        for (let r = 0; r < numRegions; r++) {
            if (!r_isOcean[r]) continue;

            const lat = r_lat[r];
            const absLatDeg = Math.abs(lat) / DEG;
            const lon = r_lon[r];
            const hemisphereSign = lat >= 0 ? 1 : -1;

            // Shifted latitude for wind band boundaries (cells migrate with season)
            const bandLatDeg = Math.abs(lat / DEG - seasonalShiftDeg);

            // ITCZ latitude at this longitude
            const itczLat = itczLookup(lon);
            const distFromItcz = Math.abs(lat - itczLat) / DEG;

            // Step 3: Base zonal flow from wind band (using shifted boundaries)
            let baseE;
            if (distFromItcz < 3) {
                // ITCZ zone: eastward countercurrent at center, blends to westward at edges
                baseE = 1 - 2 * smoothstep(0, 3, distFromItcz);
            } else if (bandLatDeg < 30) {
                // Trade winds: westward
                baseE = -1;
            } else if (bandLatDeg < 35) {
                // Subtropical transition: blend trades → westerlies
                baseE = -1 + 2 * smoothstep(30, 35, bandLatDeg);
            } else if (bandLatDeg < 58) {
                // Ferrel cell / westerlies: eastward
                baseE = 1;
            } else if (bandLatDeg < 65) {
                // Subpolar transition: blend westerlies → polar easterlies
                baseE = 1 - 1.5 * smoothstep(58, 65, bandLatDeg);
            } else {
                // Polar easterlies: weak westward
                baseE = -0.5;
            }

            currentE[r] = baseE;
            currentN[r] = 0;

            // Step 4: Coast deflection, by the orientation of the nearest coast. Beside a
            // western boundary the flow turns along the shore, strongly (western
            // intensification ×2); beside an eastern boundary it turns the other way,
            // weaker and broader (×0.8). Coasts running mostly east–west deflect little.
            // (An earlier version added a western and an eastern term at once, each from
            // the nearest seed of its own kind; ragged shores have both within a few
            // cells, and the stronger western term won beside every east coast, so the
            // eastern boundary flowed poleward like the western one.)
            const cDist = r_coastDist[r];
            if (cDist >= 0 && cDist < coastThreshold) {
                const t = 1 - cDist / coastThreshold;
                const landEast = r_landEast[r];               // +1 land due east … −1 land due west
                const westFrac = smoothstep(0.15, 0.6, -landEast);   // western boundary of a basin
                const eastFrac = smoothstep(0.15, 0.6, landEast);    // eastern boundary
                currentN[r] += hemisphereSign * gyreSense(bandLatDeg) * t * t * (2.0 * westFrac - 0.8 * eastFrac);
                currentE[r] *= 1 - t * t * (0.7 * westFrac + 0.5 * eastFrac);
            }

            // Circumpolar override (55–75° with open channel)
            const isCircumpolar = (lat > 0 && circumpolarNH) || (lat < 0 && circumpolarSH);
            if (isCircumpolar && absLatDeg >= 55 && absLatDeg <= 75) {
                const cStrength = 1 - Math.abs(absLatDeg - 65) / 10;
                currentE[r] = currentE[r] * (1 - cStrength) + 1.5 * cStrength;
                currentN[r] *= (1 - cStrength * 0.8);
            }
        }
        timing.push({ stage: `Ocean: wind bands + vectors (${name})`, ms: performance.now() - t0 });

        // Step 5: Smooth ~125 km (scale-invariant)
        t0 = performance.now();
        const oceanSmoothPasses = Math.max(2, Math.round(125 / avgEdgeKm));
        smoothOcean(mesh, currentE, r_isOcean, oceanSmoothPasses);
        smoothOcean(mesh, currentN, r_isOcean, oceanSmoothPasses);

        // Zero out land
        for (let r = 0; r < numRegions; r++) {
            if (!r_isOcean[r]) { currentE[r] = 0; currentN[r] = 0; }
        }
        timing.push({ stage: `Ocean: smoothing (${name})`, ms: performance.now() - t0 });

        // Step 6: Geographic warmth classification (coast type, not flow direction)
        // Smoothed heavily to blend out jagged coastline noise and dilute
        // small island contributions (few coast cells → weak signal after smoothing).
        t0 = performance.now();
        const r_warmth = classifyWarmth(r_isOcean, r_lat, numRegions,
            r_westCoastDist, r_eastCoastDist, warmthRange, seasonalShiftDeg);
        const warmthSmoothPasses = Math.max(3, Math.round(900 / avgEdgeKm));
        smoothOcean(mesh, r_warmth, r_isOcean, warmthSmoothPasses);

        // Step 7: Normalize speed (95th percentile)
        // Use speed-squared to avoid sqrt in the hot loop; sqrt is monotonic
        // so percentile on squared values gives the same ranking.
        const r_speed = new Float32Array(numRegions);
        const oceanSpeedsSq = new Float32Array(numRegions);
        let oceanCount = 0;
        for (let r = 0; r < numRegions; r++) {
            const spdSq = currentE[r] * currentE[r] + currentN[r] * currentN[r];
            r_speed[r] = spdSq;
            if (r_isOcean[r] && spdSq > 0) oceanSpeedsSq[oceanCount++] = spdSq;
        }
        const p95Sq = percentile(oceanSpeedsSq.subarray(0, oceanCount), 0.95);
        // Now convert to linear 0-1: speed/p95 = sqrt(spdSq)/sqrt(p95Sq) = sqrt(spdSq/p95Sq)
        const invP95Sq = 1 / p95Sq;
        for (let r = 0; r < numRegions; r++) {
            r_speed[r] = Math.min(1, Math.sqrt(r_speed[r] * invP95Sq));
        }

        console.log(`[Ocean ${name}] coastThreshold=${coastThreshold}, warmthRange=${warmthRange}, p95Sq=${p95Sq.toExponential(3)}, oceanCells=${oceanCount}`);
        timing.push({ stage: `Ocean: warmth + normalize (${name})`, ms: performance.now() - t0 });

        result[`r_ocean_current_east_${name}`] = currentE;
        result[`r_ocean_current_north_${name}`] = currentN;
        result[`r_ocean_speed_${name}`] = r_speed;
        result[`r_ocean_warmth_${name}`] = r_warmth;
    }

    result._oceanTiming = timing;
    return result;
}
