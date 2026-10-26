/**
 * Earth's continents as simple lat/lon rules, for continent-aware scoring (each continent scored on its own and
 * weighted equally, so one large continent cannot dominate and the tuner cannot trade one continent for another).
 * Greenland and Antarctica are reported but not tuned on (ice sheets).
 */

export const CONTINENTS = ['North America', 'South America', 'Europe', 'Africa', 'Asia', 'Australia', 'Greenland', 'Antarctica'];
export const TUNED_CONTINENTS = ['North America', 'South America', 'Europe', 'Africa', 'Asia', 'Australia'];

/** Continent of a land point (degrees). */
export function continentOf(lat, lon) {
    if (lat < -60) return 'Antarctica';
    if (lat >= 59 && lon >= -75 && lon <= -10) return 'Greenland';
    if (lon < -168 && lat > 55) return 'Asia';                                   // Chukotka across the date line
    if (lon < -25) return lat > 12 || (lat > 7 && lon < -77) ? 'North America' : 'South America';
    if (lon >= 110 && lat < -10) return 'Australia';                             // incl. New Zealand
    if (lon >= -25 && lon <= 52 && lat < 37.5 && !(lon > 34 && lat > 12)) return 'Africa';   // Arabia → Asia
    if (lon >= -25 && lon <= 60 && lat >= 36 && !(lon > 26 && lat < 42)) return 'Europe';     // Anatolia → Asia
    return 'Asia';
}
