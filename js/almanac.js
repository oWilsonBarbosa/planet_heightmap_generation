// Cell Almanac — unrolls a single cell's climate along a time axis.
//
// The generator stores only two seasonal samples per cell (NH summer / NH
// winter).  This module turns that pair into a continuous year, a diurnal
// cycle, and a day-by-day weather sequence for ONE cell at a time.
//
// Three timescales, three different techniques:
//
//   Month — deterministic harmonic fit through the two seasonal samples.
//           No randomness.  Produces the 12 monthly means behind a climograph.
//   Day   — exact solar geometry (declination, hour angle) plus a diurnal
//           temperature range derived from continentality, aridity and altitude.
//   Week  — a Richardson-type stochastic weather generator: Markov wet/dry
//           chain, exponential rain depths, AR(1) temperature anomalies.
//
// Everything here is O(1) per cell and runs on demand, so it adds nothing to
// generation time.  All inputs are in physical units (°C, mm, m/s, degrees of
// latitude), which makes the whole module inherently scale-invariant — no cell
// hop counts or neighbour displacements appear anywhere.
//
// Determinism matters more than it might seem: the weather RNG is keyed on
// (planet seed, region index, day of year), so the same cell on the same date
// yields the same weather forever, across reloads and across users sharing a
// planet code.  A scene written for day 214 in a particular valley stays true.

import { state } from './state.js';
import { KOPPEN_CLASSES } from './koppen.js';
import { elevToHeightKm } from './color-map.js';
import { makeItczLookup } from './climate-util.js';

const PI = Math.PI;
const DEG = PI / 180;
const RAD = 180 / PI;

export const YEAR_DAYS = 365;
export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Axial tilt — must match the value wind.js uses to place the ITCZ.
const TILT_RAD = 23.5 * DEG;

// Day of the northern solstice (peak insolation).
const SOLSTICE_DAY = 172;
// Peak surface temperature lags peak insolation by ~30 days (thermal inertia).
const SUMMER_PEAK_DAY = 202;

// Wind speed and ocean current speed are stored 0-1 (95th-percentile
// normalised).  These scale them back to something readable.  Because the
// normalisation is against the 95th percentile, a lot of cells sit in the
// 0.5-0.9 band, so the ceiling has to represent a *breezy* day rather than a
// storm — otherwise every cell reads as permanently gale-swept.
const WIND_MAX_MS = 11;
const CURRENT_MAX_MS = 1.4;

// Mean depth of a single rain event, in mm.  Sets how many wet days a given
// monthly total is spread across.
const EVENT_DEPTH_MM = 9;

// ── Small deterministic RNG ──────────────────────────────────────────────────

/** FNV-1a over a string → uint32. */
function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

