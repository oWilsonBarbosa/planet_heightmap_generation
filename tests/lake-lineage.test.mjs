import test from 'node:test';
import assert from 'node:assert/strict';
import { compareLakeSnapshots } from '../tuning/evolution/lib/lake-lineage.mjs';
const mesh=xs=>({xyz:Float32Array.from(xs.flatMap(x=>[x,0,0])),index:{nearest:x=>x<0?0:1}});
test('coarse marine lake becoming ocean is not reported as another lake',()=>{
  const a={n:2,mesh:mesh([-1,1]),body:Int32Array.from([0,-1]),bodies:[{kind:1,outlet:0,cells:[0]}],
      lake:Uint8Array.from([1,0]),sea:new Uint8Array(2),lakeOrigin:Uint8Array.from([1,0]),cellKm2:10};
  const b={n:4,mesh:mesh([-1,-1,1,1]),body:Int32Array.from([-1,-1,-1,-1]),bodies:[],
      lake:new Uint8Array(4),sea:Uint8Array.from([1,1,0,0]),lakeOrigin:new Uint8Array(4),cellKm2:5};
  const d=compareLakeSnapshots(a,b,{thresholdKm2:5});
  assert.equal(d.largestCoarse[0].fate,'mostly-ocean');
  assert.equal(d.largestCoarse[0].coverage.oceanPct,100);
  assert.equal(d.fateByCoarseOrigin.marine.nowOceanKm2,10);
});
test('multiple fine lakes may split the same coarse lake footprint',()=>{
  const a={n:2,mesh:mesh([-1,1]),body:Int32Array.from([0,-1]),bodies:[{kind:1,outlet:0,cells:[0]}],
      lake:Uint8Array.from([1,0]),sea:new Uint8Array(2),lakeOrigin:Uint8Array.from([2,0]),cellKm2:10};
  const b={n:4,mesh:mesh([-1,-1,1,1]),body:Int32Array.from([0,1,-1,-1]),
      bodies:[{kind:1,outlet:0,cells:[0]},{kind:1,outlet:1,cells:[1]}],
      lake:Uint8Array.from([1,1,0,0]),sea:new Uint8Array(4),lakeOrigin:Uint8Array.from([2,2,0,0]),cellKm2:5};
  const d=compareLakeSnapshots(a,b,{thresholdKm2:5});
  assert.equal(d.largestCoarse[0].fate,'mostly-lake');
  assert.equal(d.largestCoarse[0].matches.length,2);
  assert.equal(d.fateByCoarseOrigin['young-glacial'].nowLakeKm2,10);
});
test('invalid snapshots rejected',()=>assert.throws(()=>compareLakeSnapshots({n:2},{n:4}),/Invalid lake snapshot/));
