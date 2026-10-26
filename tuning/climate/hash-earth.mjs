/**
 * Fingerprint of the Earth evaluation context + V1's climate on it. Pure refactors of the tuning suite must leave
 * it unchanged.   node tuning/climate/hash-earth.mjs [--n 40000]
 */
import crypto from 'node:crypto';
import { buildEarthContext } from './lib/earth-context.mjs';
import { runClimate } from './lib/score.mjs';

const i = process.argv.indexOf('--n');
const N = i > 0 ? +process.argv[i + 1] : 40000;
const ctx = buildEarthContext({ N });
const { r_koppen, tempResult, precipResult } = runClimate(ctx);
const h = crypto.createHash('sha256');
for (const a of [ctx.r_xyz, ctx.r_elevation, ctx.r_plate, ctx.r_truth, ctx.r_scored, r_koppen,
    tempResult.r_temperature_summer, precipResult.r_precip_winter]) h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
console.log(`earth-context + V1 climate @ ${N}: ${h.digest('hex')}`);
