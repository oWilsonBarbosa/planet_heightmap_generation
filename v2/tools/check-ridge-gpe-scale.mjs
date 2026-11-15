// Synthetic convergence test for the distributed ocean GPE proxy.
// Independent of the model's bifurcating tectonic histories: identical physical
// age field and ocean footprint sampled on three spherical meshes.
// Run: node v2/tools/check-ridge-gpe-scale.mjs
import assert from 'node:assert/strict';
import { labMesh } from './lib/check-kit.mjs';
import { TectonicWorld } from '../js/tectonics/model/world.js';
import { CrustType } from '../js/tectonics/model/crust.js';
import { addDistributedRidgeTraction } from '../js/tectonics/step/ridge-gpe.js';

function measure(cells) {
    const mesh=labMesh(cells),world=new TectonicWorld(mesh,12345);
    const plate=world.addPlate('Controlled moving ocean');
    world.time=100;
    world.config.ridgePush=0.05;
    world.config.ridgeGpeAgeScaleMyr=80;
    world.config.ridgeGpeStrength=1;
    let covered=0;
    // A geographic patch ~80deg latitude by 100deg longitude;
    // a smooth eastward age gradient, independent of mesh cell size.
    for(let w=0;w<mesh.numCells;w++){
        const x=mesh.xyz[3*w],y=mesh.xyz[3*w+1],z=mesh.xyz[3*w+2];
        const lat=Math.asin(z)*180/Math.PI,lon=Math.atan2(y,x)*180/Math.PI;
        if(lat< -40 || lat>40 || lon< -120 || lon> -20)continue;
        const age=5+80*(lon+120)/100;
        plate.crust.create(w,CrustType.OCEAN,world.time-age);
        world.owner[w]=plate.id;
        world.ownerCell[w]=w;
        covered++;
    }
    const load={
        torque:[0,0,0],
        byKind:Array.from({length:5},()=>[0,0,0]),
        forceByKind:Array.from({length:5},()=>[0,0,0]),
        torqueMagnitudeSum:0,
        cells:Array(5).fill(0),
    };
    const result=addDistributedRidgeTraction(world,new Map([[plate.id,load]]));
    assert(result.activeCells>0,'expected ocean age gradient at '+cells+' cells');
    assert(Number.isFinite(load.torque[2]));
    assert(load.torque[2]>0,'eastward age gradient should drive positive Z-axis torque');
    return {requestedCells:cells,actualCells:mesh.numCells,
        oceanAreaMkm2:covered*mesh.cellAreaKm2/1e6,
        activeFraction:result.activeCells/covered,
        netTorqueZ:load.torque[2],netTorqueMagnitude:Math.hypot(...load.torque),
        totalAbsoluteTorque:load.torqueMagnitudeSum};
}
const results=[10000,20000,40000].map(measure);
for(const r of results)console.log('SCALE '+JSON.stringify(r));
function discrepancy(key,a,b){return Math.abs(a[key]-b[key])/Math.max(Math.abs(a[key]),Math.abs(b[key]),1e-12);}
const a=results[0],b=results[1],c=results[2];
for(const field of ['netTorqueZ','netTorqueMagnitude','totalAbsoluteTorque']){
    const coarseFine=discrepancy(field,a,c),mediumFine=discrepancy(field,b,c);
    console.log(field+' relative 10K/40K discrepancy '+(coarseFine*100).toFixed(2)+'%, 20K/40K '+(mediumFine*100).toFixed(2)+'%');
    // Screening tolerance, not a full geodynamic convergence guarantee.
    assert(coarseFine<0.30,'scale screening failed for '+field+' (10K/40K)');
    assert(mediumFine<0.20,'scale screening failed for '+field+' (20K/40K)');
}
console.log('PASS ocean GPE proxy integrated torque converges on fixed age field');
