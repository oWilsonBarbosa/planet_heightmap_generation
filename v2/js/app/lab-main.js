// Tectonics Lab shell. Generic across phases: it builds the sim mesh (at the resolution the `sim` setting asks for), loads
// a phase module (?phase=N&seed=S), and wires the timeline, layers, overlays, readout, chart and stats.
// It only ever sees Frames (tectonics/snapshot.js) and the Phase contract (phases/phase-kit.js).

import Delaunator from 'delaunator';
import { setDelaunator } from '../../../js/sphere-mesh.js';
import { buildSimMesh } from '../core/sim-mesh.js';
import { TECTONICS } from '../tectonics/config.js';
import { MapRaster, SmoothMapRaster } from '../view/map-raster.js';
import { plateCss, overlayOverlaps, overlayBoundaries, AGE_STOPS, css } from '../view/palettes.js';
import { GlobeView } from './globe-view.js';
import { drawGraticule, drawVelocityArrows, drawMarkers, drawForceArrows } from './overlays.js';
import { assertPhaseContract } from './phases/phase-kit.js';

setDelaunator(Delaunator);

const PHASES = {
    1: { name: '1 · Rigid motion', load: () => import('./phases/phase1-rigid-drift.js') },
    2: { name: '2 · Ridges & trenches', load: () => import('./phases/phase2-wilson-cycle.js') },
    3: { name: '3 · Start world', load: () => import('./phases/phase3-start-world.js') },
    4: { name: '4 · Driving forces', load: () => import('./phases/phase4-forces.js') },
    5: { name: '5a · Collisions', load: () => import('./phases/phase5-collisions.js') },
    '5b': { name: '5b · Wings & arcs', load: () => import('./phases/phase5b-arcs.js') },
    '6a': { name: '6 · Rifting & new trenches', load: () => import('./phases/phase6-rifting.js') },
    '7a': { name: '7a · Hotspots & LIPs', load: () => import('./phases/phase7-hotspots.js') },
    '7b': { name: '7b · Margins & back-arcs', load: () => import('./phases/phase7b-margins.js') },
    '7c': { name: '7c · Crust budget', load: () => import('./phases/phase7c-budget.js') },
    '8a': { name: '8a · Tectonic surface', load: () => import('./phases/phase8a-terrain.js') },
    '8b': { name: '8b · Rivers', load: () => import('./phases/phase8b-rivers.js') },
};
const LATEST_PHASE = '8b';
const MESH_SEED = 12345;            // the sim mesh is the same for every planet; the seed only shapes the world on it
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const MAP_WIDTH = IS_TOUCH ? 1024 : 2048;

const $ = id => document.getElementById(id);
const ui = { globe: $('globe'), map: $('map'), readout: $('hover'), time: $('time'), timeLabel: $('timeLabel'),
    play: $('play'), rate: $('rate'), layers: $('layers'), seed: $('seed'), panel: $('panel') };
const url = new URLSearchParams(location.search);
const phaseId = PHASES[url.get('phase')] ? url.get('phase') : LATEST_PHASE;
if (url.get('seed')) ui.seed.value = url.get('seed');

// The sim mesh: TECTONICS.simCells cells, or finer where a phase offers it (the `sim` setting, Phase 12: 80K, 160K) — the
// same planet in km and Myr, drawn on finer plates. Each size is built once.
const SIM_SIZES = [40000, 80000, 160000], simMeshes = new Map();
const simMeshOf = cells => { const n = SIM_SIZES.includes(Number(cells)) ? Number(cells) : TECTONICS.simCells; if (!simMeshes.has(n)) simMeshes.set(n, buildSimMesh(n, MESH_SEED)); return simMeshes.get(n); };
let simMesh = simMeshOf(Number(url.get('sim')) || TECTONICS.simCells);
// Pixel → cell tables, one per mesh a phase draws on: the sim mesh (crisp cells), or a phase's finer display mesh
// (terrain, blended smoothly). Every raster has the same size, so the map canvas and the globe texture never change.
const rasters = new Map([[simMesh, new MapRaster(simMesh, MAP_WIDTH)]]);
const { width: MAP_W, height: MAP_H } = rasters.get(simMesh);
ui.map.width = MAP_W;
ui.map.height = MAP_H;
const ctx = ui.map.getContext('2d'), image = ctx.createImageData(MAP_W, MAP_H);
const globe = new GlobeView(ui.globe, ui.map);

