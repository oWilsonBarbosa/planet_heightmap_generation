// Orogen Evolution V2: arc survival and maturation eligibility audit.
// Read-only observer. Exactly mirrors the two decisive maturation filters:
//  1) native plate-frame ARC, age >= arcContinentAgeMyr, not MARGIN_ISLE
//  2) native adjacency to CONTINENT / CRATON (one ring at a time).
// Example: node v2/tools/audit-arc-fate.mjs --cells=20000 --seed=4242 --strength=2 \
 //   --targets=900,1000,1100,1200 --out=reports/arc-fate-4242-gpe2
import fs from 'node:fs';
import path from 'node:path';
import { labMesh } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { CrustType, CrustFlag } from '../js/tectonics/model/crust.js';

const opt=(key,def)=>process.argv.find(s=>s.startsWith('--'+key+'='))?.slice(key.length+3)??def;
const seed=Number(opt('seed','4242')),cells=Number(opt('cells','20000'));
const strength=Number(opt('strength','2')),until=Number(opt('until','1200')),every=Number(opt('every','100'));
const maturationRate=Number(opt('maturation-rate','3'));
const trenchMemoryMyr=Number(opt('trench-memory-myr','15'));
const targets=opt('targets','900,1000,1100,1200').split(',').map(Number);
const out=opt('out','reports/arc-fate-'+seed+'-'+cells+'-'+strength);
if (![seed,cells,until,every].every(Number.isInteger) || cells<2000 || until<1 || every<1 || until%every ||
  !Number.isFinite(strength)||strength<0||!Number.isFinite(maturationRate)||maturationRate<0||maturationRate>30||!Number.isFinite(trenchMemoryMyr)||trenchMemoryMyr < -1 || trenchMemoryMyr > 1000 ||targets.some(t=>!Number.isInteger(t)||t<0||t>until||t%every)) throw Error('Invalid arguments');
const scene=TERRAIN_SCENES.find(x=>x.id==='cycle');
if(!scene) throw Error('cycle scenario missing');
const mesh=labMesh(cells),N=mesh.numCells,area=mesh.cellAreaKm2/1e6;
const {adjOffset:off,adjList:adj}=mesh;
const world=scene.build(mesh,seed);
world.config.ridgeGpeStrength=strength;
world.config.arcContinentKmPerMyr=maturationRate;
world.config.arcWidenTrenchMemoryMyr=trenchMemoryMyr;
const rows=[],selected=new Set(targets);

function largestVisibleArc(frame) {
  const visited=new Uint8Array(N),q=new Int32Array(N);
  let best=[];
  for(let start=0;start<N;start++){
    if(visited[start]||frame.owner[start]<0||frame.type[start]!==CrustType.ARC)continue;
    let head=0,tail=1;q[0]=start;visited[start]=1;
    while(head<tail){
      const u=q[head++];
      for(let k=off[u];k<off[u+1];k++){
        const v=adj[k];
        if(!visited[v]&&frame.owner[v]>=0&&frame.type[v]===CrustType.ARC){visited[v]=1;q[tail++]=v;}
      }
    }
    if(tail>best.length)best=Array.from(q.subarray(0,tail));
  }
  return best;
}

