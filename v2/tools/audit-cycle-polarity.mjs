// Cycle divergence: world-frame subduction polarities, plate motion and event timing.
// Read-only instrument. Run the same file on baseline and candidate engines.
// Example: node v2/tools/audit-cycle-polarity.mjs --seed=777 --cells=20000 --until=120 --every=2 --out=reports/polarity
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { labMesh } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { CrustType } from '../js/tectonics/model/crust.js';
import { BoundaryKind } from '../js/tectonics/model/world.js';
import { contactAt } from '../js/tectonics/step/contact.js';

const opt=(key,def)=>process.argv.find(v=>v.startsWith('--'+key+'='))?.slice(key.length+3)??def;
const seed=Number(opt('seed','777')),cells=Number(opt('cells','20000')),until=Number(opt('until','120')),every=Number(opt('every','2'));
const out=opt('out','reports/polarity-'+cells+'-'+seed);
if(![seed,cells,until,every].every(Number.isInteger)||cells<2000||until<2||every<1||until%every!==0)throw Error('Invalid arguments');
const mesh=labMesh(cells),scene=TERRAIN_SCENES.find(x=>x.id==='cycle');
if(!scene)throw Error('cycle scene missing');
const world=scene.build(mesh,seed),rows=[],normal=[0,0,0,0];
const hash=a=>createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex').slice(0,20);
let seenEvents=0;

simulate(world,{
    untilMyr:until,drive:w=>scene.drive(w),snapshotEveryMyr:every,keepFrames:false,
    onFrame:f=>{
        const counts={ridge:0,transform:0,subducting:0,overriding:0,collision:0,none:0};
        const oceanVotes=new Map(),overrides=new Map(),slabAges=new Map();
        let active=0,backgroundOcean=0,oldOcean=0;
        for(let w=0;w<mesh.numCells;w++){
            if(f.owner[w]<0)continue;
            const kind=f.boundary[w];
            if(kind===BoundaryKind.RIDGE)counts.ridge++;
            else if(kind===BoundaryKind.TRANSFORM)counts.transform++;
            else if(kind===BoundaryKind.SUBDUCTING)counts.subducting++;
            else if(kind===BoundaryKind.OVERRIDING)counts.overriding++;
            else if(kind===BoundaryKind.COLLISION)counts.collision++;
            else counts.none++;
            if(f.type[w]===CrustType.OCEAN && f.formedAt[w]<0)oldOcean++;
            if(f.type[w]===CrustType.OCEAN && f.plates[f.owner[w]]?.isBackground)backgroundOcean++;
            const vote=world.oceanOverrider[w];
            if(vote>=0){
                const other=contactAt(world,w,normal);
                if(other>=0 && f.owner[other]>=0 && f.owner[other]!==f.owner[w] &&
                    f.type[w]===CrustType.OCEAN && f.type[other]===CrustType.OCEAN){
                    const lo=Math.min(f.owner[w],f.owner[other]),hi=Math.max(f.owner[w],f.owner[other]);
                    const k=lo+':'+hi;
                    let v=oceanVotes.get(k);
                    if(!v){v={pair:k,lowerWins:0,upperWins:0,total:0};oceanVotes.set(k,v);}
                    v.total++;
                    if(vote===lo)v.lowerWins++;else if(vote===hi)v.upperWins++;
                }
            }
            if(kind!==BoundaryKind.OVERRIDING)continue;
            const other=contactAt(world,w,normal);
            if(other<0 || f.owner[other]<0 || f.owner[other]===f.owner[w])continue;
            const k=f.owner[w]+'<'+f.owner[other];
            overrides.set(k,(overrides.get(k)??0)+1);
            if(f.type[other]===CrustType.OCEAN){
                const old=slabAges.get(k)??{sum:0,cells:0};
                old.sum+=Math.max(0,f.time-f.formedAt[other]);old.cells++;slabAges.set(k,old);
            }
        }
        const pairs=[...oceanVotes.values()].sort((a,b)=>a.pair.localeCompare(b.pair));
        const oriented=[...overrides].map(([direction,count])=>({direction,count,meanSubductingOceanAgeMyr:slabAges.has(direction)?slabAges.get(direction).sum/slabAges.get(direction).cells:null})).sort((a,b)=>a.direction.localeCompare(b.direction));
        const motions=f.plates.filter(p=>p.alive&&!p.isBackground&&p.cells>0).map(p=>({
            id:p.id,name:p.name,cells:p.cells,landCells:p.landCells,
            omega:p.omega.map(x=>Number(x.toPrecision(12))),
            speedCmYr:Number(p.speedCmYr.toPrecision(12))
        })).sort((a,b)=>a.id-b.id);
        const events=world.events.slice(seenEvents).map(e=>({timeMyr:e.time,kind:e.kind,data:e.data}));
        seenEvents=world.events.length;
        const row={timeMyr:f.time,
            ownerHash:hash(f.owner),crustTypeHash:hash(f.type),ageHash:hash(f.formedAt),
            boundaryHash:hash(f.boundary),polarityHash:hash(world.oceanOverrider),
            activePlates:motions.length,plateMotionDigest:createHash('sha256').update(JSON.stringify(motions)).digest('hex').slice(0,20),
            inheritedOceanMkm2:oldOcean*mesh.cellAreaKm2/1e6,
            passiveOceanMkm2:backgroundOcean*mesh.cellAreaKm2/1e6,
            counts,polarityVotes:pairs,overridingPairs:oriented,plates:motions,events};
        rows.push(row);
        console.log(JSON.stringify({timeMyr:f.time,activePlates:row.activePlates,oldOceanMkm2:+row.inheritedOceanMkm2.toFixed(2),
            polarityVotes:pairs.length,overridingPairs:oriented.length,newEvents:events.length}));
    }
});
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out+'.json',JSON.stringify({seed,meshCells:mesh.numCells,until,every,
    note:'Observational fields: ocean polarityVotes sample ocean-on-ocean segment votes; overridingPairs count exposed overriding boundary cells, not continuous trench length.',rows},null,2)+'\n');
console.log('Saved '+out+'.json: '+rows.length+' snapshots');
