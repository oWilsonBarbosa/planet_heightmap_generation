// Reconstruction: build the world-frame view of "now" from plate-frame crust rasters, READ-ONLY.
// It never changes crust; it only reports what plate motion has done:
//   0 claims  → a gap has opened (divergence)        ≥ 2 claims → plates overlap (convergence)
// step/resolve.js is the version that settles those. This one is what Phase 1 uses, and what any
// viewer of a prescribed, closed-form motion can call at an arbitrary time.
//
// Output (on world): owner / ownerCell = the visible claimant (land rides over ocean, otherwise the
// first claimant), claimCount = number of claimants, landClaims = how many of them are continental.

import { CrustType } from '../model/crust.js';
import { forEachClaim, clearWorldView } from './gather.js';

export function reconstruct(world) {
    const { owner, ownerCell, claimCount, landClaims } = world;
    clearWorldView(world);
    forEachClaim(world, (w, plate, cell) => {
        const land = plate.crust.type[cell] !== CrustType.OCEAN;
        if (claimCount[w] === 0 || (land && landClaims[w] === 0)) { owner[w] = plate.id; ownerCell[w] = cell; }
        if (claimCount[w] < 255) claimCount[w]++;
        if (land && landClaims[w] < 255) landClaims[w]++;
    });
}
