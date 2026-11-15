// Diagnostic cartography for excessive connected ARC crust in a seeded tectonic cycle.
// It draws actual simulation-mesh cells, not fictional/coastline-art reconstruction.
// Example: node v2/tools/audit-arc-clusters.mjs --seed=4242 --cells=20000 --strength=2.0
import fs from 'node:fs';
import path from 'node:path';
import { labMesh } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { CrustType, CrustFlag } from '../js/tectonics/model/crust.js';

const arg=(k,defaultValue)=>process.argv.find(v=>v.startsWith('--'+k+'='))?.slice(k.length+3)??defaultValue;
const seed=Number(arg('seed','4242')),cells=Number(arg('cells','20000'));
const strength=Number(arg('strength','1')),every=Number(arg('every','100')),until=Number(arg('until','1200'));
const targets=arg('targets','900,1000,1100,1200').split(',').map(Number);
const out=arg('out','reports/arc-clusters-'+cells+'-'+seed+'-'+strength);
if(![seed,cells,every,until].every(Number.isInteger)||cells<2000||every<1||until<1||until%every||!Number.isFinite(strength)||strength<0||targets.some(t=>!Number.isInteger(t)||t<0||t>until||t%every))throw Error('Invalid arguments');
const mesh=labMesh(cells),n=mesh.numCells,areaMkm2=mesh.cellAreaKm2/1e6;
const {adjOffset:off,adjList:adj,xyz}=mesh;
const scene=TERRAIN_SCENES.find(s=>s.id==='cycle');if(!scene)throw Error('Cycle scene absent');
const world=scene.build(mesh,seed);
world.config.ridgeGpeStrength=strength;
const results=[],selected=new Set(targets);