const state = { phase: null, frame: null, layer: 0, view: 'globe', playing: false, playTime: 0, lastTick: 0, dirty: true, statsDue: 0, params: paramsFromUrl(),
    raster: rasters.get(simMesh), cellRgb: new Uint8Array(simMesh.numCells * 3),
    section: { on: false, a: null, b: null } };       // the cross-section tool: two picked points (unit vectors)

// ── Building a phase ──

/**
 * Build the phase for the current seed and params. On failure the previous phase stays and the reason is shown.
 * A build that a newer request has overtaken (two quick slider moves) is dropped before it starts.
 */
let buildRequest = 0;
async function loadPhase({ resetCamera = true, resetTime = true } = {}) {
    const request = ++buildRequest;
    $('busy').hidden = false;
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));      // let "Building…" paint first
    if (request !== buildRequest) return;                                        // a newer build is on its way
    try {
        const { createPhase } = await PHASES[phaseId].load();
        useSimMesh(simMeshOf(state.params.sim ?? TECTONICS.simCells));
        const phase = await createPhase(simMesh, Number(ui.seed.value) || 0, state.params, { progress: text => { $('busy').textContent = text; }, repaint: () => { state.dirty = true; } });
        if (request !== buildRequest) return;                                    // overtaken while it was building
        assertPhaseContract(phase);
        useDisplayMesh(phase.displayMesh ?? simMesh);
        const sameKind = state.phase && state.phase.title === phase.title;
        state.phase = phase;
        state.layer = sameKind ? Math.min(state.layer, phase.layers.length - 1) : 0;
        $('buildError').hidden = true;
        renderChrome(phase);
        if (resetTime) { ui.time.value = phase.initialTime ?? 0; state.playTime = Number(ui.time.value); }
        if (resetCamera) globe.lookAt(phase.initialView[0], phase.initialView[1]);
    } catch (err) {
        $('buildError').textContent = err.message;
        $('buildError').hidden = false;
        if (!state.phase) $('phaseTitle').textContent = 'Could not build this phase';
    }
    $('busy').hidden = true;
    $('busy').textContent = 'Building…';
    state.statsDue = 0;
    state.dirty = true;
}

/** Switch to another sim mesh (the `sim` setting): its pixel table replaces the old one's. */
function useSimMesh(mesh) {
    if (mesh === simMesh) return;
    rasters.delete(simMesh);
    simMesh = mesh;
    rasters.set(simMesh, new MapRaster(simMesh, MAP_WIDTH));
    state.raster = rasters.get(simMesh);
    state.cellRgb = new Uint8Array(simMesh.numCells * 3);
}

/** Point the drawing at the mesh the phase paints on (building its pixel table the first time; one fine mesh is kept). */
function useDisplayMesh(mesh) {
    if (!rasters.has(mesh)) {
        for (const m of rasters.keys()) if (m !== simMesh) rasters.delete(m);
        rasters.set(mesh, new SmoothMapRaster(mesh, MAP_WIDTH));
    }
    state.raster = rasters.get(mesh);
    if (state.cellRgb.length !== mesh.numCells * 3) state.cellRgb = new Uint8Array(mesh.numCells * 3);
    globe.setSmooth(mesh !== simMesh);
}