function checkNativePlate(plate,time,threshold){
  const c=plate.crust,{mask,type,flags,formedAt}=c;
  const eligible=new Uint8Array(N),reached=new Int32Array(N).fill(-1);
  const q=new Int32Array(N);
  let head=0,tail=0;
  let arc=0,matureArc=0,matureNonForeArc=0,foreArc=0,continent=0,adjacentMature=0,youngArc=0;
  for(let i=0;i<N;i++){
    if(!mask[i])continue;
    const kind=type[i];
    if(kind===CrustType.CONTINENT||kind===CrustType.CRATON){
      continent++;q[tail++]=i;reached[i]=0;continue;
    }
    if(kind!==CrustType.ARC)continue;
    arc++;
    const age=time-formedAt[i],isFore=(flags[i]&CrustFlag.MARGIN_ISLE)!==0;
    if(isFore)foreArc++;
    if(age<threshold){youngArc++;continue;}
    matureArc++;
    if(!isFore){matureNonForeArc++;eligible[i]=1;}
  }
  // Mimics repeated one-ring maturation through consecutive eligible ARC cells.
  // Cells beyond young / fore-arc / ocean gaps are not reachable.
  while(head<tail){
    const u=q[head++],hop=reached[u]+1;
    for(let k=off[u];k<off[u+1];k++){
      const v=adj[k];
      if(reached[v]>=0||!eligible[v])continue;
      reached[v]=hop;q[tail++]=v;
      if(hop===1)adjacentMature++;
    }
  }
  return {plateId:plate.id,name:plate.name,continent,arc,matureArc,matureNonForeArc,
    foreArc,youngArc,reachableMature:tail-continent,adjacentMature,eligible,reach:reached};
}

