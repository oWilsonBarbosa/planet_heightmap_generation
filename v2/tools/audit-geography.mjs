// Baseline audit. Run: node v2/tools/audit-geography.mjs --cells=20000 --until=1200 --every=100
// Optional: --seeds=12345,4242,31337 --out=reports/geography-baseline
// This measures tectonic CRUST on the coarse simulation mesh, not emerged terrain.
import fs from 'node:fs';
import path from 'node:path';
import { labMesh } from './lib/check-kit.mjs';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { simulate } from '../js/tectonics/simulate.js';
import { CrustType } from '../js/tectonics/model/crust.js';

const opt = (key, value) => process.argv.find(x => x.startsWith('--'+key+'='))?.split('=').slice(1).join('=') ?? value;
const cells = Number(opt('cells', '20000')), until = Number(opt('until','1200'));
const every = Number(opt('every','100')), seeds = opt('seeds','12345,4242,31337').split(',').map(Number);
const out = opt('out','reports/geography-baseline');
const ablate = opt('ablate','none');
if (!['none','arcMaturation','marginIsles'].includes(ablate)) throw Error('Unknown --ablate option');
const dose = opt('dose','control');
const gpeStrengthArg = opt('gpe-strength', '');
const gpeAgeScaleArg = opt('gpe-age-scale', '');
const gpeStrength = gpeStrengthArg === '' ? null : Number(gpeStrengthArg);
const gpeAgeScale = gpeAgeScaleArg === '' ? null : Number(gpeAgeScaleArg);
if (gpeStrength !== null && (!Number.isFinite(gpeStrength) || gpeStrength < 0 || gpeStrength > 20)) throw Error('Invalid --gpe-strength (0..20)');
if (gpeAgeScale !== null && (!Number.isFinite(gpeAgeScale) || gpeAgeScale <= 0 || gpeAgeScale > 10000)) throw Error('Invalid --gpe-age-scale (0..10000)');
if (!['control','arcHalf','islesHalf','bothHalf'].includes(dose)) throw Error('Unknown --dose option');
if (ablate !== 'none' && dose !== 'control') throw Error('Do not combine --dose and --ablate');
if (![cells,until,every,...seeds].every(Number.isInteger) || cells < 2000 || until < 1 || every < 1 || until % every) throw Error('Invalid cells, until, every or seeds');
const mesh = labMesh(cells), n = mesh.numCells, scene = TERRAIN_SCENES.find(s => s.id === 'cycle');
if (!scene) throw Error('Cycle scene not found');
const {adjOffset,adjList,cellAreaKm2,edgeKm} = mesh;
const rows = [];

