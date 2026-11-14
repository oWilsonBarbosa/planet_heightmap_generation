// Paired-history diagnostic. Copy this unmodified script into both baseline and candidate
// checkouts; use the exact same scene, seed, mesh and snapshots. No engine writes.
// Example: node v2/tools/audit-history-divergence.mjs --scene=laramide --cells=40000 --until=50 --every=2
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { labMesh } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { MARGIN_SCENES } from '../js/tectonics/scenarios/margin-scenes.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { CrustType, OrogenyType } from '../js/tectonics/model/crust.js';

const arg=(name,def)=>process.argv.find(s=>s.startsWith('--'+name+'='))?.slice(name.length+3)??def;
const sceneId=arg('scene','laramide'),seed=Number(arg('seed','12345')),cells=Number(arg('cells','40000'));
const until=Number(arg('until',sceneId==='cycle'?'600':'50')),every=Number(arg('every',sceneId==='cycle'?'10':'2'));
const out=arg('out','reports/divergence-'+sceneId+'-'+cells+'-'+seed);
if (![seed,cells,until,every].every(Number.isInteger) || cells<2000 || until<=0 || every<=0 || until%every) throw Error('Invalid CLI arguments');
const scene=[...MARGIN_SCENES,...TERRAIN_SCENES].find(s=>s.id===sceneId);
if(!scene)throw Error('Unknown scene');
const mesh=labMesh(cells),world=scene.build(mesh,seed),rows=[];
const hash=arr=>createHash('sha256').update(Buffer.from(arr.buffer,arr.byteOffset,arr.byteLength)).digest('hex').slice(0,16);
simulate(world,{untilMyr:until,drive:w=>scene.drive(w),snapshotEveryMyr:every,keepFrames:false,
  onFrame:frame=>{
    let ocean=0,old=0,continent=0,laramide=0;
    for(let w=0;w<frame.owner.length;w++){
      if(frame.owner[w]<0)continue;
      if(frame.type[w]===CrustType.OCEAN){ocean++;if(frame.formedAt[w]<0)old++;}
      if(frame.type[w]===CrustType.CONTINENT||frame.type[w]===CrustType.CRATON)continent++;
      if(frame.oroType[w]===OrogenyType.LARAMIDE)laramide++;
    }
    const area=mesh.cellAreaKm2/1e6;
    rows.push({
      timeMyr:frame.time,
      ownerHash:hash(frame.owner),
      typeHash:hash(frame.type),
      formationHash:hash(frame.formedAt),
      orogenyHash:hash(frame.oroType),
      visibleInheritedOceanMkm2:old*area,
      visibleOceanMkm2:ocean*area,
      continentalMkm2:continent*area,
      laramideMkm2:laramide*area,
      activePlates:frame.plates.filter(p=>p.alive && !p.isBackground && p.cells>0).length,
      createdCells:frame.budget?.created??0,
      consumedCells:frame.budget?.consumed??0,
      cycleLargestPct:frame.cycle?.share==null?null:frame.cycle.share*100,
    });
  }});
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out+'.json',JSON.stringify({scene:sceneId,seed,cells:mesh.numCells,until,every,rows},null,2)+'\n');
console.log('Saved '+out+'.json: '+rows.length+' frames; final '+JSON.stringify(rows.at(-1)));
