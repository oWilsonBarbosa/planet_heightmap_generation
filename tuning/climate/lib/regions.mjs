/**
 * Earth's regions for region-aware scoring of fields that cover land and sea (pressure, wind): the continents on
 * land (continents.mjs) and the ocean basins at sea, as simple lat/lon rules. Each region is scored on its own and
 * weighted equally.
 */

import { continentOf, TUNED_CONTINENTS } from './continents.mjs';

export const BASINS = ['North Atlantic', 'South Atlantic', 'Indian Ocean', 'North Pacific', 'South Pacific', 'Southern Ocean', 'Arctic Ocean'];
export const TUNED_BASINS = ['North Atlantic', 'South Atlantic', 'Indian Ocean', 'North Pacific', 'South Pacific', 'Southern Ocean'];
export const TUNED_REGIONS = [...TUNED_CONTINENTS, ...TUNED_BASINS];

/** Ocean basin of a sea point (degrees). */
export function basinOf(lat, lon) {
    if (lat > 66) return 'Arctic Ocean';
    if (lat < -40) return 'Southern Ocean';
    if (lat >= 0) {
        if (lon >= -100 && lon <= 25 && !(lon < -77 && lat < 18)) return 'North Atlantic';   // east Pacific off Central America
        if (lon > 25 && lon < 100 && lat < 30) return 'Indian Ocean';
        return 'North Pacific';
    }
    if (lon >= -70 && lon <= 20) return 'South Atlantic';
    if (lon > 20 && lon <= 147) return 'Indian Ocean';
    return 'South Pacific';
}

/** Region of a point: a continent on land, a basin at sea. */
export function regionOf(lat, lon, isLand) {
    return isLand ? continentOf(lat, lon) : basinOf(lat, lon);
}
