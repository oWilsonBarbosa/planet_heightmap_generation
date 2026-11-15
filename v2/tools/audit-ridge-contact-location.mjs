// Audit exact eligibility for RIDGE loads by reproducing the read-only conditions
// in tectonics/step/forces.js; classify the corresponding current boundary geometry.
// No engine mutation. Intended for direct baseline/candidate comparisons.
import fs from 'node:fs';
import path from 'node:path';
import { labMesh } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { CrustType, CrustFlag } from '../js/tectonics/model/crust.js';
import { BoundaryKind } from '../js/tectonics/model/world.js';
import { contactAt } from '../js/tectonics/step/contact.js';

const opt=(key,def)=>process.argv.find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3)??def;
const seed=Number(opt('seed','777')),cells=Number(opt('cells','20000')),until=Number(opt('until','44'));
const every=Number(opt('every','2')),out=opt('out','reports/ridge-locations-'+cells+'-'+seed);
if(![seed,cells,until,every].every(Number.isInteger)||cells<2000||until<1||every<1||until%every)throw Error('Bad args');
const scene=TERRAIN_SCENES.find(s=>s.id==='cycle'),mesh=labMesh(cells);
if(!scene)throw Error('cycle scene missing');
const world=scene.build(mesh,seed),rows=[],direction=[0,0,0,0];
const labels=Object.fromEntries(Object.entries(BoundaryKind).map(([k,v])=>[v,k]));
function ageOfRift(A,a,B,b,t){
    const born=Math.max(A.born,B.born);
    if(A.riftPartner!==B.id||B.riftPartner!==A.id)return Infinity;
    const split=A.oceanSplitWith===B.id&&B.oceanSplitWith===A.id;
    const mA=split||(A.crust.flags[a]&CrustFlag.RIFT_MARGIN)!==0;
    const mB=split||(B.crust.flags[b]&CrustFlag.RIFT_MARGIN)!==0;
    const youngA=A.crust.type[a]===CrustType.OCEAN&&A.crust.formedAt[a]>=born;
    const youngB=B.crust.type[b]===CrustType.OCEAN&&B.crust.formedAt[b]>=born;
    return(mA||youngA)&&(mB||youngB)?t-born:Infinity;
}
simulate(world,{untilMyr:until,drive:w=>scene.drive(w),snapshotEveryMyr:every,keepFrames:false,onFrame:f=>{
    const contacts=[],byBoundary={},byPlate={};
    for(let w=0;w<mesh.numCells;w++){
        const id=world.owner[w];
        if(id<0||world.landClaims[w]>1)continue;
        const A=world.plates[id];
        if(!A.alive||A.isBackground||!A.crust.count)continue;
        const nb=contactAt(world,w,direction);
        if(nb<0||world.owner[nb]<0||world.owner[nb]===id)continue;
        const B=world.plates[world.owner[nb]],a=world.ownerCell[w],b=world.ownerCell[nb];
        const ca=A.crust,cb=B.crust;
        const oceanA=ca.type[a]===CrustType.OCEAN,oceanB=cb.type[b]===CrustType.OCEAN;
        const trenchA=(ca.flags[a]&CrustFlag.TRENCH)!==0,trenchB=(cb.flags[b]&CrustFlag.TRENCH)!==0;
        if(trenchB&&oceanA&&!trenchA)continue; // PULL takes priority
        if(trenchA&&oceanB&&!trenchB)continue; // SUCTION takes priority
        if(ageOfRift(A,a,B,b,world.time)<world.config.riftPushMyr)continue; // RIFT takes priority
        if(!oceanA||!oceanB)continue;
        const ageA=world.time-ca.formedAt[a],ageB=world.time-cb.formedAt[b];
        if(ca.formedAt[a]<0||cb.formedAt[b]<0||ageA>=world.config.ridgeMaxAgeMyr||ageB>=world.config.ridgeMaxAgeMyr)continue;
        const kind=labels[world.boundaryKind[w]]??'UNKNOWN';
        const x=mesh.xyz[3*w],y=mesh.xyz[3*w+1],z=mesh.xyz[3*w+2];
        const contact={worldCell:w,plate:id,otherPlate:B.id,boundary:kind,
            latDeg:+(Math.asin(z)*180/Math.PI).toFixed(2),lonDeg:+(Math.atan2(y,x)*180/Math.PI).toFixed(2),
            ageA:+ageA.toFixed(2),ageB:+ageB.toFixed(2),formedAtA:ca.formedAt[a],formedAtB:cb.formedAt[b],
            otherIsBackground:B.isBackground};
        contacts.push(contact);
        byBoundary[kind]=(byBoundary[kind]??0)+1;
        byPlate[id]=(byPlate[id]??0)+1;
    }
    const engineRidgeByPlate=f.plates.filter(p=>p.alive&&!p.isBackground&&p.cells>0).map(p=>({
        plate:p.id,ridgePushForceCells:p.dynamics?.forces?.find(f=>f.name==='ridge push')?.cells??null
    })).filter(p=>p.ridgePushForceCells>0);
    const row={timeMyr:f.time,contacts,byBoundary,byPlate,engineRidgeByPlate};
    rows.push(row);
    console.log('RIDGE '+JSON.stringify({timeMyr:row.timeMyr,contacts:contacts.length,byBoundary,byPlate,engineRidgeByPlate}));
}});
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out+'.json',JSON.stringify({seed,meshCells:mesh.numCells,until,every,rows,
    caveat:'Classification is contemporaneous (after classification and event updates); the force observer reconstructs the same gating precedence as gatherLoads for ocean contacts.'},null,2)+'\n');
console.log('Saved '+out+'.json');
