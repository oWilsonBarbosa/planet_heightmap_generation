// The Terrain view's colours, chosen with the view strip's Colours: Generate's own ('classic', color-map.js's
// elevationToColor — the default) or one of Evolution's palettes (v2/js/evolution/looks.js), read by height in km.
// Linear RGB 0–1, as the globe's and the map's vertex colours and the export's colour map take them.

import { elevationToColor, elevToHeightKm } from './color-map.js';
import { heightLutOf } from '../v2/js/evolution/looks.js';
import { state } from './state.js';

const PALETTE_KEY = 'orogen.terrain.palette';
const toLinear = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

// (each palette's table — sRGB bytes every 10 m — once in linear light)
const linear = new Map();
function tableOf(id) {
    if (!linear.has(id)) {
        const lut = heightLutOf(id), rgb = new Float32Array(lut.rgb.length);
        for (let i = 0; i < rgb.length; i++) rgb[i] = toLinear(lut.rgb[i] / 255);
        linear.set(id, { ...lut, rgb });
    }
    return linear.get(id);
}

/** The Terrain view's colour of a raw elevation (relative to sea level), in the palette chosen. */
export function terrainColor(e) {
    if (state.palette === 'classic') return elevationToColor(e);
    const T = tableOf(state.palette), m = elevToHeightKm(e) * 1000;
    // (the coast exact, as Evolution's: a cell just under sea level is sea, one just over it land)
    const j = Math.round((m - T.minM) / T.stepM), i = 3 * (m < 0 ? Math.max(0, Math.min(T.zero - 1, j)) : Math.min(T.n - 1, Math.max(T.zero, j)));
    return [T.rgb[i], T.rgb[i + 1], T.rgb[i + 2]];
}

/** The same as a CSS colour, for the legend (Classic's as its legend has always drawn it). */
export function terrainCss(e) {
    const c = state.palette === 'classic' ? elevationToColor(e) : terrainColor(e).map(v => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
    return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
}

/**
 * Wire the Colours menu (#palette): the palette remembered (only where the browser allows), and `redraw` called when
 * it changes.
 */
export function initPaletteMenu(redraw) {
    const sel = document.getElementById('palette');
    if (!sel) return;
    let stored = null;
    try { stored = localStorage.getItem(PALETTE_KEY); } catch { /* (remembered only where the browser allows) */ }
    if (stored && [...sel.options].some(o => o.value === stored)) state.palette = stored;
    sel.value = state.palette;
    sel.addEventListener('change', () => {
        state.palette = sel.value;
        try { localStorage.setItem(PALETTE_KEY, state.palette); } catch { /* (remembered only where the browser allows) */ }
        redraw();
    });
}