simulate(world,{untilMyr:until,drive:w=>scene.drive(w),snapshotEveryMyr:every,keepFrames:false,onFrame:f=>{
  if(!selected.has(f.time))return;
  const biggest=largestVisibleArc(f);
  const allPlates=new Map();
  for(const p of world.plates){
    if(!p.alive||p.isBackground||p.crust.count===0)continue;
    allPlates.set(p.id,checkNativePlate(p,f.time,world.config.arcContinentAgeMyr));
  }
  const sum={nativeArc:0,nativeContinental:0,nativeOldArc:0,nativeMatureNonForeArc:0,nativeMatureAdjacent:0,nativeMatureReachable:0,nativeForeArc:0};
  const plateSummary=[];
  for(const p of allPlates.values()){
    sum.nativeArc+=p.arc;sum.nativeContinental+=p.continent;sum.nativeOldArc+=p.matureArc;
    sum.nativeMatureNonForeArc+=p.matureNonForeArc;
    sum.nativeMatureAdjacent+=p.adjacentMature;
    sum.nativeMatureReachable+=p.reachableMature;sum.nativeForeArc+=p.foreArc;
    plateSummary.push({plateId:p.plateId,name:p.name,continentMkm2:p.continent*area,arcMkm2:p.arc*area,
      oldArcEligibleMkm2:p.matureNonForeArc*area,
      matureArcReachableMkm2:p.reachableMature*area,
      matureArcAdjacentMkm2:p.adjacentMature*area,
      matureUnreachableMkm2:(p.matureNonForeArc-p.reachableMature)*area,
      foreArcMkm2:p.foreArc*area});
  }
  plateSummary.sort((a,b)=>b.arcMkm2-a.arcMkm2);
  const mainByPlate=new Map(),mainByNativeTerrane=new Map();
  let mainAge100=0,mainAge100Eligible=0,mainReachable=0,mainAdjacent=0,mainAgeSum=0,mainForeArc=0,mainOldOtherPlate=0;
  for(const w of biggest){
    const id=f.owner[w],p=world.plates[id],c=world.ownerCell[w],native=allPlates.get(id);
    if(!native)continue;
    const age=f.time-p.crust.formedAt[c];
    mainAgeSum+=age;
    if(age>=world.config.arcContinentAgeMyr)mainAge100++;
    if(p.crust.flags[c]&CrustFlag.MARGIN_ISLE)mainForeArc++;
    if(native.eligible[c])mainAge100Eligible++;
    if(native.reach[c]>=0 && native.eligible[c]){
      mainReachable++;if(native.reach[c]===1)mainAdjacent++;
    }
    if(age>=world.config.arcContinentAgeMyr && native.continent===0)mainOldOtherPlate++;
    mainByPlate.set(id,(mainByPlate.get(id)??0)+1);
    const key=id+':'+p.crust.terrane[c];
    mainByNativeTerrane.set(key,(mainByNativeTerrane.get(key)??0)+1);
  }
  const ordered=m=>[...m].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([key,n])=>({key,cells:n,areaMkm2:n*area}));
  let visibleArc=0,visibleContinental=0;
  for(let i=0;i<N;i++){
    if(f.owner[i]<0)continue;
    if(f.type[i]===CrustType.ARC)visibleArc++;
    if(f.type[i]===CrustType.CONTINENT||f.type[i]===CrustType.CRATON)visibleContinental++;
  }
  const row={seed,meshCells:N,gpeStrength:strength,maturationRateKmPerMyr:maturationRate,trenchMemoryMyr,timeMyr:f.time,
    visibleContinentalAreaMkm2:visibleContinental*area,
    visibleArcAreaMkm2:visibleArc*area,
    largestVisibleArcAreaMkm2:biggest.length*area,
    largestArcMeanAgeMyr:biggest.length?mainAgeSum/biggest.length:null,
    largestArcOldAge100Mkm2:mainAge100*area,
    largestArcEligibleMkm2:mainAge100Eligible*area,
    largestArcSamePlateLandReachableMkm2:mainReachable*area,
    largestArcAdjacentToSamePlateContinentMkm2:mainAdjacent*area,
    largestArcForeArcMkm2:mainForeArc*area,
    largestArcOldWithoutContinentOnNativePlateMkm2:mainOldOtherPlate*area,
    totalNativeArcMkm2:sum.nativeArc*area,
    totalNativeOldArcMkm2:sum.nativeOldArc*area,
    totalNativeMatureNonForeArcMkm2:sum.nativeMatureNonForeArc*area,
    totalNativeReachableMatureArcMkm2:sum.nativeMatureReachable*area,
    totalNativeAdjacentMatureArcMkm2:sum.nativeMatureAdjacent*area,
    totalNativeUnreachableMatureArcMkm2:(sum.nativeMatureNonForeArc-sum.nativeMatureReachable)*area,
    cumulativeArcMaturedCellOps:f.budget?.arcMaturedCells??0,
    cumulativeArcRecycledCellOps:f.budget?.recycledCells??0,
    cumulativeIslandArcBuiltCellOps:f.budget?.arcBuiltCells??0,
    cumulativeForearcBornCellOps:f.budget?.forearcBornCells??0,
    cumulativeForearcMergedCellOps:f.budget?.forearcMergedCells??0,
    cumulativeArcErodedCellOps:f.budget?.arcErodedCells??0,
    cumulativeArcSubductedCellOps:f.budget?.arcSubductedCells??0,
    cumulativeArcScrapedMovedCellOps:f.budget?.arcScrapedMovedCells??0,
    cumulativeArcScrapedAbsorbedCellOps:f.budget?.arcScrapedAbsorbedCells??0,
    cumulativeArcMergeEvents:f.budget?.arcMergeEvents??0,
    cumulativeArcMergeInputCells:f.budget?.arcMergeInputCells??0,
    cumulativeArcMergeOutputCells:f.budget?.arcMergeOutputCells??0,
    cumulativeArcMergeNetCells:f.budget?.arcMergeNetCells??0,
    cumulativeArcMergeUpperWarpDeltaCells:f.budget?.arcMergeUpperWarpDeltaCells??0,
    cumulativeArcMergeLowerOverlayDeltaCells:f.budget?.arcMergeLowerOverlayDeltaCells??0,
    cumulativeArcMergeHoleFillDeltaCells:f.budget?.arcMergeHoleFillDeltaCells??0,
    cumulativeArcMergeSeaFillDeltaCells:f.budget?.arcMergeSeaFillDeltaCells??0,
    cumulativeArcAccreteEvents:f.budget?.arcAccreteEvents??0,
    cumulativeArcAccreteTransferredCells:f.budget?.arcAccreteTransferredCells??0,
    cumulativeArcAccreteAbsorbedCells:f.budget?.arcAccreteAbsorbedCells??0,
    cumulativeArcAccreteTransferNetCells:f.budget?.arcAccreteTransferNetCells??0,
    cumulativeArcAccreteSeaFillDeltaCells:f.budget?.arcAccreteSeaFillDeltaCells??0,
    cumulativeArcWidenedAtNonOverridingCells:f.budget?.arcWidenedAtNonOverridingCells??0,
    cumulativeArcWidenedByRecentActivityCells:f.budget?.arcWidenedByRecentActivityCells??0,
    platesWithArc:plateSummary.filter(p=>p.arcMkm2>0).length,
    largestArcGroupPlateContributions:ordered(mainByPlate),
    largestArcGroupNativeTerranes:ordered(mainByNativeTerrane),
    largestNativeArcPlates:plateSummary.slice(0,12)};
  rows.push(row);
  console.log('ARC_FATE '+JSON.stringify({
    timeMyr:f.time,arcMkm2:row.visibleArcAreaMkm2,largestMkm2:row.largestVisibleArcAreaMkm2,
    largestOldMkm2:row.largestArcOldAge100Mkm2,largestReachableMkm2:row.largestArcSamePlateLandReachableMkm2,
    largestOldWithoutNativeContinentMkm2:row.largestArcOldWithoutContinentOnNativePlateMkm2,
    nativeOldUnreachableMkm2:row.totalNativeUnreachableMatureArcMkm2,
    dominantPlate:row.largestNativeArcPlates[0]}));
}});
if(rows.length!==targets.length)throw Error('Only '+rows.length+'/'+targets.length+' targets captured');
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out+'.json',JSON.stringify({
  seed,meshCells:N,strength,maturationRateKmPerMyr:maturationRate,trenchMemoryMyr,targets,ageThresholdMyr:world.config.arcContinentAgeMyr,
  notes:['Native reachability follows only ARC cells old enough and not flagged as MARGIN_ISLE, from own-plate CONTINENT/CRATON seeds.',
  'Area figures from native plate rasters can overlap in planetary/world space: do not interpret their sum as unique planet area.',
  'A visible ARC group may comprise multiple plate rasters; giant group area is a connected world-frame area.',
  'Full front propagation depends also on per-plate arcMatureKm advances and timing; reachable is potential, not guaranteed conversion.'],rows},null,2)+'\n');
