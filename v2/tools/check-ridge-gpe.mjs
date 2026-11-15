// Synthetic numerical checks for experimental area-integrated ridge traction.
// Run: node v2/tools/check-ridge-gpe.mjs
import assert from 'node:assert/strict';
import { labMesh } from './lib/check-kit.mjs';
import { TectonicWorld } from '../js/tectonics/model/world.js';
import { CrustType } from '../js/tectonics/model/crust.js';
import { oceanGpeAge, addDistributedRidgeTraction } from '../js/tectonics/step/ridge-gpe.js';

const close=(a,b,epsilon=1e-9)=>Math.abs(a-b)<epsilon;
assert.equal(oceanGpeAge(-100),0);
assert.equal(oceanGpeAge(0),0);
assert(oceanGpeAge(1)>0);
assert(oceanGpeAge(10)<oceanGpeAge(80));
assert(oceanGpeAge(80)<oceanGpeAge(1000));
assert(oceanGpeAge(10000)<1);
assert(close(oceanGpeAge(80),0.5));
console.log('PASS monotone, bounded oceanic GPE proxy');

const mesh=labMesh(2000),world=new TectonicWorld(mesh,12345),p=world.addPlate('Test ocean');
world.time=100;
world.config.ridgePush=0.05;
world.config.ridgeGpeAgeScaleMyr=80;
world.config.ridgeGpeStrength=1;
const newLoad=()=>({
    torque:[0,0,0],byKind:Array.from({length:5},()=>[0,0,0]),
    forceByKind:Array.from({length:5},()=>[0,0,0]),
    torqueMagnitudeSum:0,cells:Array(5).fill(0),
});
for(let w=0;w<mesh.numCells;w++){
    world.owner[w]=p.id;
    world.ownerCell[w]=w;
    p.crust.create(w,CrustType.OCEAN,50); // uniform 50-Myr-old crust at t=100
}
const loads=new Map([[p.id,newLoad()]]);
const uniform=addDistributedRidgeTraction(world,loads);
assert.equal(uniform.activeCells,0,'uniformly aged ocean cannot have an age gradient');
assert(close(loads.get(p.id).torqueMagnitudeSum,0));
console.log('PASS uniform ocean has no age-gradient traction');

for(let w=0;w<mesh.numCells;w++){
    // A smooth and spatially varying oceanic-age field: 40..80 Myr old.
    p.crust.formedAt[w]=world.time-(60+20*mesh.xyz[3*w]);
}
const gradient=addDistributedRidgeTraction(world,loads);
assert(gradient.activeCells>0,'varying ocean age should produce distributed traction');
assert(gradient.activeCells<=mesh.numCells);
assert(gradient.totalAreaKm2>0);
assert(loads.get(p.id).torqueMagnitudeSum>0);
assert(loads.get(p.id).torque.every(Number.isFinite));
console.log('PASS age-gradient ocean produces finite area-scaled traction');

const before=loads.get(p.id).torqueMagnitudeSum;
world.config.ridgeGpeStrength=0;
const noForce=addDistributedRidgeTraction(world,loads);
assert.equal(noForce.activeCells,0);
assert.equal(loads.get(p.id).torqueMagnitudeSum,before);
console.log('PASS strength=0 switches off experimental term without changing timestamps');

const passive=new TectonicWorld(mesh,12345);
const background=passive.addPlate('Passive background');
background.isBackground=true;
passive.time=world.time;
passive.config.ridgePush=world.config.ridgePush;
for(let w=0;w<mesh.numCells;w++){
    passive.owner[w]=background.id;
    passive.ownerCell[w]=w;
    background.crust.create(w,CrustType.OCEAN,world.time-(60+20*mesh.xyz[3*w]));
}
const excluded=addDistributedRidgeTraction(passive,new Map());
assert.equal(excluded.activeCells,0,'passive ocean never receives a rotation-driving load');
console.log('PASS background ocean is not driven directly');
console.log('All experimental ridge-GPE checks passed');