function blocks(mask) {
  const seen = new Uint8Array(n), queue = new Int32Array(n), groups = [];
  for (let w=0; w<n; w++) {
    if (!mask[w] || seen[w]) continue;
    let head=0, tail=1, edgeCount=0;
    queue[0]=w; seen[w]=1;
    while(head<tail) {
      const a=queue[head++];
      for(let k=adjOffset[a]; k<adjOffset[a+1]; k++) {
        const b=adjList[k];
        if(!mask[b]) edgeCount++;
        else if(!seen[b]) { seen[b]=1; queue[tail++]=b; }
      }
    }
    groups.push({cells:tail, edges:edgeCount});
  }
  return groups.sort((a,b)=>b.cells-a.cells);
}
function measure(f,seed) {
  const continental = new Uint8Array(n), arc = new Uint8Array(n);
  const sizes = new Int32Array(f.plates.length);
  let c=0, a=0, ocean=0, age=0, older=0, prehistory=0, gaps=0;
  let inheritedAgeSum=0, generatedAgeSum=0, inheritedOver200=0, generatedOver200=0;
  const ageBins=new Int32Array(6); // [0,20), [20,50), [50,100), [100,150), [150,200), [200,+inf)
  const oceanAges=[];
  for(let w=0;w<n;w++) {
    const id=f.owner[w]; if(id<0){gaps++;continue;}
    sizes[id]++;
    if(f.type[w]===CrustType.CONTINENT || f.type[w]===CrustType.CRATON){continental[w]=1;c++;}
    else if(f.type[w]===CrustType.ARC){arc[w]=1;a++;}
    else if(f.type[w]===CrustType.OCEAN) {
      ocean++; const years=Math.max(0,f.time-f.formedAt[w]); age+=years;
      oceanAges.push(years);
      const bin=years<20?0:years<50?1:years<100?2:years<150?3:years<200?4:5;
      ageBins[bin]++;
      if(years>200)older++;
      if(f.formedAt[w]<0) {
        prehistory++; inheritedAgeSum+=years; if(years>200) inheritedOver200++;
      } else { generatedAgeSum+=years; if(years>200)generatedOver200++; }
    }
  }
  const plateSizes = f.plates.filter(p=>p.alive && !p.isBackground).map(p=>sizes[p.id]).filter(Boolean).sort((a,b)=>b-a);
  const cb=blocks(continental), ab=blocks(arc);
  const biggest=cb[0] ?? {cells:0,edges:0};
  oceanAges.sort((a,b)=>a-b);
  const percentile=p=>oceanAges.length?oceanAges[Math.floor((oceanAges.length-1)*p)]:null;
  // Use perimeter only as a within-resolution proxy, not a physical coastline estimate.
  const perimeter=biggest.edges*edgeKm/Math.sqrt(3);
  return {
    seed, cells:n, timeMyr:f.time,
    continentalCrustPct:100*c/n, arcCrustPct:100*a/n, gapsPct:100*gaps/n,
    plateCount:plateSizes.length, platesAboveOnePct:plateSizes.filter(v=>v>=n*.01).length,
    largestPlatePct:100*(plateSizes[0]??0)/n,
    oceanMeanAgeMyr:ocean?age/ocean:null, oceanOver200Pct:ocean?100*older/ocean:null,
    prehistoryOceanPct:ocean?100*prehistory/ocean:null,
    oceanAreaMkm2:ocean*cellAreaKm2/1e6,
    inheritedOceanAreaMkm2:prehistory*cellAreaKm2/1e6,
    generatedOceanAreaMkm2:(ocean-prehistory)*cellAreaKm2/1e6,
    inheritedOceanMeanAgeMyr:prehistory?inheritedAgeSum/prehistory:null,
    generatedOceanMeanAgeMyr:(ocean-prehistory)?generatedAgeSum/(ocean-prehistory):null,
    oceanAgeP50Myr:percentile(0.5),
    oceanAgeP90Myr:percentile(0.9),
    oceanAgeP99Myr:percentile(0.99),
    inheritedOver200AreaMkm2:inheritedOver200*cellAreaKm2/1e6,
    generatedOver200AreaMkm2:generatedOver200*cellAreaKm2/1e6,
    oceanAge0to20Pct:ocean?100*ageBins[0]/ocean:null,
    oceanAge20to50Pct:ocean?100*ageBins[1]/ocean:null,
    oceanAge50to100Pct:ocean?100*ageBins[2]/ocean:null,
    oceanAge100to150Pct:ocean?100*ageBins[3]/ocean:null,
    oceanAge150to200Pct:ocean?100*ageBins[4]/ocean:null,
    oceanAge200plusPct:ocean?100*ageBins[5]/ocean:null,
    continentalBlocks:cb.length, continentalBlocksAbove1Mkm2:cb.filter(b=>b.cells*cellAreaKm2>=1e6).length,
    largestBlockMkm2:biggest.cells*cellAreaKm2/1e6,
    largestBlockSharePct:c?100*biggest.cells/c:null,
    largestBlockCompactnessProxy:perimeter>0?Math.min(1,4*Math.PI*biggest.cells*cellAreaKm2/perimeter**2):null,
    largestArcGroupMkm2:(ab[0]?.cells??0)*cellAreaKm2/1e6,
    // Cumulative engine counters: arcMaturedCells is an optional counter introduced by arc-maturation.js.
    // These are raster-cell operations, not unique crust units; interpret deltas over time.
    arcMaturedCells:f.budget?.arcMaturedCells??0,
    marginErodedCells:f.budget?.erodedCells??0,
    underthrustCells:f.budget?.underthrustCells??0,
    recycledArcCells:f.budget?.recycledCells??0,
    cycleSharePct:f.cycle?100*f.cycle.share:null, cyclePhase:f.cycle?.phase??''
  };
}
for(const seed of seeds) {
  const started=performance.now(), world=scene.build(mesh,seed);
  if (gpeStrength !== null) world.config.ridgeGpeStrength = gpeStrength;
  if (gpeAgeScale !== null) world.config.ridgeGpeAgeScaleMyr = gpeAgeScale;
  // Controlled mechanism ablation: alter parameters on this run's world only.
  // Keep the baseline path identical when ablate=none.
  if (ablate === 'arcMaturation') world.config.arcContinentKmPerMyr = 0;
  if (ablate === 'marginIsles') {
    world.config.marginIsleRatePerMyr = 0;
    world.config.marginIsleGrowKmPerMyr = 0;
    world.config.marginIsleCoastShare = 0;
  }
  // Dose-response experiment: retain mechanisms, halve only rates of the tested process.
  // Under islesHalf, both birth rate and radial growth speed are halved; the
  // coast-share ratio remains unchanged (therefore coastline growth rate halves too).
  if (dose === 'arcHalf' || dose === 'bothHalf') world.config.arcContinentKmPerMyr *= 0.5;
  if (dose === 'islesHalf' || dose === 'bothHalf') {
    world.config.marginIsleRatePerMyr *= 0.5;
    world.config.marginIsleGrowKmPerMyr *= 0.5;
  }
  const firstIndex=rows.length;
  simulate(world,{untilMyr:until, drive:w=>scene.drive(w), snapshotEveryMyr:every,
    keepFrames:false, onFrame:f=>rows.push(measure(f,seed))});
  const series=rows.slice(firstIndex);
  console.log(JSON.stringify({
    seed, frames:series.length, seconds:Math.round((performance.now()-started)/1000),
    continentalCrustChangePoints:+(series.at(-1).continentalCrustPct-series[0].continentalCrustPct).toFixed(2),
    peakLargestPlatePct:+Math.max(...series.map(r=>r.largestPlatePct)).toFixed(2),
    finalOceanMeanAgeMyr:+series.at(-1).oceanMeanAgeMyr.toFixed(1)
  }));
}
fs.mkdirSync(path.dirname(out),{recursive:true});
const columns=Object.keys(rows[0]);
const csv=v=>{const s=v==null?'':String(v);return /[,"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
fs.writeFileSync(out+'.csv',columns.join(',')+'\n'+rows.map(r=>columns.map(k=>csv(r[k])).join(',')).join('\n')+'\n');
fs.writeFileSync(out+'.json',JSON.stringify({baseline:'7026cc6526fa637611d05804a4cec8eed04de017',method:'coarse tectonic crust; no terrain render',parameters:{cells,seeds,until,every,ablate,dose,gpeStrength,gpeAgeScale},rows},null,2)+'\n');
console.log('Saved '+out+'.csv and .json ('+rows.length+' frames)');