const cols=['seed','meshCells','gpeStrength','maturationRateKmPerMyr','timeMyr','visibleContinentalAreaMkm2','visibleArcAreaMkm2','largestVisibleArcAreaMkm2',
'largestArcOldAge100Mkm2','largestArcEligibleMkm2','largestArcSamePlateLandReachableMkm2',
'largestArcAdjacentToSamePlateContinentMkm2','largestArcOldWithoutContinentOnNativePlateMkm2',
'totalNativeArcMkm2','totalNativeOldArcMkm2','totalNativeReachableMatureArcMkm2','totalNativeUnreachableMatureArcMkm2',
'cumulativeArcMaturedCellOps','cumulativeArcRecycledCellOps',
'cumulativeIslandArcBuiltCellOps','cumulativeForearcBornCellOps','cumulativeForearcMergedCellOps','cumulativeArcErodedCellOps','cumulativeArcSubductedCellOps','cumulativeArcScrapedMovedCellOps','cumulativeArcScrapedAbsorbedCellOps',
'cumulativeArcMergeEvents','cumulativeArcMergeInputCells','cumulativeArcMergeOutputCells','cumulativeArcMergeNetCells','cumulativeArcMergeUpperWarpDeltaCells','cumulativeArcMergeLowerOverlayDeltaCells','cumulativeArcMergeHoleFillDeltaCells','cumulativeArcMergeSeaFillDeltaCells','cumulativeArcAccreteEvents','cumulativeArcAccreteTransferredCells','cumulativeArcAccreteAbsorbedCells','cumulativeArcAccreteTransferNetCells','cumulativeArcAccreteSeaFillDeltaCells','cumulativeArcWidenedAtNonOverridingCells'];
fs.writeFileSync(out+'.csv',cols.join(',')+'\n'+rows.map(r=>cols.map(k=>r[k]??'').join(',')).join('\n')+'\n');
console.log('Saved '+out+'.json and .csv');
