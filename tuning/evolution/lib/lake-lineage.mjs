// Diagnostic comparison of lake footprints between differently resolved meshes.
// Fine-grid centres are projected into the nearest coarse-grid Voronoi cell.
// Approximate spatial overlap; not a geodesic polygon intersection.
const NAMES=['none','marine','young-glacial','ancient-tectonic','other'];
const rnd=(x,d=1)=>+x.toFixed(d),pct=(x,n)=>rnd(100*x/Math.max(n,1e-12),2);
const origin=(s,b)=>NAMES[s.lakeOrigin[b.cells[0]]]??'unknown';
const centre=(xyz,cells)=>{
    let x=0,y=0,z=0;
    for(const c of cells){x+=xyz[3*c];y+=xyz[3*c+1];z+=xyz[3*c+2];}
    if(Math.hypot(x,y,z)<1e-8){let c=cells[0];x=xyz[3*c];y=xyz[3*c+1];z=xyz[3*c+2];}
    return {lat:rnd(Math.atan2(z,Math.hypot(x,y))*180/Math.PI,4),lon:rnd(Math.atan2(y,x)*180/Math.PI,4)};
};
const ledger=()=>({projected:0,ocean:0,dry:0,lake:0,overlap:new Map});
const record=(s,b,id)=>({id,kind:b.kind,origin:origin(s,b),cells:b.cells.length,
    areaKm2:rnd(b.cells.length*s.cellKm2),centre:centre(s.mesh.xyz,b.cells),outlet:b.outlet});
function groupOrigins(s,threshold){
    const g={};
    s.bodies.forEach(b=>{const area=b.cells.length*s.cellKm2;if(area<threshold)return;
        const label=origin(s,b),v=g[label]??{bodies:0,areaKm2:0};v.bodies++;v.areaKm2+=area;g[label]=v;});
    Object.values(g).forEach(v=>v.areaKm2=rnd(v.areaKm2));return g;
}
function rows(s,other,tallies,cellKm2,T,max){
    return s.bodies.map((b,id)=>({b,id})).filter(x=>x.b.cells.length*s.cellKm2>=T)
        .sort((a,b)=>b.b.cells.length-a.b.cells.length).slice(0,max).map(({b,id})=>{
            const r=record(s,b,id),a=tallies[id],den=Math.max(1,a.projected);
            r.projectedKm2=rnd(den*cellKm2);
            r.fate=a.ocean/den>=0.5?'mostly-ocean':a.lake/den>=0.5?'mostly-lake':
                a.dry/den>=0.5?'mostly-dry':'mixed';
            r.coverage={oceanPct:pct(a.ocean,den),lakePct:pct(a.lake,den),dryPct:pct(a.dry,den)};
            r.matches=[...a.overlap.entries()].sort((x,y)=>y[1]-x[1]).slice(0,5).map(([otherId,count])=>({
                id:otherId,overlapKm2:rnd(count*cellKm2),kind:other.bodies[otherId].kind,
                origin:origin(other,other.bodies[otherId]),
                areaKm2:rnd(other.bodies[otherId].cells.length*other.cellKm2)
            }));
            return r;
        });
}
export function compareLakeSnapshots(coarse,fine,{thresholdKm2=null,limit=40}={}){
    if(!(coarse.n<fine.n))throw Error('Expected coarse.n < fine.n');
    for(const s of [coarse,fine]) if(!s.mesh?.index?.nearest||s.body?.length!==s.n||s.sea?.length!==s.n||
        s.lake?.length!==s.n||s.lakeOrigin?.length!==s.n)throw Error('Invalid lake snapshot');
    const T=thresholdKm2??4*Math.max(coarse.cellKm2,fine.cellKm2);
    const c=coarse.bodies.map(ledger), f=fine.bodies.map(ledger),xyz=fine.mesh.xyz,index=coarse.mesh.index;
    const mark=(r,kind,id)=>{r.projected++;r[kind]++;
        if(id>=0)r.overlap.set(id,(r.overlap.get(id)??0)+1);};
    for(let j=0;j<fine.n;j++){
        const i=index.nearest(xyz[3*j],xyz[3*j+1],xyz[3*j+2]);
        if(i<0||i>=coarse.n)throw Error('Nearest mesh lookup out of range');
        const a=coarse.body[i],b=fine.body[j];
        if(a>=0)mark(c[a],fine.sea[j]?'ocean':b>=0?'lake':'dry',b);
        if(b>=0)mark(f[b],coarse.sea[i]?'ocean':a>=0?'lake':'dry',a);
    }
    const byOrigin={};
    for(let id=0;id<coarse.bodies.length;id++){
        const b=coarse.bodies[id],area=b.cells.length*coarse.cellKm2;if(area<T)continue;
        const label=origin(coarse,b),v=byOrigin[label]??{count:0,areaKm2:0,nowLakeKm2:0,nowOceanKm2:0,nowDryKm2:0};
        v.count++;v.areaKm2+=area;v.nowLakeKm2+=c[id].lake*fine.cellKm2;
        v.nowOceanKm2+=c[id].ocean*fine.cellKm2;v.nowDryKm2+=c[id].dry*fine.cellKm2;byOrigin[label]=v;
    }
    Object.values(byOrigin).forEach(v=>Object.keys(v).forEach(k=>{if(k!=='count')v[k]=rnd(v[k]);}));
    return {coarseCells:coarse.n,fineCells:fine.n,thresholdKm2:rnd(T),
        method:'fine cell centres mapped to nearest coarse mesh cell; approximate footprint',
        coarseByOrigin:groupOrigins(coarse,T),fineByOrigin:groupOrigins(fine,T),
        fateByCoarseOrigin:byOrigin,
        coarseLargeBodies:coarse.bodies.filter(b=>b.cells.length*coarse.cellKm2>=T).length,
        fineLargeBodies:fine.bodies.filter(b=>b.cells.length*fine.cellKm2>=T).length,
        largestCoarse:rows(coarse,fine,c,fine.cellKm2,T,limit),
        largestFine:rows(fine,coarse,f,fine.cellKm2,T,limit)};
}