function connected(mask) {
    const labels=new Int32Array(n).fill(-1),queue=new Int32Array(n),groups=[];
    for(let w=0;w<n;w++){
        if(!mask[w]||labels[w]>=0)continue;
        const id=groups.length;let first=0,last=1,edges=0;
        let latMin=90,latMax=-90,vx=0,vy=0,vz=0;
        queue[0]=w;labels[w]=id;
        while(first<last){
            const u=queue[first++],x=xyz[3*u],y=xyz[3*u+1],z=xyz[3*u+2];
            const lat=Math.asin(Math.max(-1,Math.min(1,z)))*180/Math.PI;
            latMin=Math.min(latMin,lat);latMax=Math.max(latMax,lat);
            vx+=x;vy+=y;vz+=z;
            for(let k=off[u];k<off[u+1];k++){
                const v=adj[k];
                if(!mask[v]){edges++;continue;}
                if(labels[v]<0){labels[v]=id;queue[last++]=v;}
            }
        }
        const denom=Math.hypot(vx,vy,vz),centroid=denom>0?[Math.atan2(vy,vx)*180/Math.PI,Math.asin(vz/denom)*180/Math.PI]:null;
        groups.push({id,cells:last,areaMkm2:last*areaMkm2,edgeCount:edges,latitudeMin:latMin,latitudeMax:latMax,centroidLonLatDeg:centroid});
    }
    return {groups:groups.sort((a,b)=>b.cells-a.cells),labels};
}
function continentDistance(mask) {
    const distance=new Int32Array(n).fill(-1),queue=new Int32Array(n);
    let first=0,last=0;
    for(let w=0;w<n;w++)if(mask[w]){distance[w]=0;queue[last++]=w;}
    while(first<last){
        const u=queue[first++],next=distance[u]+1;
        for(let k=off[u];k<off[u+1];k++){
            const v=adj[k];
            if(distance[v]<0){distance[v]=next;queue[last++]=v;}
        }
    }
    return distance;
}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function makeSvg(maskArc,maskCont,labels,bigId,frameTime,info){
    const width=1600,height=945,left=50,top=110,W=1500,H=750;
    const radius=Math.sqrt(W*H/n/Math.PI)*1.1;
    let svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'">\n';
    svg+='<rect width="100%" height="100%" fill="#f8f7f3"/><text x="50" y="48" font-family="DejaVu Sans,Arial" font-size="28" fill="#273847" font-weight="bold">Orogen V2 | Crosta de arco: semente '+seed+', GPE '+strength+'</text>';
    svg+='<text x="50" y="81" font-family="DejaVu Sans,Arial" font-size="19" fill="#46535d">Tempo: '+frameTime+' Ma | resolução tectônica: '+n.toLocaleString('en-US')+' células | maior grupo ARC: '+info.largestArcGroupMkm2.toFixed(2)+' milhões km²</text>';
    svg+='<rect x="'+left+'" y="'+top+'" width="'+W+'" height="'+H+'" fill="#28475b" stroke="#1e3647"/>';
    for(let lon=-150;lon<=150;lon+=30){
        const x=left+(lon+180)*W/360;
        svg+='<line x1="'+x.toFixed(1)+'" y1="'+top+'" x2="'+x.toFixed(1)+'" y2="'+(top+H)+'" stroke="#8ba2a8" stroke-opacity="0.32"/>';
    }
    for(let lat=-60;lat<=60;lat+=30){
        const y=top+(90-lat)*H/180;
        svg+='<line x1="'+left+'" y1="'+y.toFixed(1)+'" x2="'+(left+W)+'" y2="'+y.toFixed(1)+'" stroke="#8ba2a8" stroke-opacity="0.32"/>';
    }
    const plot=(w,color)=>{
        const x=xyz[3*w],y=xyz[3*w+1],z=xyz[3*w+2];
        const lon=Math.atan2(y,x)*180/Math.PI,lat=Math.asin(Math.max(-1,Math.min(1,z)))*180/Math.PI;
        const px=left+(lon+180)*W/360,py=top+(90-lat)*H/180;
        return '<circle cx="'+px.toFixed(2)+'" cy="'+py.toFixed(2)+'" r="'+radius.toFixed(2)+'" fill="'+color+'"/>';
    };
    for(let w=0;w<n;w++)if(maskCont[w])svg+=plot(w,'#dac9ad');
    for(let w=0;w<n;w++)if(maskArc[w]&&labels[w]!==bigId)svg+=plot(w,'#e9b354');
    for(let w=0;w<n;w++)if(maskArc[w]&&labels[w]===bigId)svg+=plot(w,'#e25b4d');
    svg+='<rect x="'+left+'" y="'+top+'" width="'+W+'" height="'+H+'" fill="none" stroke="#20384a"/>';
    svg+='<text x="50" y="897" font-family="DejaVu Sans,Arial" font-size="17" fill="#46535d">BEGE: CONTINENT/CRATON  •  AMARELO: outros arcos  •  VERMELHO: maior componente conectado ARC  •  AZUL: oceano</text>';
    svg+='<text x="50" y="922" font-family="DejaVu Sans,Arial" font-size="13" fill="#68757e">Projeção equiretangular de centros de células; mapa diagnóstico, não litoral refinado nem ilhas necessariamente emersas.</text>';
    return svg+'</svg>\n';
}
simulate(world,{untilMyr:until,drive:w=>scene.drive(w),snapshotEveryMyr:every,keepFrames:false,onFrame:f=>{
    if(!selected.has(f.time))return;
    const arcs=new Uint8Array(n),cont=new Uint8Array(n);
    let arcCount=0;
    for(let w=0;w<n;w++){
        if(f.owner[w]<0)continue;
        if(f.type[w]===CrustType.ARC){arcs[w]=1;arcCount++;}
        if(f.type[w]===CrustType.CONTINENT||f.type[w]===CrustType.CRATON)cont[w]=1;
    }
    const {groups,labels}=connected(arcs),d=continentDistance(cont);
    const large=groups[0]??null,bigId=large?.id??-1;
    let remote=0,remoteBig=0,marginIsles=0,marginIslesBig=0;
    const largestArcOwners=new Map(),largestArcTerranes=new Map(),agesBig=[];
    for(let w=0;w<n;w++){
        if(!arcs[w])continue;
        const isMarginIsle=(f.flags[w]&CrustFlag.MARGIN_ISLE)!==0;
        if(isMarginIsle)marginIsles++;
        if(d[w]>=0 && d[w]*mesh.edgeKm>1500){
            remote++;if(labels[w]===bigId)remoteBig++;
        }
        if(labels[w]!==bigId)continue;
        if(isMarginIsle)marginIslesBig++;
        largestArcOwners.set(f.owner[w],(largestArcOwners.get(f.owner[w])??0)+1);
        largestArcTerranes.set(f.terrane[w],(largestArcTerranes.get(f.terrane[w])??0)+1);
        agesBig.push(Math.max(0,f.time-f.formedAt[w]));
    }
    agesBig.sort((a,b)=>a-b);
    const topByCells=(m)=>[...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([id,cells])=>({id,cells,areaMkm2:cells*areaMkm2}));
    const row={seed,meshCells:n,strength,timeMyr:f.time,arcCrustPct:100*arcCount/n,
        arcAreaMkm2:arcCount*areaMkm2,arcComponentCount:groups.length,
        arcComponentsOver1Mkm2:groups.filter(g=>g.areaMkm2>=1).length,
        largestArcGroupMkm2:large?.areaMkm2??0,
        largestArcGroupSharePct:arcCount?100*(large?.cells??0)/arcCount:0,
        largestArcLatitudeMin:large?.latitudeMin??null,
        largestArcLatitudeMax:large?.latitudeMax??null,
        largestArcCentroidLonLatDeg:large?.centroidLonLatDeg??null,
        remoteArcAreaMkm2:remote*areaMkm2,
        remotePartOfLargestArcMkm2:remoteBig*areaMkm2,
        foreArcIsleTotalMkm2:marginIsles*areaMkm2,
        nonForeArcCrustTotalMkm2:(arcCount-marginIsles)*areaMkm2,
        foreArcIsleInLargestGroupMkm2:marginIslesBig*areaMkm2,
        nonForeArcCrustInLargestGroupMkm2:((large?.cells??0)-marginIslesBig)*areaMkm2,
        largestArcGroupAgeMedianMyr:agesBig.length?agesBig[Math.floor(agesBig.length/2)]:null,
        largestArcGroupPlateCount:largestArcOwners.size,
        topPlatesLargestArc:topByCells(largestArcOwners),
        topTerranesLargestArc:topByCells(largestArcTerranes),
        topGroups:groups.slice(0,8)};
    results.push(row);
    const file=out+'-t'+f.time+'.svg';
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,makeSvg(arcs,cont,labels,bigId,f.time,row));
    console.log('ARC_DIAGNOSTIC '+JSON.stringify({...row,topGroups:undefined,svg:file}));
}});
if(results.length!==targets.length)throw Error('Expected '+targets.length+' selected frames, observed '+results.length);
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out+'.json',JSON.stringify({baseline:'7026cc6526fa637611d05804a4cec8eed04de017',seed,cells:n,strength,targets,
note:'ARC group is type ARC crust connectivity on the coarse simulation mesh. Its area is NOT necessarily emergent land; distance-from-continent in mesh-edge steps is approximate.',rows:results},null,2)+'\n');
const cols=['seed','meshCells','strength','timeMyr','arcCrustPct','arcAreaMkm2','arcComponentCount','arcComponentsOver1Mkm2','largestArcGroupMkm2','largestArcGroupSharePct','remoteArcAreaMkm2','remotePartOfLargestArcMkm2','largestArcLatitudeMin','largestArcLatitudeMax','foreArcIsleTotalMkm2','foreArcIsleInLargestGroupMkm2','nonForeArcCrustInLargestGroupMkm2','largestArcGroupPlateCount'];
fs.writeFileSync(out+'.csv',cols.join(',')+'\n'+results.map(r=>cols.map(k=>r[k]??'').join(',')).join('\n')+'\n');
console.log('Saved '+out+'.json/.csv and '+results.length+' world-map SVGs');
