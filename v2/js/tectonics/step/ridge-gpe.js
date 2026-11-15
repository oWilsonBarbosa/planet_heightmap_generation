// Experimental oceanic lithosphere gravitational-potential-energy traction.
// Scientific motivation: ridge push is the integral of an age/thickness-dependent
// potential-energy gradient over oceanic plate area, not a binary line-force
// triggered by two ocean cells younger than a single age cutoff.
//
// This is a dimensionless proxy, NOT a full thermal/isostatic lithosphere model.
// Physical km and km² scaling keep it comparable across simulation resolutions.
// The experiment is isolated to audit/distributed-ridge-gpe-20261114.
// Source: https://doi.org/10.1038/s41598-023-37117-w
import { CrustType } from '../model/crust.js';

/** Oceanic GPE proxy (monotone and smooth; saturates instead of growing forever). */
export function oceanGpeAge(ageMyr, scaleMyr = 80) {
    if (!(scaleMyr > 0)) throw new Error('Ocean GPE age scale must be positive');
    const age = Math.max(0, ageMyr);
    return age / (age + scaleMyr);
}

/**
 * Add distributed driving torque from the age-gradient of the oceanic lithosphere.
 *
 * Oceanic age increases from a ridge toward older lithosphere. The young ridge
 * has higher gravitational potential energy, so the driving traction is oriented
 * toward the OLDER side of the gradient of oceanGpeAge (negative physical GPE).
 * Only cells belonging to a MOBILE, live plate receive force. The passive
 * background is evaluated as crust, but never directly driven.
 *
 * The gradient is estimated on same-plate neighboring OCEAN cells, so artificial
 * boundaries between moving and passive plates do not create a line impulse.
 * Nearest-neighbor spatial derivatives are a first-order approximation: the
 * scale-invariance checks below are essential.
 *
 * load.cells[RIDGE] now counts area cells contributing, not boundary cells.
 *
 * @returns {{activeCells:number, totalAreaKm2:number}} audit counters
 */
export function addDistributedRidgeTraction(world, loads, kind = 2) {
    const {mesh, owner, ownerCell, provisional, plates, time, config} = world;
    const {xyz, adjOffset, adjList, numCells, edgeKm, cellAreaKm2} = mesh;
    const ageScale = config.ridgeGpeAgeScaleMyr ?? 80;
    const strength = config.ridgeGpeStrength ?? 1;
    if (!(strength >= 0) || !Number.isFinite(strength)) throw new Error('Invalid GPE ridge strength');
    const potential = new Float64Array(numCells), active = new Uint8Array(numCells);
    // Don't use temporary visualization-only ocean (provisional ridge axes):
    // those cells have no corresponding crust raster of their own yet.
    for(let w=0;w<numCells;w++){
        const id=owner[w];
        if(id<0 || provisional[w])continue;
        const plate=plates[id],c=ownerCell[w];
        if(!plate?.alive || plate.crust.type[c]!==CrustType.OCEAN)continue;
        active[w]=1;
        potential[w]=oceanGpeAge(time-plate.crust.formedAt[c],ageScale);
    }
    let nActive=0;
    // 100 km normalizes the proxy gradient to the existing force engine's
    // per-100-km convention. Area is in 10^4 km², as for mantle flow loads.
    const strengthPerCell=(config.ridgePush * strength) * (cellAreaKm2 / 1e4) * 100;
    if(!(strengthPerCell>0))return {activeCells:0,totalAreaKm2:0};
    for(let w=0;w<numCells;w++){
        if(!active[w])continue;
        const id=owner[w],plate=plates[id];
        if(plate.isBackground)continue;
        const load=loads.get(id);
        if(!load)continue;
        const r0=xyz[3*w],r1=xyz[3*w+1],r2=xyz[3*w+2];
        let gx=0,gy=0,gz=0,kCount=0;
        const ownPot=potential[w];
        for(let k=adjOffset[w];k<adjOffset[w+1];k++){
            const v=adjList[k];
            if(!active[v] || owner[v]!==id)continue;
            const d=potential[v]-ownPot;
            const dx=xyz[3*v]-r0,dy=xyz[3*v+1]-r1,dz=xyz[3*v+2]-r2;
            const radial=dx*r0+dy*r1+dz*r2;
            const tx=dx-radial*r0,ty=dy-radial*r1,tz=dz-radial*r2;
            const norm=Math.hypot(tx,ty,tz);
            if(norm<1e-12)continue;
            gx+=d*tx/norm;gy+=d*ty/norm;gz+=d*tz/norm;
            kCount++;
        }
        // Two contacts cannot robustly estimate a 2D slope on a sphere.
        if(kCount<3)continue;
        const gradFactor=2/(kCount*edgeKm);
        const fx=gx*gradFactor*strengthPerCell;
        const fy=gy*gradFactor*strengthPerCell;
        const fz=gz*gradFactor*strengthPerCell;
        if(Math.abs(fx)+Math.abs(fy)+Math.abs(fz)<1e-12)continue;
        const ax=r1*fz-r2*fy,ay=r2*fx-r0*fz,az=r0*fy-r1*fx;
        load.torque[0]+=ax;load.torque[1]+=ay;load.torque[2]+=az;
        const by=load.byKind[kind],vectors=load.forceByKind[kind];
        by[0]+=ax;by[1]+=ay;by[2]+=az;
        vectors[0]+=fx;vectors[1]+=fy;vectors[2]+=fz;
        load.torqueMagnitudeSum+=Math.hypot(ax,ay,az);
        load.cells[kind]++;
        nActive++;
    }
    return {activeCells:nActive,totalAreaKm2:nActive*cellAreaKm2};
}
