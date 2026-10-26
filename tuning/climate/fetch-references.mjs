/**
 * Downloads the observed Earth climatologies that the new climate's stages are scored against (the per-stage
 * "answer keys"). All public, no account needed. Files land in tuning/climate/data/raw/ (gitignored);
 * regrid-references.mjs then converts them to the shared 1° climate grid.
 *
 *   node tuning/climate/fetch-references.mjs          # fetch what is missing
 *   node tuning/climate/fetch-references.mjs --force  # re-download everything
 *
 * Sources:
 *   Beck et al. 2023 (Sci. Data 10:724), CC BY 4.0, figshare 21789074 —
 *     1991–2020 monthly air temperature + precipitation at 1° (the climate data behind their Köppen maps),
 *     and the 1991–2020 Köppen-Geiger maps (1° and 0.1°).
 *   NOAA PSL THREDDS (public domain):
 *     NCEP/NCAR Reanalysis 1 monthly long-term means 1991–2020, 2.5° — sea-level pressure,
 *       near-surface (sigma 0.995) winds and air temperature.               Kalnay et al. 1996
 *     NOAA OISST v2 monthly long-term means 1991–2020, 1° — sea-surface temperature, sea ice.  Reynolds et al. 2002
 *     GPCP v2.3 monthly long-term means 1991–2020, 2.5° — precipitation over land and sea.    Adler et al. 2018
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractZipEntry } from './lib/unzip.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RAW_DIR = path.join(__dirname, 'data', 'raw');
const PSL = 'https://psl.noaa.gov/thredds/fileServer/Datasets';

/** key → { url, file, extract?: [[zipEntry, destFile], …] } */
export const SOURCES = {
    slp:  { url: `${PSL}/ncep.reanalysis/Monthlies/surface/slp.mon.ltm.1991-2020.nc`, file: 'slp.mon.ltm.1991-2020.nc' },
    uwnd: { url: `${PSL}/ncep.reanalysis/Monthlies/surface/uwnd.sig995.mon.ltm.1991-2020.nc`, file: 'uwnd.sig995.mon.ltm.1991-2020.nc' },
    vwnd: { url: `${PSL}/ncep.reanalysis/Monthlies/surface/vwnd.sig995.mon.ltm.1991-2020.nc`, file: 'vwnd.sig995.mon.ltm.1991-2020.nc' },
    air:  { url: `${PSL}/ncep.reanalysis/Monthlies/surface/air.sig995.mon.ltm.1991-2020.nc`, file: 'air.sig995.mon.ltm.1991-2020.nc' },
    sst:  { url: `${PSL}/noaa.oisst.v2/sst.ltm.1991-2020.nc`, file: 'sst.ltm.1991-2020.nc' },
    icec: { url: `${PSL}/noaa.oisst.v2/icec.ltm.1991-2020.nc`, file: 'icec.ltm.1991-2020.nc' },
    gpcp: { url: `${PSL}/gpcp/precip.mon.ltm.1991-2020.nc`, file: 'precip.mon.ltm.1991-2020.nc' },
    beckClimate: {
        url: 'https://ndownloader.figshare.com/files/61012813', file: 'beck_climate_data_1p0.zip',
        extract: [['1991_2020/ensemble_mean_1p0.nc', 'beck_1991_2020_mean_1p0.nc']],
    },
    beckKoppen: {
        url: 'https://ndownloader.figshare.com/files/61012822', file: 'beck_koppen_geiger_tif.zip',
        extract: [
            ['1991_2020/koppen_geiger_1p0.tif', 'beck_koppen_1991_2020_1p0.tif'],
            ['1991_2020/koppen_geiger_0p1.tif', 'beck_koppen_1991_2020_0p1.tif'],
            ['legend.txt', 'beck_koppen_legend.txt'],
        ],
    },
};

export const rawPath = (file) => path.join(RAW_DIR, file);

async function fetchOne(key, force) {
    const src = SOURCES[key];
    const dest = rawPath(src.file);
    if (!force && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
        console.log(`  ${key.padEnd(12)} cached   ${src.file}`);
    } else {
        const res = await fetch(src.url);
        if (!res.ok) throw new Error(`${key}: HTTP ${res.status} for ${src.url}`);
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(dest, buf);
        console.log(`  ${key.padEnd(12)} ${(buf.length / 1e6).toFixed(1).padStart(6)} MB  ${src.file}`);
    }
    for (const [entry, file] of src.extract ?? []) {
        const out = rawPath(file);
        if (force || !fs.existsSync(out)) { extractZipEntry(dest, entry, out); console.log(`  ${''.padEnd(12)} → ${file}`); }
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const force = process.argv.includes('--force');
    fs.mkdirSync(RAW_DIR, { recursive: true });
    console.log(`Fetching observed climatologies → ${RAW_DIR}  (the Beck archives are ~160 MB and figshare can be slow)`);
    for (const key of Object.keys(SOURCES)) await fetchOne(key, force);
    console.log('Done.');
}
