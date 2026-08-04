// Cell Almanac panel — renders the time simulation for a single cell.
//
// Three views over the same cell: the year (climograph), one day (diurnal
// curve and sun times), and the week that follows (stochastic weather).
// All drawing is inline SVG built from strings — no chart library, no build
// step, consistent with the rest of the project.

import { state } from './state.js';
import {
    buildAlmanac, YEAR_DAYS, MONTH_NAMES, formatDay, formatHour,
    compassPoint, dayToDate, monthStartDay,
} from './almanac.js';

let overlay = null;
let currentRegion = -1;
let currentDay = 195;   // mid-July: something is usually happening somewhere
let currentView = 'year';

/** Escape text destined for innerHTML. */
function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** Köppen class colour as a hex string. */
function koppenHex(kc) {
    return '#' + kc.color.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

function fmtTemp(t) {
    return `${t >= 0 ? '' : ''}${Math.round(t)}°C`;
}

// ── Climograph ───────────────────────────────────────────────────────────────

/**
 * Walter-Lieth style climograph: precipitation bars against monthly mean
 * temperature. The classic 2:1 mm-to-°C scaling makes the dry season visible
 * as the point where the temperature line rises above the precipitation bars.
 */
function renderClimograph(alm) {
    const W = 480, H = 200;
    const padL = 34, padR = 38, padT = 14, padB = 26;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const months = alm.months;
    const maxPrecip = Math.max(20, ...months.map((m) => m.precip));
    // Round the precipitation axis up to a readable step.
    const pStep = maxPrecip > 400 ? 200 : maxPrecip > 200 ? 100 : maxPrecip > 80 ? 50 : 20;
    const pTop = Math.ceil(maxPrecip / pStep) * pStep;

    const tVals = months.flatMap((m) => [m.tempHigh, m.tempLow]);
    let tMin = Math.min(...tVals), tMax = Math.max(...tVals);
    tMin = Math.floor((tMin - 3) / 10) * 10;
    tMax = Math.ceil((tMax + 3) / 10) * 10;
    if (tMax - tMin < 20) tMax = tMin + 20;

    const xOf = (i) => padL + (i + 0.5) * (plotW / 12);
    const yPrecip = (p) => padT + plotH - (p / pTop) * plotH;
    const yTemp = (t) => padT + plotH - ((t - tMin) / (tMax - tMin)) * plotH;

    const parts = [];
    parts.push(`<svg viewBox="0 0 ${W} ${H}" class="alm-chart" role="img" aria-label="Monthly climate">`);

    // Horizontal gridlines on the temperature axis.
    for (let t = tMin; t <= tMax; t += 10) {
        const y = yTemp(t);
        parts.push(`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" class="alm-grid"/>`);
        parts.push(`<text x="${padL - 6}" y="${(y + 3.5).toFixed(1)}" class="alm-axis alm-axis-t">${t}</text>`);
    }

    // Freezing line, if it falls inside the plot.
    if (tMin < 0 && tMax > 0) {
        const y = yTemp(0);
        parts.push(`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" class="alm-freeze"/>`);
    }

    // Diurnal range band goes down first so the precipitation bars read clearly
    // on top of it.
    const bandTop = months.map((m, i) => `${xOf(i).toFixed(1)},${yTemp(m.tempHigh).toFixed(1)}`);
    const bandBot = months.map((m, i) => `${xOf(i).toFixed(1)},${yTemp(m.tempLow).toFixed(1)}`).reverse();
    parts.push(`<polygon points="${bandTop.concat(bandBot).join(' ')}" class="alm-band"/>`);

    // Precipitation bars.
    const barW = (plotW / 12) * 0.56;
    months.forEach((m, i) => {
        const y = yPrecip(m.precip);
        const h = padT + plotH - y;
        if (h <= 0.4) return;
        parts.push(`<rect x="${(xOf(i) - barW / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" class="alm-bar"/>`);
    });

    // Precipitation axis labels on the right.
    for (let p = 0; p <= pTop; p += pStep) {
        const y = yPrecip(p);
        parts.push(`<text x="${W - padR + 6}" y="${(y + 3.5).toFixed(1)}" class="alm-axis alm-axis-p">${p}</text>`);
    }

    // Mean-temperature line on top of everything.
    const line = months.map((m, i) => `${xOf(i).toFixed(1)},${yTemp(m.temp).toFixed(1)}`).join(' ');
    parts.push(`<polyline points="${line}" class="alm-line"/>`);
    months.forEach((m, i) => {
        parts.push(`<circle cx="${xOf(i).toFixed(1)}" cy="${yTemp(m.temp).toFixed(1)}" r="2.6" class="alm-dot"><title>${esc(m.name)}: ${fmtTemp(m.temp)}, ${Math.round(m.precip)} mm</title></circle>`);
    });

    // Month labels.
    months.forEach((m, i) => {
        parts.push(`<text x="${xOf(i).toFixed(1)}" y="${H - 8}" class="alm-axis alm-month">${m.name[0]}</text>`);
    });

    parts.push('</svg>');
    return parts.join('');
}

// ── Year view ────────────────────────────────────────────────────────────────

function renderYear(alm) {
    const s = alm.site;
    const rows = [];

    rows.push(`<div class="alm-stats">
        <div><span class="alm-k">Mean</span><span class="alm-v">${fmtTemp(alm.meanTemp)}</span></div>
        <div><span class="alm-k">Range</span><span class="alm-v">${fmtTemp(alm.coldestMonth.temp)} – ${fmtTemp(alm.warmestMonth.temp)}</span></div>
        <div><span class="alm-k">Rain</span><span class="alm-v">${Math.round(alm.annualPrecip)} mm/yr</span></div>
        <div><span class="alm-k">Wettest</span><span class="alm-v">${alm.wettestMonth.name} (${Math.round(alm.wettestMonth.precip)} mm)</span></div>
        <div><span class="alm-k">Driest</span><span class="alm-v">${alm.driestMonth.name} (${Math.round(alm.driestMonth.precip)} mm)</span></div>
        <div><span class="alm-k">Swing</span><span class="alm-v">${Math.round(alm.warmestMonth.temp - alm.coldestMonth.temp)}°C</span></div>
    </div>`);

    rows.push(renderClimograph(alm));
    rows.push(`<div class="alm-legend">
        <span><i class="alm-sw-line"></i>Mean temperature</span>
        <span><i class="alm-sw-band"></i>Day/night range</span>
        <span><i class="alm-sw-bar"></i>Precipitation</span>
    </div>`);

    // A note when the harmonic picked up two rainy seasons.
    const wet = alm.months.filter((m) => m.precip > alm.annualPrecip / 12 * 1.25);
    if (wet.length >= 2 && Math.abs(s.latDeg) < 18 && alm.annualPrecip > 400) {
        rows.push(`<p class="alm-note">The rain belt crosses this latitude twice a year, so the wet season comes in two pulses rather than one.</p>`);
    }

    return rows.join('');
}

// ── Day view ─────────────────────────────────────────────────────────────────

function renderDayCurve(rec) {
    const W = 480, H = 150;
    const padL = 34, padR = 14, padT = 12, padB = 24;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const vals = rec.diurnal;
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const span = Math.max(6, hi - lo);
    lo -= span * 0.18; hi += span * 0.18;

    const xOf = (h) => padL + (h / 23) * plotW;
    const yOf = (t) => padT + plotH - ((t - lo) / (hi - lo)) * plotH;

    const parts = [`<svg viewBox="0 0 ${W} ${H}" class="alm-chart" role="img" aria-label="Hourly temperature">`];

    // Daylight band behind the curve.
    if (rec.sun) {
        const x1 = xOf(Math.max(0, rec.sun.rise));
        const x2 = xOf(Math.min(23, rec.sun.set));
        parts.push(`<rect x="${x1.toFixed(1)}" y="${padT}" width="${Math.max(0, x2 - x1).toFixed(1)}" height="${plotH}" class="alm-daylight"/>`);
    } else if (rec.daylight >= 23.95) {
        parts.push(`<rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" class="alm-daylight"/>`);
    }

    // Temperature gridlines.
    const step = span > 30 ? 10 : span > 12 ? 5 : 2;
    const gStart = Math.ceil(lo / step) * step;
    for (let t = gStart; t <= hi; t += step) {
        const y = yOf(t);
        parts.push(`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" class="alm-grid"/>`);
        parts.push(`<text x="${padL - 6}" y="${(y + 3.5).toFixed(1)}" class="alm-axis alm-axis-t">${t}</text>`);
    }
    if (lo < 0 && hi > 0) {
        parts.push(`<line x1="${padL}" y1="${yOf(0).toFixed(1)}" x2="${W - padR}" y2="${yOf(0).toFixed(1)}" class="alm-freeze"/>`);
    }

    const pts = vals.map((t, h) => `${xOf(h).toFixed(1)},${yOf(t).toFixed(1)}`).join(' ');
    parts.push(`<polyline points="${pts}" class="alm-line"/>`);

    // Hour labels every six hours.
    for (let h = 0; h <= 24; h += 6) {
        const hh = Math.min(h, 23);
        parts.push(`<text x="${xOf(hh).toFixed(1)}" y="${H - 7}" class="alm-axis alm-month">${String(h).padStart(2, '0')}</text>`);
    }

    parts.push('</svg>');
    return parts.join('');
}

function renderDay(alm) {
    const rec = alm.today;
    const s = alm.site;
    if (!rec) return '<p class="alm-note">No data for this day.</p>';

    const rows = [];
    const sunText = rec.sun
        ? `${formatHour(rec.sun.rise)} → ${formatHour(rec.sun.set)}`
        : (rec.daylight >= 23.95 ? 'never sets' : 'never rises');

    rows.push(`<div class="alm-stats">
        <div><span class="alm-k">High</span><span class="alm-v">${fmtTemp(rec.high)}</span></div>
        <div><span class="alm-k">Low</span><span class="alm-v">${fmtTemp(rec.low)}</span></div>
        <div><span class="alm-k">Daylight</span><span class="alm-v">${rec.daylight.toFixed(1)} h</span></div>
        <div><span class="alm-k">Sun</span><span class="alm-v">${sunText}</span></div>
        <div><span class="alm-k">Wind</span><span class="alm-v">${Math.round(rec.wind)} m/s ${compassPoint(rec.bearing)}</span></div>
        <div><span class="alm-k">Rain</span><span class="alm-v">${rec.precip > 0.05 ? Math.round(rec.precip * 10) / 10 + ' mm' : 'none'}</span></div>
    </div>`);

    rows.push(renderDayCurve(rec));

    if (rec.tags.length) {
        rows.push(`<div class="alm-tags">${rec.tags.map((t) => `<span class="alm-tag">${esc(t)}</span>`).join('')}</div>`);
    }
    rows.push(`<p class="alm-prose">${esc(rec.text)}</p>`);

    if (alm.marine) {
        const m = alm.marine;
        rows.push(`<div class="alm-stats alm-marine">
            <div><span class="alm-k">Sea</span><span class="alm-v">${esc(m.sea)}, ~${m.waveM} m</span></div>
            <div><span class="alm-k">Current</span><span class="alm-v">${m.currentSpeed.toFixed(2)} m/s toward ${compassPoint((m.currentBearing + 180) % 360)}</span></div>
            <div><span class="alm-k">Ice</span><span class="alm-v">${m.ice ? 'sea ice likely' : 'ice free'}</span></div>
        </div>`);
    }

    return rows.join('');
}

// ── Week view ────────────────────────────────────────────────────────────────

function renderWeek(alm) {
    const maxRain = Math.max(2, ...alm.days.map((d) => d.precip));
    const rows = alm.days.map((rec) => {
        const barH = Math.round((rec.precip / maxRain) * 26);
        const tagHtml = rec.tags.slice(0, 3)
            .map((t) => `<span class="alm-tag">${esc(t)}</span>`).join('');
        return `<div class="alm-day">
            <div class="alm-day-head">
                <span class="alm-day-date">${esc(rec.label)}</span>
                <span class="alm-day-temp">${Math.round(rec.high)}° / ${Math.round(rec.low)}°</span>
            </div>
            <div class="alm-day-bar-wrap" title="${rec.precip.toFixed(1)} mm">
                <div class="alm-day-bar" style="height:${barH}px"></div>
            </div>
            <div class="alm-day-body">
                <div class="alm-day-tags">${tagHtml}</div>
                <p class="alm-day-text">${esc(rec.text)}</p>
            </div>
        </div>`;
    });

    return `<div class="alm-week">${rows.join('')}</div>
        <p class="alm-note">Weather is seeded from the planet code, the cell, and the date &mdash; this same week plays out identically every time you come back to it.</p>`;
}

// ── Panel shell ──────────────────────────────────────────────────────────────

function renderPanel() {
    const alm = buildAlmanac(currentRegion, currentDay);
    const body = overlay.querySelector('#almanacBody');
    const title = overlay.querySelector('#almanacTitle');
    const sub = overlay.querySelector('#almanacSub');

    if (!alm) {
        title.textContent = 'Cell Almanac';
        sub.innerHTML = '';
        body.innerHTML = `<p class="alm-note">Climate hasn't been computed for this planet yet. Switch on the climate view, or rebuild at a lower detail level, then try again.</p>`;
        return;
    }

    const s = alm.site;
    const latStr = `${Math.abs(s.latDeg).toFixed(1)}°${s.latDeg >= 0 ? 'N' : 'S'}`;
    const lonStr = `${Math.abs(s.lonDeg).toFixed(1)}°${s.lonDeg >= 0 ? 'E' : 'W'}`;
    title.textContent = `${latStr}, ${lonStr}`;

    const kc = s.koppen;
    const elevText = s.isOcean
        ? `${Math.abs(s.elevKm).toFixed(1)} km deep`
        : `${s.elevKm.toFixed(2)} km`;
    sub.innerHTML = `<span class="alm-chip" style="background:${koppenHex(kc)}"></span>` +
        `${esc(kc.code)} &mdash; ${esc(kc.name)} &middot; ${elevText}`;

    // Date scrubber label.
    const { month, dayOfMonth } = dayToDate(currentDay);
    overlay.querySelector('#almanacDateLabel').textContent = `${dayOfMonth} ${MONTH_NAMES[month]}`;
    const slider = overlay.querySelector('#almanacDate');
    if (+slider.value !== currentDay) slider.value = String(currentDay);

    overlay.querySelectorAll('.alm-tab').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.view === currentView);
    });
    // The date scrubber only means something for the day and week views.
    overlay.querySelector('#almanacDateRow').style.display =
        currentView === 'year' ? 'none' : 'flex';

    if (currentView === 'year') body.innerHTML = renderYear(alm);
    else if (currentView === 'day') body.innerHTML = renderDay(alm);
    else body.innerHTML = renderWeek(alm);
}

function buildOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'almanacOverlay';
    overlay.className = 'hidden';
    overlay.innerHTML = `
        <div id="almanacCard" role="dialog" aria-label="Cell almanac">
            <button id="almanacClose" aria-label="Close">&times;</button>
            <h3 id="almanacTitle">Cell Almanac</h3>
            <div id="almanacSub"></div>
            <div class="alm-tabs">
                <button class="alm-tab active" data-view="year">Year</button>
                <button class="alm-tab" data-view="day">Day</button>
                <button class="alm-tab" data-view="week">Week</button>
            </div>
            <div id="almanacDateRow">
                <input type="range" id="almanacDate" min="0" max="${YEAR_DAYS - 1}" step="1" aria-label="Day of year">
                <span id="almanacDateLabel"></span>
            </div>
            <div id="almanacBody"></div>
        </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#almanacClose').addEventListener('click', closeAlmanac);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeAlmanac();
    });
    overlay.querySelectorAll('.alm-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
            currentView = btn.dataset.view;
            renderPanel();
        });
    });
    overlay.querySelector('#almanacDate').addEventListener('input', (e) => {
        currentDay = +e.target.value;
        renderPanel();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay && !overlay.classList.contains('hidden')) {
            closeAlmanac();
        }
    });
    return overlay;
}

/** Open the almanac for a region. */
export function openAlmanac(region) {
    if (region < 0 || !state.curData) return;
    buildOverlay();
    currentRegion = region;
    renderPanel();
    overlay.classList.remove('hidden');
    // The hover card sits in the middle of the screen and would show through
    // from behind the panel.
    const hover = document.getElementById('hoverInfo');
    if (hover) hover.style.display = 'none';
    // Clear the hovered region too, so moving back over the same cell after
    // closing the panel re-triggers the hover card.
    state.hoveredRegion = -1;
}

export function closeAlmanac() {
    if (overlay) overlay.classList.add('hidden');
}

export function isAlmanacOpen() {
    return !!overlay && !overlay.classList.contains('hidden');
}

/** Close and reset when the planet changes underneath us. */
export function resetAlmanac() {
    currentRegion = -1;
    closeAlmanac();
}
