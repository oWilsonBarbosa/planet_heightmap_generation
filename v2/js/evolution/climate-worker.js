// The Evolution page's climate worker (step D): the new climate (v2/js/climate/) for one moment of the history, off the
// page's thread — on request only (developer: "we dont need climate on every moment. It takes way too long"). It is
// computed on a fixed 1° grid, so it takes about the same time at every terrain detail (~1 s on a desktop).
//
// Messages in:  {type: 'mesh', key, xyz}                 a terrain mesh's unit-sphere positions (z north), once per mesh
//               {type: 'climate', id, key, heightKm, options}  a frame's terrain heights (km, the sea at 0) on that mesh;
//                                                         options: the page's Greenhouse / Precipitation (greenhouseWm2, precipScale)
// Message out:  {type: 'climate', id, data} | {type: 'error', id, message} — only what the page draws, handed over
//   (climate-fields.js; data.cell.stats: the land cells' tRange, aridity, growing, rainSeason — cell-stats.js bytes).

import { planetClimate } from '../climate/climate.js';
import { pageClimate, climateTransfers } from './climate-fields.js';
import { cellStatsCollector } from '../climate/cell-stats.js';

const meshes = new Map();

self.onmessage = ({ data }) => {
    if (data.type === 'mesh') { meshes.set(data.key, data.xyz); return; }
    if (data.type !== 'climate') return;
    const { id, key, heightKm, options = {} } = data;
    try {
        const t0 = performance.now();
        // (and each land cell's measures beyond Köppen, from its twelve months — cell-stats.js — one byte each)
        const xyz = meshes.get(key), stats = cellStatsCollector(heightKm.length, c => Math.asin(Math.max(-1, Math.min(1, xyz[3 * c + 2]))), { bytes: true });
        const res = planetClimate({ xyz, elevKm: heightKm, axes: 'z-up' }, { ...options, onCell: stats.add });
        const out = pageClimate(res);
        out.cell.stats = stats.stats;
        out.ms = performance.now() - t0;
        self.postMessage({ type: 'climate', id, data: out }, climateTransfers(out));
    } catch (err) {
        self.postMessage({ type: 'error', id, message: err?.stack ?? String(err) });
    }
};
