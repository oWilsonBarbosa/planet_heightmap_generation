/**
 * Lists the variables in every downloaded reference file (tuning/climate/data/raw/*.nc).
 *   node tuning/climate/inspect-references.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listVariables } from './lib/nc-read.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'raw');
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.nc'))) {
    console.log('==', f);
    for (const v of await listVariables(path.join(dir, f))) {
        console.log('  ', v.name, JSON.stringify(v.shape ?? v.dims), v.units ?? '', v.long_name ?? '');
    }
}
