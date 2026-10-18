import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
// Upstream h3-js Emscripten ES build expects Node globals during initialization.
globalThis.require = createRequire(import.meta.url);
globalThis.__dirname = new URL('../vendor/', import.meta.url).pathname;
const atlas = await import('../js/world-atlas.js');

test('global coverage, reciprocal topology, pentagons and sphere area',()=>{
 const cells=atlas.globalCells(); assert.equal(cells.length,842);assert.equal(new Set(cells).size,842);
 let area=0,pentagons=0;
 for(const id of cells){const c=atlas.cellInfo(id);area+=c.areaKm2;
 assert.equal(atlas.locate(c.center.latDeg,c.center.lonDeg),id);
 if(c.neighborIds.length===5)pentagons++;else assert.equal(c.neighborIds.length,6);
 for(const n of c.neighborIds)assert.ok(atlas.cellInfo(n.slice(3)).neighborIds.includes(c.id));}
 assert.equal(pentagons,12);assert.ok(Math.abs(area-4*Math.PI*6371.007180918475**2)<1);
});
test('coordinate identity across projections, seams, poles and levels',()=>{
 for(const lat of [-90,-89.999,-45,0,45,89.999,90])for(const lon of [-180,-179.999,0,179.999,180]){
 const p=atlas.fromDirection(...atlas.direction(lat,lon));
 for(const level of ['global','regional'])assert.equal(atlas.locate(lat,lon,level),atlas.locate(p.latDeg,p.lonDeg,level));
 assert.equal(atlas.locate(lat,lon),atlas.locate(lat,lon+360));
 }
 assert.throws(()=>atlas.locate(91,0),RangeError);
 const segments=atlas.projectSegment([10,179],[12,-179]);assert.equal(segments.length,2);
 for(const [a,b] of segments){assert.ok(Math.abs(a[0]-b[0])<.1);for(const p of [a,b])assert.ok(Math.abs(p[0])<=2);}
});
test('bounded regional generation and deterministic physical aggregation independent of detail identity',()=>{
 const id=atlas.locate(12,30), fine=atlas.locate(12,30,'regional');assert.ok(atlas.regionalCells(fine).length<=19);
 const data={r_xyz:new Float32Array(atlas.direction(12,30)),r_elevation:new Float32Array([.5]),r_temperature_summer:[.5],r_temperature_winter:[.5],r_precip_summer:[.2],r_precip_winter:[.4]};
 const a=atlas.sampleCell(id,data,x=>x*2);assert.deepEqual(a,atlas.sampleCell(id,data,x=>x*2));assert.equal(a.elevationMeanM,1000);assert.equal(a.landFraction,1);assert.equal(a.temperatureMeanC,0);assert.ok(Math.abs(a.precipitationIndex-.3)<1e-9);
 assert.equal(atlas.locate(12,30),id);
});
