// Colour ramps for the climate lab. A ramp is a list of [value, [r, g, b]] stops (0–255), linearly interpolated.

export const RAMPS = {
    temperature: { unit: '°C', stops: [
        [-40, [42, 11, 94]], [-25, [49, 54, 149]], [-10, [69, 117, 180]], [0, [224, 243, 248]],
        [10, [254, 224, 144]], [20, [253, 174, 97]], [30, [215, 48, 39]], [40, [103, 0, 31]]] },
    rain: { unit: 'mm/month', log: true, stops: [
        [0, [246, 236, 212]], [10, [228, 214, 150]], [30, [180, 210, 110]], [60, [92, 176, 96]],
        [120, [33, 128, 120]], [250, [30, 90, 170]], [500, [20, 30, 110]]] },
    pressure: { unit: 'hPa', stops: [
        [990, [33, 102, 172]], [1002, [146, 197, 222]], [1012, [247, 247, 247]], [1022, [244, 165, 130]], [1034, [178, 24, 43]]] },
    oceanAnom: { unit: '°C vs latitude average', stops: [
        [-6, [33, 102, 172]], [-2, [146, 197, 222]], [0, [247, 247, 247]], [2, [244, 165, 130]], [6, [178, 24, 43]]] },
    oceanWarmthV1: { unit: 'V1 warmth (−1 cold … +1 warm)', stops: [
        [-1, [33, 102, 172]], [-0.35, [146, 197, 222]], [0, [247, 247, 247]], [0.35, [244, 165, 130]], [1, [178, 24, 43]]] },
    swing: { unit: '°C, warmest minus coldest month', stops: [
        [0, [240, 244, 250]], [5, [198, 219, 239]], [10, [120, 190, 200]], [20, [240, 200, 90]], [30, [230, 120, 50]], [45, [150, 30, 40]], [60, [70, 0, 30]]] },
    swingDiff: { unit: '°C (model − observed swing)', stops: [
        [-20, [5, 48, 97]], [-8, [67, 147, 195]], [-2, [209, 229, 240]], [0, [247, 247, 247]], [2, [253, 219, 199]], [8, [214, 96, 77]], [20, [103, 0, 31]]] },
    seaIce: { unit: 'ice fraction', stops: [[0, [16, 40, 80]], [0.15, [40, 80, 130]], [0.5, [150, 180, 210]], [1, [250, 252, 255]]] },
    tempDiff: { unit: '°C (V1 − observed)', stops: [
        [-12, [5, 48, 97]], [-6, [67, 147, 195]], [-2, [209, 229, 240]], [0, [247, 247, 247]], [2, [253, 219, 199]], [6, [214, 96, 77]], [12, [103, 0, 31]]] },
    rainRatio: { unit: 'V1 ÷ observed', log2: true, stops: [
        [-3, [140, 81, 10]], [-1.5, [216, 179, 101]], [-0.5, [246, 232, 195]], [0, [245, 245, 245]], [0.5, [199, 234, 229]], [1.5, [90, 180, 172]], [3, [1, 102, 94]]] },
    pressureDiff: { unit: 'hPa (V1 − observed)', stops: [
        [-15, [33, 102, 172]], [-5, [146, 197, 222]], [0, [247, 247, 247]], [5, [244, 165, 130]], [15, [178, 24, 43]]] },
};

export const NO_DATA_SEA = [22, 34, 52];     // sea where a field is land-only
export const NO_DATA_LAND = [58, 58, 62];    // land where a field is sea-only

/** Colour of value v on a ramp → [r, g, b]. Ramps flagged `log` interpolate on log(1 + v). */
export function rampColor(ramp, v) {
    const s = ramp.stops;
    const tx = ramp.log ? (x) => Math.log1p(Math.max(0, x)) : (x) => x;
    const x = tx(v);
    if (x <= tx(s[0][0])) return s[0][1];
    for (let k = 1; k < s.length; k++) {
        const x1 = tx(s[k][0]);
        if (x <= x1) {
            const x0 = tx(s[k - 1][0]), f = (x - x0) / (x1 - x0);
            const a = s[k - 1][1], b = s[k][1];
            return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2])];
        }
    }
    return s[s.length - 1][1];
}

/** Draw a horizontal colour bar for a ramp into a canvas, with tick labels. */
export function drawRampBar(canvas, ramp) {
    const g = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height, barH = Math.round(h * 0.45);
    g.clearRect(0, 0, w, h);
    const s = ramp.stops, lo = s[0][0], hi = s[s.length - 1][0];
    const tx = ramp.log ? (x) => Math.log1p(Math.max(0, x)) : (x) => x;
    const xOf = (v) => ((tx(v) - tx(lo)) / (tx(hi) - tx(lo))) * (w - 1);
    for (let px = 0; px < w; px++) {
        // invert xOf for the pixel
        const f = px / (w - 1), tv = tx(lo) + f * (tx(hi) - tx(lo));
        const v = ramp.log ? Math.expm1(tv) : tv;
        const [r, gg, b] = rampColor(ramp, v);
        g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
        g.fillRect(px, 0, 1, barH);
    }
    g.fillStyle = '#8b93a7';
    g.font = `${Math.round(h * 0.38)}px system-ui, sans-serif`;
    g.textBaseline = 'bottom';
    for (const [v] of s) {
        const label = ramp.log2 ? (v === 0 ? '1×' : v > 0 ? `${2 ** v}×` : `1/${2 ** -v}`) : String(v);
        const x = xOf(v);
        g.textAlign = x < 10 ? 'left' : x > w - 10 ? 'right' : 'center';
        g.fillText(label, x, h);
    }
}