/** Everything in the side panel that depends on the phase but not on the current frame. */
function renderChrome(phase) {
    const seed = Number(ui.seed.value) || 0;
    $('phaseNav').innerHTML = Object.entries(PHASES).map(([id, p]) =>
        `<a href="?phase=${id}&seed=${seed}${state.params.sim ? `&sim=${state.params.sim}` : ''}" class="${id === phaseId ? 'on' : ''}"${id === phaseId ? ' aria-current="page"' : ''}>${p.name}</a>`).join('');
    $('phaseTitle').textContent = phase.title;
    $('phaseSummary').textContent = phase.summary;
    $('checklist').innerHTML = phase.checklist.map(c => `<li>${c}</li>`).join('');
    $('checkCommand').textContent = phase.checkCommand;
    const oldest = AGE_STOPS.at(-1)[0];
    const ramp = AGE_STOPS.map(([age, rgb]) => `${css(rgb)} ${(100 * age / oldest).toFixed(0)}%`).join(',');
    $('legend').innerHTML = phase.legend.map(l =>
        `<span><i${l.gradient ? ' class="ramp"' : ''} style="background:${l.gradient ? `linear-gradient(90deg,${ramp})` : l.color}"></i>${l.label}</span>`).join('');
    $('optBoundariesRow').hidden = !phase.hasBoundaries || !!phase.displayMesh;
    $('optConflictsRow').hidden = !!phase.displayMesh;                  // (sim-cell overlays: not on a finer display mesh)
    $('sectionTool').hidden = !phase.profileAlong;
    if (!phase.profileAlong && state.section.on) setSectionTool(false);
    $('optForcesRow').hidden = !phase.hasForces;
    $('chartSection').hidden = !phase.series;
    const dm = phase.displayMesh;
    $('meshInfo').textContent = `${simMesh.numCells.toLocaleString()} sim cells · ${simMesh.edgeKm.toFixed(0)} km spacing` + (dm ? ` · terrain ${dm.numCells.toLocaleString()} cells · ${dm.edgeKm.toFixed(0)} km` : '');
    ui.time.max = phase.maxTime;
    ui.time.step = phase.timeStep;
    ui.time.value = Math.min(Number(ui.time.value), phase.maxTime);
    ui.layers.innerHTML = phase.layers.map((l, i) => `<button data-layer="${i}" aria-pressed="${i === state.layer}" class="${i === state.layer ? 'on' : ''}">${l.label}</button>`).join('');
    renderParams(phase);
}

