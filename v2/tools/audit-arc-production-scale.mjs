// Controlled island-arc production test: identical geodynamic scene and prescribed
// 3.4 cm/year trench advance at multiple physical mesh resolutions.
// Non-invasive observer; NO_RIFTS and forcing match the island-arc check in check-scale.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { labMesh } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { EVENT_SCENES } from '../js/tectonics/scenarios/event-scenes.js';
import { omegaFor, heading } from '../js/tectonics/scenarios/hotspot-scenes.js';
import { NO_RIFTS } from '../js/app/phases/phase5b-arcs.js';
import { CrustType } from '../js/tectonics/model/crust.js';

const opt=(key,def)=>process.argv.find(x=>x.startsWith('--'+key+'='))?.slice(key.length+3)??def;
const cells=Number(opt('cells','40000')),until=Number(opt('until','110')),every=Number(opt('every','10'));
const out=opt('out','reports/controlled-arc-'+cells);
if(![cells,until,every].every(Number.isInteger)||cells<2000||until<1||every<1||until%every)throw Error('Bad arguments');
const mesh=labMesh(cells),scene=EVENT_SCENES.find(x=>x.id==='wings');
if(!scene)throw Error('Wings scene unavailable');
const world=scene.build(mesh,12345);Object.assign(world.config,NO_RIFTS);
const solo=world.plates.find(p=>p.name==='Solo');
if(!solo)throw Error('Solo plate unavailable');
solo.refreshExtent(mesh.xyz);
const P=solo.toWorld(solo.capCenter[0],solo.capCenter[1],solo.capCenter[2],[0,0,0]);
const omega=omegaFor(P,heading(P,-90),3.4);
const rows=[];
simulate(world,{untilMyr:until,drive:()=>{solo.omega=omega.slice();},
    snapshotEveryMyr:every,keepFrames:false,onFrame:f=>{
    let arc=0,continental=0,trench=0;
    for(let i=0;i<mesh.numCells;i++){
        if(f.owner[i]<0)continue;
        if(f.type[i]===CrustType.ARC)arc++;
        else if(f.type[i]===CrustType.CONTINENT||f.type[i]===CrustType.CRATON)continental++;
        if(f.trench[i]===1)trench++;
    }
    const r={timeMyr:f.time,cells:mesh.numCells,edgeKm:mesh.edgeKm,
        arcAreaMkm2:arc*mesh.cellAreaKm2/1e6,continentalAreaMkm2:continental*mesh.cellAreaKm2/1e6,
        activeTrenchCells:trench,
        islandArcBornCellOps:f.budget?.arcBuiltCells??0,
        nonOverridingWidenedCellOps:f.budget?.arcWidenedAtNonOverridingCells??0,
        arcMaturedCellOps:f.budget?.arcMaturedCells??0};
    rows.push(r);console.log('CONTROL_ARC '+JSON.stringify(r));
}});
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out+'.json',JSON.stringify({seed:12345,cells:mesh.numCells,until,every,config:{NO_RIFTS:true,soloHeadingDeg:-90,soloSpeedCmYr:3.4},rows,
notes:['This is a prescribed-kinematics wings scene; physical coast/trench geometry is nominally the same in km across resolutions.',
'ARC cells count as crust, not necessarily emergent land. Activity classification is sampled at force-solver step, not temporal continuum.']},null,2)+'\n');
const keys=Object.keys(rows[0]);
fs.writeFileSync(out+'.csv',keys.join(',')+'\n'+rows.map(r=>keys.map(k=>r[k]).join(',')).join('\n')+'\n');
