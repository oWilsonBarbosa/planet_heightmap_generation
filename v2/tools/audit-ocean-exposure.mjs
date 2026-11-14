// Trace old oceanic crust in underlying plate rasters versus the visible world view.
// No mutation of tectonic engine code. Uses a streamed history: constant memory in time.
// Example: node v2/tools/audit-ocean-exposure.mjs --cells=20000 --seed=12345 --dose=control --every=50
import fs from 'node:fs';
import path from 'node:path';
import { labMesh } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { CrustType } from '../js/tectonics/model/crust.js';

const opt=(key,defaultValue)=>process.argv.find(x=>x.startsWith('--'+key+'='))?.slice(key.length+3)??defaultValue;
const seed=Number(opt('seed','12345'));
const cells=Number(opt('cells','20000'));
const until=Number(opt('until','1200'));
const every=Number(opt('every','50'));
const dose=opt('dose','control');
const out=opt('out',`reports/ocean-exposure-${cells}-${seed}-${dose}`);
if (![seed,cells,until,every].every(Number.isInteger) || cells<2000 || until<1 || every<1 || until%every) throw Error('Invalid numeric CLI options');
if (!['control','bothHalf'].includes(dose)) throw Error('Expected --dose=control or bothHalf');
const scene=TERRAIN_SCENES.find(s=>s.id==='cycle');
if(!scene)throw Error('Cycle scene missing');
const mesh=labMesh(cells),n=mesh.numCells,area=mesh.cellAreaKm2/1e6,rows=[];
const world=scene.build(mesh,seed);
if(dose==='bothHalf') {
  world.config.arcContinentKmPerMyr*=0.5;
  world.config.marginIsleRatePerMyr*=0.5;
  world.config.marginIsleGrowKmPerMyr*=0.5;
}
let oldEventCount=0,previousRow=null;
simulate(world,{
  untilMyr:until,drive:w=>scene.drive(w),snapshotEveryMyr:every,keepFrames:false,
  onFrame:f=>{
    const rasterByPlate=[],visibleByPlate=new Int32Array(world.plates.length);
    let rasterOld=0,rasterOldBackground=0,visibleOld=0,visibleOldBackground=0,ocean=0,visibleProvisionalOld=0;
    for(const p of world.plates){
      if(!p.alive || !p.crust.count)continue;
      const k=p.crust; let old=0;
      for(let c=0;c<n;c++)if(k.mask[c] && k.type[c]===CrustType.OCEAN && k.formedAt[c]<0)old++;
      rasterOld+=old;
      if(p.isBackground)rasterOldBackground+=old;
      rasterByPlate.push({id:p.id,name:p.name,background:p.isBackground,oldRasterCells:old});
    }
    for(let w=0;w<n;w++){
      if(f.owner[w]<0 || f.type[w]!==CrustType.OCEAN) continue;
      ocean++;
      if(f.formedAt[w]>=0)continue;
      visibleOld++;
      visibleByPlate[f.owner[w]]++;
      if(f.plates[f.owner[w]]?.isBackground)visibleOldBackground++;
      if(f.provisional[w])visibleProvisionalOld++;
    }
    const topVisible=[...visibleByPlate].map((count,id)=>({id,name:f.plates[id]?.name,background:f.plates[id]?.isBackground,oldVisibleMkm2:count*area})).filter(p=>p.oldVisibleMkm2>0).sort((a,b)=>b.oldVisibleMkm2-a.oldVisibleMkm2).slice(0,5);
    const topRaster=rasterByPlate.sort((a,b)=>b.oldRasterCells-a.oldRasterCells).slice(0,5).map(p=>({...p,oldRasterMkm2:p.oldRasterCells*area}));
    const newEvents=f.events.slice(oldEventCount);
    oldEventCount=f.events.length;
    const kinds={};for(const e of newEvents)kinds[e.kind]=(kinds[e.kind]??0)+1;
    const row={
      seed,cells:n,dose,timeMyr:f.time,
      visibleOldOceanMkm2:visibleOld*area,
      visibleOldBackgroundMkm2:visibleOldBackground*area,
      visibleOldMobilePlatesMkm2:(visibleOld-visibleOldBackground)*area,
      oldOceanInAliveRastersMkm2:rasterOld*area,
      oldOceanInBackgroundRasterMkm2:rasterOldBackground*area,
      oldOceanInMobileRastersMkm2:(rasterOld-rasterOldBackground)*area,
      visibleOldProvisionalMkm2:visibleProvisionalOld*area,
      totalVisibleOceanMkm2:ocean*area,
      oldVisibleFractionOfOceanPct:ocean?100*visibleOld/ocean:null,
      oldVisibleChangeMkm2:previousRow?(visibleOld-previousRow.visibleOldOceanMkm2/area)*area:0,
      oldRasterChangeMkm2:previousRow?(rasterOld-previousRow.oldOceanInAliveRastersMkm2/area)*area:0,
      bornOceanCells:f.budget?.created??0,consumedOceanCells:f.budget?.consumed??0,
      eventsNew:newEvents.length,
      eventsByKind:JSON.stringify(kinds),
      topOldVisiblePlates:JSON.stringify(topVisible),
      topOldRasterPlates:JSON.stringify(topRaster)
    };
    rows.push(row);previousRow=row;
    console.log(JSON.stringify({timeMyr:row.timeMyr,visibleOldMkm2:+row.visibleOldOceanMkm2.toFixed(2),rasterOldMkm2:+row.oldOceanInAliveRastersMkm2.toFixed(2),backgroundVisibleMkm2:+row.visibleOldBackgroundMkm2.toFixed(2),oldVisibleChangeMkm2:+row.oldVisibleChangeMkm2.toFixed(2)}));
  }
});
fs.mkdirSync(path.dirname(out),{recursive:true});
const cols=Object.keys(rows[0]);
const csv=value=>{const s=value==null?'':String(value);return /[,"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
fs.writeFileSync(out+'.csv',cols.join(',')+'\n'+rows.map(r=>cols.map(c=>csv(r[c])).join(',')).join('\n')+'\n');
fs.writeFileSync(out+'.json',JSON.stringify({baseline:'7026cc6526fa637611d05804a4cec8eed04de017',seed,cells:n,dose,every,until,note:'Raster counts across moving plates are not unique global areas; overlapping rasters may represent the same region. All areas use a uniform simulation-cell approximation.',rows},null,2)+'\n');
console.log('Saved '+out+'.csv/.json');
