// Flat-slab age-decision audit: non-invasive observation of a prescribed Laramide history.
// Run identical command on base and candidate engines. Example:
// node v2/tools/audit-slab-kinematics.mjs --cells=40000 --out=reports/slab-40k
import fs from 'node:fs';
import path from 'node:path';
import { labMesh } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { MARGIN_SCENES } from '../js/tectonics/scenarios/margin-scenes.js';
import { BoundaryKind, EventKind } from '../js/tectonics/model/world.js';
import { CrustType, OrogenyType } from '../js/tectonics/model/crust.js';
import { contactAt } from '../js/tectonics/step/contact.js';
import { CM_PER_YR_TO_RAD_PER_MYR } from '../js/tectonics/config.js';

const arg=(key,def)=>process.argv.find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3)??def;
const cells=Number(arg('cells','40000')),seed=Number(arg('seed','12345')),until=Number(arg('until','50')),every=Number(arg('every','2'));
const out=arg('out','reports/flat-slab-'+cells);
if(![cells,seed,until,every].every(Number.isInteger)||cells<2000||until<1||every<1||until%every)throw Error('Invalid CLI options');
const scene=MARGIN_SCENES.find(s=>s.id==='laramide');
const mesh=labMesh(cells),world=scene.build(mesh,seed),laur=world.plates.find(p=>p.name==='Laurentia');
if(!laur)throw Error('Laurentia missing from Laramide scene');
const rows=[],changes=[],normal=[0,0,0,0],xyz=mesh.xyz;
let seenEvents=0;
simulate(world,{untilMyr:until,drive:w=>scene.drive(w),snapshotEveryMyr:every,keepFrames:false,
  onFrame:f=>{
    const ages=[],weighted=[],qualifies=[];
    let overrides=0,laramideCells=0,affectedKm2=0;
    for(let w=0;w<mesh.numCells;w++){
      if(f.owner[w]===laur.id && f.oroType[w]===OrogenyType.LARAMIDE)laramideCells++;
      if(f.owner[w]!==laur.id || f.boundary[w]!==BoundaryKind.OVERRIDING || f.provisional[w])continue;
      const other=contactAt(world,w,normal);if(other<0)continue;
      const p=world.plates[world.owner[other]];if(!p)continue;
      const c=world.ownerCell[other];if(p.crust.type[c]!==CrustType.OCEAN)continue;
      const age=world.time-p.crust.formedAt[c];
      const x=xyz[3*w],y=xyz[3*w+1],z=xyz[3*w+2],omega=laur.omega;
      const advance=((omega[1]*z-omega[2]*y)*normal[0]+(omega[2]*x-omega[0]*z)*normal[1]+(omega[0]*y-omega[1]*x)*normal[2])/CM_PER_YR_TO_RAD_PER_MYR;
      overrides++; ages.push(age);weighted.push(advance);
      if(age<world.config.flatSlabMaxAgeMyr && advance>world.config.flatSlabAdvanceCmYr)qualifies.push(age);
    }
    ages.sort((a,b)=>a-b);
    const median=ages.length?ages[Math.floor(ages.length/2)]:null;
    const newEvents=world.events.slice(seenEvents).filter(e=>e.kind===EventKind.SLAB_FLAT||e.kind===EventKind.SLAB_STEEP);
    seenEvents=world.events.length;
    changes.push(...newEvents.map(e=>({timeMyr:e.time,kind:e.kind,plate:e.data.plate})));
    rows.push({timeMyr:f.time,flatSlabState:laur.flatSlab?1:0,flatSlabKm:laur.flatSlabKm??0,
      laurTrenchOceanContacts:overrides,ageMinMyr:ages.length?ages[0]:null,ageP50Myr:median,
      ageMaxMyr:ages.length?ages.at(-1):null,qualifyingFraction:overrides?qualifies.length/overrides:null,
      advanceMeanCmYr:weighted.length?weighted.reduce((a,b)=>a+b,0)/weighted.length:null,
      laramideAreaMkm2:laramideCells*mesh.cellAreaKm2/1e6});
  }
});
fs.mkdirSync(path.dirname(out),{recursive:true});
const d={seed,requestedCells:cells,cells:mesh.numCells,until,every,
 note:'Contact qualification is an observable world-frame proxy, not exactly the fed-trench-cell denominator in classifyBoundaries.',changes,rows};
fs.writeFileSync(out+'.json',JSON.stringify(d,null,2)+'\n');
console.log('events '+JSON.stringify(changes));
console.log('final '+JSON.stringify(rows.at(-1)));