/** Text made safe to put into HTML (values can come from the URL). */
const esc = v => String(v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** Generator controls declared by the phase: sliders, or a drop-down when a param has `options`. */
function renderParams(phase) {
    const list = phase.params ?? [];
    $('paramsSection').hidden = list.length === 0;
    $('params').innerHTML = list.map(p => p.options
        ? `<label class="param"><span>${esc(p.label)}</span><select data-param="${esc(p.id)}">${p.options.map(o => `<option value="${esc(o.value)}"${o.value === p.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`
        : `<label class="param"><span>${esc(p.label)}</span><output id="pv_${esc(p.id)}">${esc(p.value)}${esc(p.unit ?? '')}</output>` +
          `<input type="range" data-param="${esc(p.id)}" min="${p.min}" max="${p.max}" step="${p.step}" value="${esc(p.value)}"></label>`).join('');
}

// ── Drawing ──

/** A phase's slow work for a frame (terrain) runs before the frame is painted; the old picture stays up meanwhile. */
let preparing = null;
function redraw() {
    const { phase } = state;
    const frame = phase.frameAt(Number(ui.time.value));
    const shownLayer = phase.layers[state.layer];
    if (phase.prepare && !phase.isReady(frame, shownLayer)) {
        if (!preparing) {
            // (said only if it takes a while: a frame built ahead is only shaded, in a tenth of a second)
            const say = setTimeout(() => { $('busy').hidden = false; $('busy').textContent = 'Building terrain…'; }, 250);
            preparing = phase.prepare(frame, shownLayer)
                .catch(err => { $('buildError').textContent = err.message; $('buildError').hidden = false; })
                .finally(() => { clearTimeout(say); preparing = null; $('busy').hidden = true; $('busy').textContent = 'Building…'; state.dirty = true; });
        }
        return false;
    }
    state.frame = frame;
    const { raster, cellRgb } = state, layer = phase.layers[state.layer], onSim = !phase.displayMesh;
    layer.paint(frame, cellRgb);
    if (onSim && $('optConflicts').checked) overlayOverlaps(frame, cellRgb);
    if (onSim && phase.hasBoundaries && $('optBoundaries').checked) (phase.paintBoundaries ?? overlayBoundaries)(frame, cellRgb);
    raster.paint(cellRgb, image.data);
    ctx.putImageData(image, 0, 0);
    if ($('optGrid').checked) drawGraticule(ctx, raster.width, raster.height);
    if ($('optArrows').checked) drawVelocityArrows(ctx, rasters.get(simMesh), frame);      // (plates are looked up by sim cell)
    if (phase.hasForces && $('optForces').checked) drawForceArrows(ctx, raster, frame, phase.forceScale);
    if ($('optMarkers').checked) drawMarkers(ctx, raster, phase.markers(frame));
    layer.overlay?.(ctx, raster, frame);
    if (state.section.on && state.section.a) drawSectionLine(ctx, raster);
    if (state.section.on && state.section.b) drawSection(phase.profileAlong(frame, state.section.a, state.section.b, 320));
    globe.textureChanged();
    ui.timeLabel.textContent = `${frame.time.toFixed(0)} Myr`;
    return true;
}

function updateStats() {
    const s = state.phase.stats(state.frame);
    $('budget').innerHTML = s.cards.map(c => `<div><b>${c.big}</b><span>${c.small}</span></div>`).join('');
    $('plateTable').innerHTML = `<tr>${s.head.map(h => `<th>${h}</th>`).join('')}</tr>` + s.rows.map(r =>
        `<tr><td><i style="background:${r.color ?? plateCss(r.plateId)}"></i>${r.name}</td>${r.cells.map(c => `<td>${c}</td>`).join('')}</tr>` +
        (r.note ? `<tr class="note"><td colspan="${s.head.length}">${r.note}</td></tr>` : '')).join('');
    $('statsHint').textContent = s.hint;
    if (state.phase.series) drawChart(state.phase.series, state.frame.time, state.phase.maxTime, state.phase.seriesUnit ?? 'cm/yr');
}

/** Line chart of one number per plate through time, with a cursor at the current frame. */
function drawChart(series, now, maxTime, unit) {
    const cv = $('chart'), dpr = Math.min(devicePixelRatio || 1, 2), W = cv.clientWidth || 340, H = 150;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d'), padL = 28, padB = 16, padT = 6;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const top = Math.max(5, ...series.flatMap(s => (s.points ?? []).map(p => p[1]))) * 1.08;
    const X = t => padL + (W - padL - 6) * t / maxTime, Y = v => H - padB - (H - padB - padT) * v / top;
    g.clearRect(0, 0, W, H);
    g.font = '11px system-ui, sans-serif'; g.fillStyle = '#8b93a7'; g.strokeStyle = '#232838'; g.lineWidth = 1;
    for (let v = 0; v <= top; v += top > 60 ? 20 : top > 12 ? 5 : 1) { g.beginPath(); g.moveTo(padL, Y(v)); g.lineTo(W - 6, Y(v)); g.stroke(); g.fillText(String(v), 6, Y(v) + 4); }
    g.fillText(`${maxTime} Myr`, W - 50, H - 3);
    for (const s of series) {
        if (s.ticks) {                                   // events: a short tick at the foot of the chart at each one's time
            g.strokeStyle = s.color; g.lineWidth = 2; g.beginPath();
            for (const t of s.ticks) { g.moveTo(X(t), H - padB); g.lineTo(X(t), H - padB - 12); }
            g.stroke();
            continue;
        }
        g.strokeStyle = s.color; g.lineWidth = 2; g.beginPath();
        s.points.forEach(([t, v], i) => (i ? g.lineTo(X(t), Y(v)) : g.moveTo(X(t), Y(v))));
        g.stroke();
    }
    g.strokeStyle = '#d9deea'; g.lineWidth = 1; g.beginPath(); g.moveTo(X(now), padT); g.lineTo(X(now), H - padB); g.stroke();
    $('chartKey').innerHTML = unit + ' · ' + series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('');
}

function tick(now) {
    if (state.playing && state.phase && !preparing) {
        // Wall-clock playback (Myr per second): arbitrarily slow, independent of the display's refresh rate.
        // The slider snaps to real frames, so slow speeds simply hold each frame longer. A frame still being built
        // holds the clock: playback waits for it, rather than running on to frames that are not built either.
        state.playTime += Math.min(0.1, (now - state.lastTick) / 1000) * Number(ui.rate.value);
        if (state.playTime > state.phase.maxTime) state.playTime = 0;
        const shown = ui.time.value;
        ui.time.value = state.playTime;
        if (ui.time.value !== shown) state.dirty = true;
    }
    state.lastTick = now;
    if (state.dirty && state.phase) {
        const painted = redraw();                      // (false: waiting for the phase to prepare the frame)
        state.dirty = false;
        // some stats cost a full pass per plate — refresh a few times a second while playing, not per frame
        if (painted && now >= state.statsDue) { updateStats(); state.statsDue = now + (state.playing ? 300 : 0); }
    }
    if (state.view === 'globe') { globe.resize(); globe.render(); }
    requestAnimationFrame(tick);
}

// ── Timeline ──

function setPlaying(on) {
    state.playing = on;
    state.playTime = Number(ui.time.value);
    ui.play.textContent = on ? '❚❚' : '▶';
    if (!on) { state.statsDue = 0; state.dirty = true; }
}
function stepFrames(n) {
    if (!state.phase) return;                          // (no phase built yet: nothing to step through)
    if (state.playing) setPlaying(false);
    ui.time.value = Math.max(0, Math.min(state.phase.maxTime, Number(ui.time.value) + n * state.phase.timeStep));
    state.playTime = Number(ui.time.value);
    state.dirty = true;
}
ui.time.addEventListener('input', () => { state.playTime = Number(ui.time.value); state.dirty = true; });
ui.play.addEventListener('click', () => setPlaying(!state.playing));
$('stepBack').addEventListener('click', () => stepFrames(-1));
$('stepForward').addEventListener('click', () => stepFrames(1));

// Space plays/pauses, ← / → step one frame — but never while a form control has the keyboard.
addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey || !state.phase) return;
    if (e.target.closest?.('input, select, textarea, button, a')) return;
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!state.playing); }
    else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); stepFrames(e.code === 'ArrowRight' ? 1 : -1); }
});

// ── Display options, layers, view, params, seed ──

for (const id of ['optConflicts', 'optBoundaries', 'optArrows', 'optForces', 'optMarkers', 'optGrid']) $(id).addEventListener('change', () => { state.dirty = true; });
ui.layers.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.layer = Number(b.dataset.layer);
    for (const x of ui.layers.children) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }
    state.dirty = true;
});
$('viewSwitch').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.view = b.dataset.view;
    for (const x of $('viewSwitch').children) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }
    ui.globe.hidden = state.view !== 'globe';
    ui.map.hidden = state.view !== 'map';
    ui.readout.hidden = true;
});
$('params').addEventListener('input', e => {
    const def = state.phase.params.find(p => p.id === e.target.dataset.param);
    if (def && !def.options) $('pv_' + def.id).textContent = e.target.value + (def.unit ?? '');
});
$('params').addEventListener('change', e => {
    const def = state.phase.params.find(p => p.id === e.target.dataset.param); if (!def) return;
    state.params = { ...state.params, [def.id]: def.options ? e.target.value : Number(e.target.value) };
    syncUrl();
    // a new scene starts over; a slider (or a keepView choice) keeps your place — a toEnd choice (an ending) keeps the camera and shows the end
    loadPhase(def.options && !def.keepView ? {} : { resetCamera: false, resetTime: !!def.toEnd });
});
ui.seed.addEventListener('change', () => { syncUrl(); loadPhase(); });

// The URL carries the phase, the seed and every generator / scene setting, so a view can be shared or reloaded:
//   ?phase=4&seed=12345&scene=india&mobility=3.5
// Only numbers are taken from it — and a scene id or an ending, which must look like one; a phase ignores any key it does not declare.
function paramsFromUrl() {
    const out = {};
    for (const [key, value] of url) {
        if (key === 'phase' || key === 'seed') continue;
        if (key === 'scene' || key === 'ending') { if (/^[a-z0-9-]+$/.test(value)) out[key] = value; continue; }
        if (value !== '' && Number.isFinite(Number(value))) out[key] = Number(value);
    }
    return out;
}
function syncUrl() {
    const query = new URLSearchParams({ phase: phaseId, seed: Number(ui.seed.value) || 0, ...state.params });
    history.replaceState(null, '', '?' + query);
}
$('reseed').addEventListener('click', () => { ui.seed.value = Math.floor(Math.random() * 1e6); ui.seed.dispatchEvent(new Event('change')); });
$('panelHandle').addEventListener('click', () => ui.panel.classList.toggle('open'));

// ── Readout: what is under the pointer (hover on desktop, tap on touch) ──

function pixelUnder(e) {
    if (state.view === 'globe') {
        const uv = globe.uvAt(e.clientX, e.clientY);
        return uv ? [uv.x * MAP_W, (1 - uv.y) * MAP_H] : null;
    }
    // the map canvas is letterboxed by object-fit: contain — undo that
    const r = ui.map.getBoundingClientRect(), cs = getComputedStyle(ui.map);
    const padL = parseFloat(cs.paddingLeft), padT = parseFloat(cs.paddingTop);
    const boxW = r.width - padL - parseFloat(cs.paddingRight), boxH = r.height - padT - parseFloat(cs.paddingBottom);
    const scale = Math.min(boxW / MAP_W, boxH / MAP_H);
    const x = (e.clientX - (r.left + padL + (boxW - MAP_W * scale) / 2)) / scale, y = (e.clientY - (r.top + padT + (boxH - MAP_H * scale) / 2)) / scale;
    return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H ? [x, y] : null;
}
function showReadout(e) {
    const px = state.frame && pixelUnder(e);
    if (!px) { ui.readout.hidden = true; return; }
    const lat = 90 - px[1] / MAP_H * 180, lon = px[0] / MAP_W * 360 - 180;
    ui.readout.textContent = `${state.phase.describeCell(state.frame, state.raster.cellAt(px[0], px[1]))} · ${Math.abs(lat).toFixed(0)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(0)}°${lon >= 0 ? 'E' : 'W'}`;
    ui.readout.hidden = false;
    if (NARROW.matches) return;                        // the narrow layout pins the readout under the view switch (lab.css)
    // beside the pointer — on the side with room, so a long readout never runs off the stage
    const s = $('stage').getBoundingClientRect(), x = e.clientX - s.left, y = e.clientY - s.top, gap = 14;
    const w = ui.readout.offsetWidth, h = ui.readout.offsetHeight;
    ui.readout.style.left = `${x + gap + w <= s.width ? x + gap : Math.max(0, x - gap - w)}px`;
    ui.readout.style.top = `${y + gap + h <= s.height ? y + gap : Math.max(0, y - gap - h)}px`;
}
// ── Cross-section: with the tool on, a click (not a drag) picks A, the next B; the profile shows under Display ──

function setSectionTool(on) {
    state.section.on = on;
    $('sectionTool').setAttribute('aria-pressed', on);
    $('sectionTool').classList.toggle('on', on);
    $('sectionPanel').hidden = !on;
    state.section.a = state.section.b = null;
    $('sectionHint').textContent = on ? 'Click or tap a point on the planet, then a second one.' : '';
    state.dirty = true;
}
$('sectionTool').addEventListener('click', () => setSectionTool(!state.section.on));

function pickSectionPoint(e) {
    const px = state.frame && pixelUnder(e);
    if (!px) return;
    const lat = (90 - px[1] / MAP_H * 180) * Math.PI / 180, lon = (px[0] / MAP_W * 360 - 180) * Math.PI / 180;
    const p = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
    if (!state.section.a || state.section.b) { state.section.a = p; state.section.b = null; $('sectionHint').textContent = 'Now pick the second point.'; }
    else state.section.b = p;
    state.dirty = true;
}

/** n + 1 points along the great circle from a to b (unit vectors). */
function greatCircle(a, b, n) {
    const ang = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))), s = Math.sin(ang) || 1, out = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n, ka = ang ? Math.sin((1 - t) * ang) / s : 1 - t, kb = ang ? Math.sin(t * ang) / s : t;
        out.push([ka * a[0] + kb * b[0], ka * a[1] + kb * b[1], ka * a[2] + kb * b[2]]);
    }
    return out;
}

function drawSectionLine(g, raster) {
    const { a, b } = state.section, pts = b ? greatCircle(a, b, 128) : [a];
    g.save(); g.lineWidth = 3; g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff';
    g.beginPath();
    let prev = null;
    for (const p of pts) {
        const [x, y] = raster.project(p[0], p[1], p[2]);
        if (!prev || Math.abs(x - prev[0]) > MAP_W / 2) g.moveTo(x, y); else g.lineTo(x, y);
        prev = [x, y];
    }
    g.stroke();
    for (const [p, label] of [[a, 'A'], ...(b ? [[b, 'B']] : [])]) {
        const [x, y] = raster.project(p[0], p[1], p[2]);
        g.beginPath(); g.arc(x, y, 6, 0, 2 * Math.PI); g.fill();
        g.font = 'bold 20px system-ui, sans-serif'; g.fillText(label, x + 9, y - 9);
    }
    g.restore();
}

/** The profile chart: height (km) along the section — sea blue, land brown, sea level dashed. */
function drawSection(profile) {
    const cv = $('sectionChart'), dpr = Math.min(devicePixelRatio || 1, 2), W = cv.clientWidth || 340, H = 170;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d'), padL = 34, padB = 18, padT = 8, { km, heightKm } = profile, total = km[km.length - 1] || 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    let lo = 0, hi = 1, max = -Infinity, min = Infinity;
    for (const v of heightKm) { lo = Math.min(lo, v); hi = Math.max(hi, v); max = Math.max(max, v); min = Math.min(min, v); }
    lo = Math.floor(lo); hi = Math.ceil(hi);
    const X = d => padL + (W - padL - 6) * d / total, Y = v => padT + (H - padT - padB) * (hi - v) / (hi - lo);
    g.font = '11px system-ui, sans-serif'; g.fillStyle = '#8b93a7'; g.strokeStyle = '#232838'; g.lineWidth = 1;
    const step = hi - lo > 12 ? 4 : hi - lo > 6 ? 2 : 1;
    for (let v = lo; v <= hi; v += step) { g.beginPath(); g.moveTo(padL, Y(v)); g.lineTo(W - 6, Y(v)); g.stroke(); g.fillText(`${v}`, 6, Y(v) + 4); }
    g.fillText(`${Math.round(total).toLocaleString()} km`, W - 64, H - 4);
    for (let i = 1; i < km.length; i++) {                          // a column per sample: blue where the ground is under the sea
        const v = (heightKm[i - 1] + heightKm[i]) / 2;
        g.fillStyle = v < 0 ? '#2a5c9a' : '#8a7152';
        g.beginPath(); g.moveTo(X(km[i - 1]), Y(heightKm[i - 1])); g.lineTo(X(km[i]), Y(heightKm[i])); g.lineTo(X(km[i]), Y(lo)); g.lineTo(X(km[i - 1]), Y(lo)); g.fill();
    }
    g.setLineDash([4, 4]); g.strokeStyle = '#9fd0ff'; g.beginPath(); g.moveTo(padL, Y(0)); g.lineTo(W - 6, Y(0)); g.stroke(); g.setLineDash([]);
    g.strokeStyle = '#d9deea'; g.lineWidth = 1.5; g.beginPath();
    km.forEach((d, i) => (i ? g.lineTo(X(d), Y(heightKm[i])) : g.moveTo(X(d), Y(heightKm[i]))));
    g.stroke();
    g.fillStyle = '#d9deea'; g.fillText('A', padL + 2, padT + 10); g.fillText('B', W - 16, padT + 10);
    $('sectionHint').textContent = `Highest ${max.toFixed(2)} km, lowest ${min.toFixed(2)} km (above sea level). ${profile.note ?? ''} Click again to start a new section.`;
}

const NARROW = matchMedia('(max-width: 768px)');
for (const el of [ui.globe, ui.map]) {
    // with the cross-section tool on, a click that does not drag the globe picks a point
    let down = null;
    el.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    el.addEventListener('pointerup', e => { if (state.section.on && down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6) pickSectionPoint(e); down = null; });
    // a mouse hovers; a finger or pen taps (whatever the screen size)
    el.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') showReadout(e); });
    el.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') showReadout(e); });
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') ui.readout.hidden = true; });
}

await loadPhase();
requestAnimationFrame(tick);
