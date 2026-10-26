/**
 * Fingerprint of the new climate on Earth (40K): a hash of every stage's output. Pure speed-ups must leave it
 * unchanged.
 *
 *   node tuning/climate/hash-climate.mjs
 */

import { createHash } from 'node:crypto';
import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { computeClimate } from '../../v2/js/climate/core.js';
import { energyBalanceTemperature } from '../../v2/js/climate/temperature.js';
import { derivedCirculation } from '../../v2/js/climate/circulation.js';
import { windDrivenOcean } from '../../v2/js/climate/ocean.js';
import { columnWaterRain } from '../../v2/js/climate/rain.js';

const { gray, width, height } = loadEarthGrayscale();
const earth = buildEarthMesh(gray, width, height, { N: 40000 });
const elevKm = new Float32Array(earth.mesh.numRegions);
for (let r = 0; r < elevKm.length; r++) elevKm[r] = elevToHeightKm(earth.r_elevation[r]);
const res = computeClimate({ xyz: earth.r_xyz, elevKm, axes: 'y-up' }, {
    stages: { temperature: energyBalanceTemperature(), circulation: derivedCirculation(), ocean: windDrivenOcean(), rain: columnWaterRain() },
});
const h = (a) => createHash('sha256').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex').slice(0, 12);
const s = res.stages;
console.log(`temperature ${h(s.temperature.monthly)} · circulation ${h(s.circulation.slp)} ${h(s.circulation.u)} · ocean ${h(s.ocean.psi)} · rain ${h(s.rain.P)} · Köppen ${h(res.cell.koppen)}`);
