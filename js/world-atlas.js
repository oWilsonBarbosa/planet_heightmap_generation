// Geographic identity is independent of the simulation mesh and seed.
import * as h3 from '../vendor/h3-js.es.js';
export const ATLAS_VERSION = 'atlas-h3-v1';
export const LEVELS = { global: 1, regional: 3 };
export function normalizeLocation(latDeg, lonDeg) {
    if (!Number.isFinite(latDeg) || !Number.isFinite(lonDeg) || Math.abs(latDeg) > 90) throw new RangeError('Invalid coordinates');
    return { latDeg, lonDeg: Math.abs(latDeg) === 90 ? 0 : ((lonDeg + 180) % 360 + 360) % 360 - 180 };
}
export function locate(lat, lon, level = 'global') {
    const p = normalizeLocation(lat, lon);
    if (!(level in LEVELS)) throw new RangeError('Invalid level');
    return h3.latLngToCell(p.latDeg, p.lonDeg, LEVELS[level]);
}
export function cellInfo(index) {
    const [latDeg, lonDeg] = h3.cellToLatLng(index);
    return { id: `h3:${index}`, resolution: h3.getResolution(index), center: { latDeg, lonDeg },
        areaKm2: h3.cellArea(index, h3.UNITS.km2), neighborIds: h3.gridDisk(index, 1).filter(x => x !== index).map(x => `h3:${x}`) };
}
export const boundary = index => h3.cellToBoundary(index);
export const globalCells = () => h3.getRes0Cells().flatMap(x => h3.cellToChildren(x, 1));
export const regionalCells = index => h3.gridDisk(index, 2);
export function direction(lat, lon) {
    const a = lat * Math.PI / 180, b = lon * Math.PI / 180;
    return [Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b)];
}
export function fromDirection(x, y, z) {
    return normalizeLocation(Math.asin(Math.max(-1, Math.min(1, y / Math.hypot(x,y,z)))) * 180 / Math.PI, Math.atan2(x,z) * 180 / Math.PI);
}
// Short segments clipped at the projection seam, including a copy on the other edge.
export function projectSegment(a, b, centerLon = 0) {
    const wrap = lon => ((lon - centerLon + 180) % 360 + 360) % 360 - 180;
    let x = wrap(a[1]), y = wrap(b[1]);
    if (y - x > 180) y -= 360;
    if (y - x < -180) y += 360;
    const out = [];
    for (const shift of [-360, 0, 360]) {
        const u = x + shift, v = y + shift, delta = v-u;
        let t0 = 0, t1 = 1;
        if (delta === 0) { if (u < -180 || u > 180) continue; }
        else { t0 = Math.max(0, Math.min((-180-u)/delta, (180-u)/delta)); t1 = Math.min(1, Math.max((-180-u)/delta, (180-u)/delta)); }
        if (t0 <= t1) out.push([[ (u+delta*t0)/90, (a[0]+(b[0]-a[0])*t0)/90 ], [ (u+delta*t1)/90, (a[0]+(b[0]-a[0])*t1)/90 ]]);
    }
    return out;
}
export function sampleCell(index, data, elevationKm) {
    const info = cellInfo(index), verts = boundary(index), c = info.center;
    const lons = verts.map(p => c.lonDeg + ((p[1]-c.lonDeg+540)%360)-180);
    const lo = Math.min(...verts.map(p => p[0])), hi = Math.max(...verts.map(p => p[0]));
    const points = [];
    for (let i=0;i<5;i++) for(let j=0;j<5;j++) {
        const lat = Math.asin(Math.sin(lo*Math.PI/180)+(Math.sin(hi*Math.PI/180)-Math.sin(lo*Math.PI/180))*(i+.5)/5)*180/Math.PI;
        const lon = Math.min(...lons)+(Math.max(...lons)-Math.min(...lons))*(j+.5)/5;
        if (h3.latLngToCell(lat,lon,info.resolution) === index) points.push([lat,lon]);
    }
    if (!points.length) points.push([c.latDeg,c.lonDeg]);
    const result = { landFraction:0, elevationMeanM:0 }, votes = new Map();
    const climate = data.r_temperature_summer && data.r_temperature_winter;
    const rain = data.r_precip_summer && data.r_precip_winter;
    if(climate) result.temperatureMeanC=0;
    if(rain) result.precipitationIndex=0;
    for(const p of points) {
        const v=direction(...p); let best=-Infinity, r=0;
        for(let k=0;k<data.r_elevation.length;k++) {
            const dot=v[0]*data.r_xyz[k*3]+v[1]*data.r_xyz[k*3+1]+v[2]*data.r_xyz[k*3+2];
            if(dot>best){best=dot;r=k;}
        }
        result.landFraction += data.r_elevation[r]>0 ? 1 : 0;
        result.elevationMeanM += elevationKm(data.r_elevation[r])*1000;
        if(climate) result.temperatureMeanC += -45+90*(data.r_temperature_summer[r]+data.r_temperature_winter[r])/2;
        if(rain) result.precipitationIndex += (data.r_precip_summer[r]+data.r_precip_winter[r])/2;
        const k=data.debugLayers?.koppen?.[r]; if(k!==undefined) votes.set(k,(votes.get(k)||0)+1);
    }
    for(const key of Object.keys(result)) result[key]/=points.length;
    result.koppenIndex = [...votes].sort((a,b)=>b[1]-a[1] || a[0]-b[0])[0]?.[0];
    return { ...result, source:'Orogen', method:'area-quadrature-nearest-v1', samples:points.length, simulationRegions:data.r_elevation.length, version:ATLAS_VERSION };
}