/** Mix three integers into a single uint32 seed. */
function mixSeed(a, b, c) {
    let h = (a ^ Math.imul(b ^ 0x9e3779b9, 0x85ebca6b)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    h = (h ^ Math.imul(c + 0x165667b1, 0x27d4eb2f)) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32 — small, fast, well-distributed. */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Box-Muller normal deviate from a uniform generator. */
function normal(rand) {
    const u = Math.max(1e-9, rand());
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * PI * v);
}

// ── Solar geometry ───────────────────────────────────────────────────────────

/** Solar declination (radians) on a given day of year. */
export function solarDeclination(day) {
    return TILT_RAD * Math.cos(2 * PI * (day - SOLSTICE_DAY) / YEAR_DAYS);
}

/**
 * Daylight length in hours from latitude and declination.
 * Returns 24 during polar day and 0 during polar night.
 */
export function daylightHours(latRad, declRad) {
    const cosH = -Math.tan(latRad) * Math.tan(declRad);
    if (cosH <= -1) return 24;
    if (cosH >= 1) return 0;
    return 24 * Math.acos(cosH) / PI;
}

/** Sunrise / sunset as decimal hours (local solar time), or null if polar. */
export function sunTimes(latRad, declRad) {
    const hours = daylightHours(latRad, declRad);
    if (hours <= 0 || hours >= 24) return null;
    return { rise: 12 - hours / 2, set: 12 + hours / 2, hours };
}

/** Format decimal hours as HH:MM. */
export function formatHour(h) {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    const carry = mm === 60 ? 1 : 0;
    return String((hh + carry) % 24).padStart(2, '0') + ':' +
           String(carry ? 0 : mm).padStart(2, '0');
}

// ── Seasonal phase ───────────────────────────────────────────────────────────

/** +1 at peak northern summer, -1 at peak northern winter. */
function seasonalPhase(day) {
    return Math.cos(2 * PI * (day - SUMMER_PEAK_DAY) / YEAR_DAYS);
}

/** Interpolate a NH-summer / NH-winter pair to a given day. */
function seasonalLerp(summerVal, winterVal, day) {
    const mid = (summerVal + winterVal) / 2;
    const half = (summerVal - winterVal) / 2;
    return mid + half * seasonalPhase(day);
}

/** Day of year → month index and day-of-month. */
export function dayToDate(day) {
    let d = ((day % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS;
    for (let m = 0; m < 12; m++) {
        if (d < MONTH_DAYS[m]) return { month: m, dayOfMonth: d + 1 };
        d -= MONTH_DAYS[m];
    }
    return { month: 11, dayOfMonth: 31 };
}

/** Month index → first day of year for that month. */
export function monthStartDay(month) {
    let d = 0;
    for (let m = 0; m < month; m++) d += MONTH_DAYS[m];
    return d;
}

/** Short label like "14 Jun". */
export function formatDay(day) {
    const { month, dayOfMonth } = dayToDate(day);
    return `${dayOfMonth} ${MONTH_NAMES[month]}`;
}

// ── Site profile ─────────────────────────────────────────────────────────────

/**
 * Gather every per-cell field the almanac needs into one plain object.
 * Returns null when climate has not been computed yet.
 *
 * @param {number} region - region index
 * @returns {object|null} site profile
 */
export function siteProfile(region) {
    const d = state.curData;
    if (!d || region < 0 || region >= d.mesh.numRegions) return null;
    if (!state.climateComputed || !d.r_temperature_summer) return null;

    const x = d.r_xyz[3 * region];
    const y = d.r_xyz[3 * region + 1];
    const z = d.r_xyz[3 * region + 2];
    const latRad = Math.asin(Math.max(-1, Math.min(1, y)));
    const lonRad = Math.atan2(x, z);

    const elev = d.r_elevation[region];
    const isOcean = elev <= 0;
    const elevKm = elevToHeightKm(elev);

    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const toCelsius = (v) => -45 + clamp01(v) * 90;

    // Precipitation: each seasonal value ∈ [0,1] stands for a half-year total.
    // ×1000 matches the mm conversion koppen.js uses.
    const precipSummer = Math.max(0, d.r_precip_summer ? d.r_precip_summer[region] : 0) * 1000;
    const precipWinter = Math.max(0, d.r_precip_winter ? d.r_precip_winter[region] : 0) * 1000;

    const dl = d.debugLayers || {};
    const layerAt = (arr, fallback) => (arr ? arr[region] : fallback);

    // Continentality is 0 (hyperoceanic) → 1 (hypercontinental) on land,
    // and -1 over ocean.  Treat ocean as fully maritime.
    let continentality = layerAt(dl.tempContinentality, 0.5);
    if (continentality < 0) continentality = 0;

    const koppenId = dl.koppen ? dl.koppen[region] : 0;

    // ITCZ latitude at this cell's longitude, per season (radians).
    let itczSummerLat = null, itczWinterLat = null;
    if (d.itczLons && d.itczLatsSummer && d.itczLatsWinter) {
        itczSummerLat = makeItczLookup(d.itczLons, d.itczLatsSummer)(lonRad);
        itczWinterLat = makeItczLookup(d.itczLons, d.itczLatsWinter)(lonRad);
    }

    return {
        region,
        latRad, lonRad,
        latDeg: latRad * RAD,
        lonDeg: lonRad * RAD,
        isOcean,
        elevKm,
        tempSummer: toCelsius(d.r_temperature_summer[region]),
        tempWinter: toCelsius(d.r_temperature_winter[region]),
        precipSummer,
        precipWinter,
        precipAnnual: precipSummer + precipWinter,
        windEastSummer: layerAt(d.r_wind_east_summer, 0),
        windNorthSummer: layerAt(d.r_wind_north_summer, 0),
        windEastWinter: layerAt(d.r_wind_east_winter, 0),
        windNorthWinter: layerAt(d.r_wind_north_winter, 0),
        windSpeedSummer: clamp01(layerAt(dl.windSpeedSummer, 0.3)) * WIND_MAX_MS,
        windSpeedWinter: clamp01(layerAt(dl.windSpeedWinter, 0.3)) * WIND_MAX_MS,
        rainShadowSummer: layerAt(dl.rainShadowSummer, 0),
        rainShadowWinter: layerAt(dl.rainShadowWinter, 0),
        continentality,
        oceanWarmthSummer: layerAt(d.r_ocean_warmth_summer, 0),
        oceanWarmthWinter: layerAt(d.r_ocean_warmth_winter, 0),
        oceanSpeedSummer: clamp01(layerAt(d.r_ocean_speed_summer, 0)) * CURRENT_MAX_MS,
        oceanSpeedWinter: clamp01(layerAt(d.r_ocean_speed_winter, 0)) * CURRENT_MAX_MS,
        oceanCurrentEastSummer: layerAt(d.r_ocean_current_east_summer, 0),
        oceanCurrentNorthSummer: layerAt(d.r_ocean_current_north_summer, 0),
        oceanCurrentEastWinter: layerAt(d.r_ocean_current_east_winter, 0),
        oceanCurrentNorthWinter: layerAt(d.r_ocean_current_north_winter, 0),
        koppenId,
        koppen: KOPPEN_CLASSES[koppenId] || KOPPEN_CLASSES[0],
        itczSummerLat,
        itczWinterLat,
        seedHash: hashString(String(d.seed ?? '')),
    };
}

// ── Annual profiles ──────────────────────────────────────────────────────────

/**
 * Daily temperature means across the year.
 *
 * The summer/winter samples stand for warmest/coldest month, so the harmonic
 * amplitude is used directly.  Southern-hemisphere cells need no special case:
 * their summer sample is already the colder one, so the harmonic flips sign and
 * peaks in December on its own.
 */
function temperatureYear(site) {
    const out = new Float32Array(YEAR_DAYS);
    for (let d = 0; d < YEAR_DAYS; d++) {
        out[d] = seasonalLerp(site.tempSummer, site.tempWinter, d);
    }
    return out;
}

/**
 * Daily precipitation rates (mm/day) across the year, summing to the annual
 * total.
 *
 * A plain cosine through two half-year totals would understate the seasonal
 * contrast, because a cosine integrated over a half year averages 2/π of its
 * amplitude.  Scaling the amplitude by π/2 makes each half-year integral come
 * out exactly equal to its seasonal sample.
 *
 * Tropical cells get a second harmonic: where the ITCZ sweeps past a latitude
 * twice a year, that latitude sees two rainy seasons, which a single cosine
 * cannot represent.  The bimodal profile is renormalised so the annual total is
 * unchanged — only its distribution through the year shifts.
 */
function precipitationYear(site) {
    const rateSummer = site.precipSummer / (YEAR_DAYS / 2);
    const rateWinter = site.precipWinter / (YEAR_DAYS / 2);
    const mid = (rateSummer + rateWinter) / 2;
    const half = ((rateSummer - rateWinter) / 2) * (PI / 2);

    const out = new Float32Array(YEAR_DAYS);
    for (let d = 0; d < YEAR_DAYS; d++) {
        out[d] = Math.max(0, mid + half * seasonalPhase(d));
    }

    const crossings = itczCrossings(site);
    if (crossings) {
        // Blend strength falls off as the two peaks converge; when they are less
        // than ~50 days apart the cell effectively has one rainy season anyway.
        let gap = Math.abs(crossings[1] - crossings[0]);
        gap = Math.min(gap, YEAR_DAYS - gap);
        const blend = Math.max(0, Math.min(1, (gap - 50) / 60)) * 0.5;
        if (blend > 0.01) {
            const bump = new Float32Array(YEAR_DAYS);
            const width = 30;
            for (let d = 0; d < YEAR_DAYS; d++) {
                let v = 0;
                for (const c of crossings) {
                    let delta = Math.abs(d - c);
                    delta = Math.min(delta, YEAR_DAYS - delta);
                    v += Math.exp(-(delta * delta) / (2 * width * width));
                }
                bump[d] = v;
            }
            mixPreservingTotal(out, bump, blend);
        }
    }

    normaliseTotal(out, site.precipAnnual);
    return out;
}

/** Rescale `arr` so it sums to `target` (no-op if the array is all zeros). */
function normaliseTotal(arr, target) {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += arr[i];
    if (sum <= 1e-6) return;
    const k = target / sum;
    for (let i = 0; i < arr.length; i++) arr[i] *= k;
}

/** Blend `extra` into `base` by `weight`, keeping base's original total. */
function mixPreservingTotal(base, extra, weight) {
    let baseSum = 0;
    for (let i = 0; i < base.length; i++) baseSum += base[i];
    if (baseSum <= 1e-6) return;
    normaliseTotal(extra, baseSum);
    for (let i = 0; i < base.length; i++) {
        base[i] = base[i] * (1 - weight) + extra[i] * weight;
    }
}

/**
 * Days of year when the ITCZ passes over this cell's latitude, or null when it
 * never reaches the cell.  Returns two days (the belt sweeps north, then back).
 */
function itczCrossings(site) {
    if (site.itczSummerLat === null || site.itczWinterLat === null) return null;
    const midI = (site.itczSummerLat + site.itczWinterLat) / 2;
    const halfI = (site.itczSummerLat - site.itczWinterLat) / 2;
    if (Math.abs(halfI) < 1e-4) return null;

    const phase = (site.latRad - midI) / halfI;
    // |phase| ≥ 1 means the belt never reaches (or only grazes) this latitude.
    if (phase <= -0.98 || phase >= 0.98) return null;

    const offset = (YEAR_DAYS / (2 * PI)) * Math.acos(phase);
    const a = (SUMMER_PEAK_DAY - offset + YEAR_DAYS) % YEAR_DAYS;
    const b = (SUMMER_PEAK_DAY + offset) % YEAR_DAYS;
    return [a, b];
}

/**
 * Diurnal temperature range in °C.
 *
 * Wide over dry continental interiors and high ground where thin, dry air
 * radiates heat away after dark; narrow over oceans and in humid tropics where
 * water vapour and cloud hold it in.
 */
function diurnalRange(site, monthPrecipMm) {
    if (site.isOcean) return 1.5;

    // Monthly dryness alone would give a rainforest's driest month a desert's
    // day/night swing.  What actually keeps nights warm is standing humidity,
    // which tracks the annual total far more than any single month, so weight
    // the annual figure the more heavily of the two.
    const monthDry = Math.max(0, Math.min(1, 1 - monthPrecipMm / 90));
    const annualDry = Math.max(0, Math.min(1, 1 - site.precipAnnual / 900));
    const dryness = monthDry * 0.35 + annualDry * 0.65;

    const dtr = 6
        + site.continentality * 6
        + dryness * 11
        + Math.max(0, site.elevKm) * 1.6;
    return Math.max(2, Math.min(26, dtr));
}

// ── Monthly summary ──────────────────────────────────────────────────────────

/**
 * Twelve monthly means: temperature, precipitation total, daylight, wind.
 * Fully deterministic — this is the climograph behind the Köppen label.
 */
export function monthlyClimate(site) {
    const temps = temperatureYear(site);
    const precip = precipitationYear(site);
    const months = [];

    let day = 0;
    for (let m = 0; m < 12; m++) {
        const len = MONTH_DAYS[m];
        let tSum = 0, pSum = 0, dlSum = 0, wSum = 0;
        let tMax = -Infinity, tMin = Infinity;

        for (let i = 0; i < len; i++) {
            const d = day + i;
            tSum += temps[d];
            pSum += precip[d];
            dlSum += daylightHours(site.latRad, solarDeclination(d));
            wSum += seasonalLerp(site.windSpeedSummer, site.windSpeedWinter, d);
            if (temps[d] > tMax) tMax = temps[d];
            if (temps[d] < tMin) tMin = temps[d];
        }

        const meanTemp = tSum / len;
        const dtr = diurnalRange(site, pSum);
        months.push({
            index: m,
            name: MONTH_NAMES[m],
            days: len,
            temp: meanTemp,
            tempHigh: meanTemp + dtr / 2,
            tempLow: meanTemp - dtr / 2,
            tempPeak: tMax,
            tempTrough: tMin,
            precip: pSum,
            daylight: dlSum / len,
            wind: wSum / len,
            diurnalRange: dtr,
        });
        day += len;
    }
    return months;
}

// ── Diurnal cycle ────────────────────────────────────────────────────────────

/**
 * Hour-by-hour temperature for one day.
 *
 * Minimum sits just before sunrise, maximum a couple of hours after solar noon.
 * Modelled as a cosine warming ramp through the day and an exponential decay
 * overnight — cheap, and it gives the right asymmetric shape (fast morning
 * rise, slow evening fall).
 */
export function diurnalCurve(dayMean, dtr, sun) {
    const out = new Array(24);
    const rise = sun ? sun.rise : 6;
    const peakHour = Math.min(23, (sun ? sun.set : 18) - 2.5);
    const tMin = dayMean - dtr / 2;
    const tMax = dayMean + dtr / 2;

    for (let h = 0; h < 24; h++) {
        let t;
        if (h >= rise && h <= peakHour) {
            // Morning through afternoon: cosine ramp from min to max.
            const f = (h - rise) / Math.max(0.5, peakHour - rise);
            t = tMin + (tMax - tMin) * (0.5 - 0.5 * Math.cos(PI * f));
        } else {
            // Overnight: exponential decay toward the pre-dawn minimum.
            let since = h - peakHour;
            if (since < 0) since += 24;
            const nightLength = Math.max(1, 24 - (peakHour - rise));
            t = tMin + (tMax - tMin) * Math.exp(-2.2 * since / nightLength);
        }
        out[h] = t;
    }
    return out;
}

// ── Stochastic weather ───────────────────────────────────────────────────────

/**
 * Simulate a run of days for one cell.
 *
 * Wet/dry days follow a two-state Markov chain whose transition probabilities
 * are built so the chain's stationary wet fraction is exactly the fraction
 * implied by that month's rainfall.  Rain depths are exponential (heavy-tailed
 * enough to throw the occasional deluge).  Temperature is an AR(1) anomaly
 * around the daily climatology, cooled on wet days by cloud and evaporation,
 * with overnight lows lifted for the same reason.
 *
 * The chain is always run from day 0 of the year so any window is reproducible
 * regardless of where the caller starts — 365 cheap iterations at most.
 *
 * @param {object} site     - from siteProfile()
 * @param {number} startDay - first day of year to report
 * @param {number} count    - how many days to report
 * @returns {object[]} day records
 */
export function simulateWeather(site, startDay, count) {
    const temps = temperatureYear(site);
    const precip = precipitationYear(site);
    const months = monthlyClimate(site);

    // Persistent regimes: maritime and monsoon climates hold their weather for
    // days at a time, continental interiors flip faster.
    const persistence = 0.25 + (1 - site.continentality) * 0.25;

    // Day-to-day swings are far larger in the cold season than the warm one —
    // the temperature gradient that drives passing systems is strongest in
    // winter.  Without this, summer months throw improbable hard freezes.
    let warmest = -Infinity, coldest = Infinity;
    for (const m of months) {
        if (m.temp > warmest) warmest = m.temp;
        if (m.temp < coldest) coldest = m.temp;
    }
    const tempSpan = Math.max(1e-3, warmest - coldest);

    const end = ((startDay % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS + count;
    const results = [];
    let wet = false;
    let anomaly = 0;

    for (let d = 0; d < end; d++) {
        const doy = d % YEAR_DAYS;
        const { month } = dayToDate(doy);
        const mon = months[month];
        const rand = mulberry32(mixSeed(site.seedHash, site.region, d));

        // Expected wet days this month → stationary wet probability.
        const expectedWet = Math.min(mon.days * 0.9, mon.precip / EVENT_DEPTH_MM);
        const f = Math.max(0.01, Math.min(0.9, expectedWet / mon.days));
        // These two keep the chain's stationary distribution exactly f.
        const pWetGivenWet = f + persistence * (1 - f);
        const pWetGivenDry = f * (1 - persistence);
        wet = rand() < (wet ? pWetGivenWet : pWetGivenDry);

        // Rain depth: exponential about the mean event size for this month.
        let rain = 0;
        if (wet) {
            const meanDepth = expectedWet > 0.05 ? mon.precip / expectedWet : EVENT_DEPTH_MM;
            rain = -meanDepth * Math.log(Math.max(1e-6, rand()));
            // Bias toward the day's own climatological rate so the wet season
            // still reads as the wet season within a month.
            const dayRate = precip[doy];
            const monthRate = mon.precip / mon.days;
            if (monthRate > 1e-6) rain *= 0.5 + 0.5 * (dayRate / monthRate);
        }

        // AR(1) synoptic temperature anomaly, damped in the warm season.
        const dtr = diurnalRange(site, mon.precip);
        const warmth = (mon.temp - coldest) / tempSpan;   // 0 = coldest month, 1 = warmest
        const seasonScale = 1 - 0.45 * warmth;
        const sigma = (1.5 + site.continentality * 4.5) * seasonScale;
        const rho = 0.68;
        anomaly = rho * anomaly + Math.sqrt(1 - rho * rho) * sigma * normal(rand);

        if (d < startDay) continue;

        const dayMean = temps[doy] + anomaly;
        const decl = solarDeclination(doy);
        const sun = sunTimes(site.latRad, decl);
        const daylight = daylightHours(site.latRad, decl);

        // Cloud cover flattens the diurnal cycle from both ends.  The wet-day
        // trim has to scale with the range itself: a fixed °C offset would
        // invert high and low over the ocean, where the range is under 2°C.
        const cloudDamp = wet ? 0.45 : 0;
        const effDtr = dtr * (1 - cloudDamp);
        const high = dayMean + effDtr / 2 - (wet ? Math.min(1.5, effDtr * 0.25) : 0);
        const low = dayMean - effDtr / 2 + (wet ? Math.min(1.0, effDtr * 0.18) : 0);

        // Wind: seasonal mean vector, gusted, veering on frontal passage.
        const baseWind = seasonalLerp(site.windSpeedSummer, site.windSpeedWinter, doy);
        const gust = baseWind * (0.6 + rand() * 0.9) * (wet ? 1.35 : 1);
        const we = seasonalLerp(site.windEastSummer, site.windEastWinter, doy);
        const wn = seasonalLerp(site.windNorthSummer, site.windNorthWinter, doy);
        let bearing = (Math.atan2(we, wn) * RAD + 360) % 360;
        if (wet) bearing = (bearing + (rand() - 0.5) * 70 + 360) % 360;

        results.push({
            day: doy,
            label: formatDay(doy),
            wet,
            precip: rain,
            temp: dayMean,
            high,
            low,
            diurnal: diurnalCurve(dayMean, effDtr, sun),
            daylight,
            sun,
            wind: gust,
            bearing,
            anomaly,
            climatologyTemp: temps[doy],
            month,
        });
    }
    return results;
}

// ── Dramatization ────────────────────────────────────────────────────────────

/** Compass point from a bearing the wind is blowing *from*. */
export function compassPoint(bearing) {
    const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return points[Math.round(((bearing + 180) % 360) / 22.5) % 16];
}

/**
 * Turn a simulated day into named phenomena plus one line of prose.
 *
 * Everything here reads off numbers the simulation already produced — this is
 * presentation, not extra physics.
 */
export function describeDay(site, rec, months) {
    const mon = months[rec.month];
    const tags = [];
    const arid = mon.precip < 25;
    const from = compassPoint(rec.bearing);

    // Precipitation phase and intensity.
    // "Humid" only reads as humid when it's warm enough to feel that way —
    // a wet month below freezing is just overcast.
    const humid = mon.precip > 60 && rec.temp > 5;
    if (rec.wet && rec.precip > 0.5) {
        if (rec.high < 1.0) tags.push(rec.precip > 15 ? 'heavy snow' : 'snow');
        else if (rec.high < 3.5) tags.push('sleet');
        else if (rec.precip > 45) tags.push('torrential rain');
        else if (rec.precip > 18) tags.push('heavy rain');
        else if (rec.precip > 4) tags.push('rain');
        else tags.push('drizzle');

        if (rec.high > 24 && rec.precip > 12) tags.push('thunderstorms');
    } else if (!rec.wet) {
        tags.push(arid ? 'clear' : humid ? 'humid' : 'dry');
    }

    // Temperature extremes, judged against this month's own normals.
    if (rec.low < -25) tags.push('extreme cold');
    else if (rec.low < -10) tags.push('hard freeze');
    else if (rec.low < 0) tags.push('frost');
    if (rec.temp > mon.temp + 8) tags.push('heat wave');
    else if (rec.temp < mon.temp - 8) tags.push('cold snap');

    // Wind.
    if (rec.wind > 20) tags.push('gale');
    else if (rec.wind > 14) tags.push('strong winds');
    if (arid && !rec.wet && rec.wind > 12) tags.push('dust storm');

    // Föhn: dry, warm downslope flow in the lee of high ground.
    const rainShadow = seasonalLerp(site.rainShadowSummer, site.rainShadowWinter, rec.day);
    if (!rec.wet && rainShadow > 0.5 && site.elevKm > 0.3 && rec.temp > mon.temp + 4) {
        tags.push('föhn wind');
    }

    // Sea fog: mild air drifting over a cold current, with little wind to stir it.
    const warmth = seasonalLerp(site.oceanWarmthSummer, site.oceanWarmthWinter, rec.day);
    if (warmth < -0.25 && rec.wind < 5 && rec.temp > 4 && !rec.wet) tags.push('sea fog');

    // Polar extremes.
    if (rec.daylight <= 0.05) tags.push('polar night');
    else if (rec.daylight >= 23.95) tags.push('midnight sun');

    return { tags, text: proseFor(site, rec, mon, tags, from) };
}

/** One line of scene-setting prose for a day. */
function proseFor(site, rec, mon, tags, from) {
    const has = (t) => tags.includes(t);
    const temp = Math.round(rec.temp);
    const wind = Math.round(rec.wind);

    if (has('polar night')) {
        return `No sunrise. ${temp}°C under permanent dusk, ${from} wind at ${wind} m/s.`;
    }
    if (has('midnight sun')) {
        return `The sun never sets. ${temp}°C, light on the horizon all night.`;
    }
    if (has('torrential rain')) {
        return `${Math.round(rec.precip)} mm falls in a day — streams break their banks, tracks turn to mud.`;
    }
    if (has('thunderstorms')) {
        return `Heat builds through the morning until it breaks into thunder; ${Math.round(rec.precip)} mm in a few hours.`;
    }
    if (has('heavy snow')) {
        return `Snow closes in, ${Math.round(rec.precip)} mm water equivalent, ${temp}°C and falling.`;
    }
    if (has('snow')) {
        return `Snow drifts down through still air at ${temp}°C.`;
    }
    if (has('dust storm')) {
        return `A ${from} wind at ${wind} m/s lifts the dry ground into a haze that blots out the horizon.`;
    }
    if (has('gale')) {
        return `A ${from} gale at ${wind} m/s — anything not tied down is gone.`;
    }
    if (has('sea fog')) {
        return `Fog rolls in off the cold water and sits, muffling everything, ${temp}°C.`;
    }
    if (has('föhn wind')) {
        return `Dry air pours down off the heights, ${temp}°C and rising fast — snow shrinks visibly.`;
    }
    if (has('heat wave')) {
        return `${temp}°C, well above the ${Math.round(mon.temp)}°C usual for ${mon.name}. Shade and water only.`;
    }
    if (has('cold snap')) {
        return `${temp}°C — a sharp drop below the ${Math.round(mon.temp)}°C ${mon.name} norm.`;
    }
    if (has('heavy rain')) {
        return `Steady rain all day, ${Math.round(rec.precip)} mm, ${from} wind driving it sideways.`;
    }
    if (has('rain')) {
        return `Rain on and off, ${Math.round(rec.precip)} mm, ${temp}°C.`;
    }
    if (has('drizzle')) {
        return `Thin drizzle and low cloud, ${temp}°C.`;
    }
    if (has('extreme cold') || has('hard freeze')) {
        return `Clear and brutally cold — ${Math.round(rec.low)}°C before dawn, ${temp}°C at best.`;
    }
    if (has('frost')) {
        return `Frost overnight, clearing to ${temp}°C by afternoon.`;
    }
    // Ordinary days are the common case, so vary the wording — deterministically,
    // keyed on the date, so a given day always reads the same.
    const pick = (opts) => opts[rec.day % opts.length];

    if (has('humid')) {
        return pick([
            `Heavy, humid air and broken cloud, ${temp}°C. Rain never quite arrives.`,
            `Close and still at ${temp}°C — the ${from} breeze barely moves at ${wind} m/s.`,
            `Grey and muggy, ${temp}°C, everything damp without a drop falling.`,
        ]);
    }
    if (has('clear')) {
        return pick([
            `Cloudless and dry, ${temp}°C, ${from} wind at ${wind} m/s.`,
            `Hard sunlight, not a cloud, ${temp}°C. Shadows sharp as cut paper.`,
            `Dry and bright at ${temp}°C, ${from} wind combing the ground at ${wind} m/s.`,
        ]);
    }
    return pick([
        `Overcast but dry, ${temp}°C, ${from} wind at ${wind} m/s.`,
        `Flat grey sky, ${temp}°C, nothing falling. ${from} wind at ${wind} m/s.`,
        `Cloud thickening through the day, ${temp}°C, still dry by dusk.`,
    ]);
}

// ── Marine variant ───────────────────────────────────────────────────────────

/**
 * Ocean cells have no meaningful land weather, so report sea state instead:
 * sea-surface temperature, current, and wave conditions driven by wind.
 */
export function marineConditions(site, day) {
    const sst = seasonalLerp(site.tempSummer, site.tempWinter, day);
    const speed = seasonalLerp(site.oceanSpeedSummer, site.oceanSpeedWinter, day);
    const ce = seasonalLerp(site.oceanCurrentEastSummer, site.oceanCurrentEastWinter, day);
    const cn = seasonalLerp(site.oceanCurrentNorthSummer, site.oceanCurrentNorthWinter, day);
    const wind = seasonalLerp(site.windSpeedSummer, site.windSpeedWinter, day);
    const warmth = seasonalLerp(site.oceanWarmthSummer, site.oceanWarmthWinter, day);

    // Beaufort-ish sea state from wind speed.
    let sea = 'calm', waveM = 0.1;
    if (wind > 16) { sea = 'very rough'; waveM = 6; }
    else if (wind > 12) { sea = 'rough'; waveM = 3.5; }
    else if (wind > 8) { sea = 'moderate'; waveM = 1.8; }
    else if (wind > 4) { sea = 'slight'; waveM = 0.7; }

    return {
        sst,
        currentSpeed: speed,
        // Bearing the current flows toward.
        currentBearing: (Math.atan2(ce, cn) * RAD + 360) % 360,
        wind,
        warmth,
        sea,
        waveM,
        ice: sst < -1.8,
    };
}

// ── Top-level entry point ────────────────────────────────────────────────────

/**
 * Everything the UI needs for one cell: the profile, the twelve months, a
 * chosen day, and the week that follows it.
 *
 * @param {number} region   - region index
 * @param {number} startDay - day of year to focus on
 * @returns {object|null}
 */
export function buildAlmanac(region, startDay = 0) {
    const site = siteProfile(region);
    if (!site) return null;

    const months = monthlyClimate(site);
    const days = simulateWeather(site, startDay, 7);
    const narrated = days.map((rec) => ({ ...rec, ...describeDay(site, rec, months) }));

    return {
        site,
        months,
        days: narrated,
        today: narrated[0] || null,
        marine: site.isOcean ? marineConditions(site, startDay) : null,
        annualPrecip: months.reduce((s, m) => s + m.precip, 0),
        meanTemp: months.reduce((s, m) => s + m.temp * m.days, 0) / YEAR_DAYS,
        warmestMonth: months.reduce((a, b) => (b.temp > a.temp ? b : a)),
        coldestMonth: months.reduce((a, b) => (b.temp < a.temp ? b : a)),
        wettestMonth: months.reduce((a, b) => (b.precip > a.precip ? b : a)),
        driestMonth: months.reduce((a, b) => (b.precip < a.precip ? b : a)),
    };
}
