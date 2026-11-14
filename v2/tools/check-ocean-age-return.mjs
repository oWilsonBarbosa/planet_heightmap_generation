// Regression: moving a detached ocean fragment onto the passive background must not
// change the formation timestamp. Run: node v2/tools/check-ocean-age-return.mjs
import assert from 'node:assert/strict';
import { labMesh } from './lib/check-kit.mjs';
import { TectonicWorld } from '../js/tectonics/model/world.js';
import { CrustType } from '../js/tectonics/model/crust.js';
import { giveToBackground } from '../js/tectonics/ops/tidy-plates.js';

const mesh = labMesh(2000), cell = 123;
for (const formedAt of [-80, -1, 0, 250, 900]) {
    const world = new TectonicWorld(mesh, 12345);
    world.time = 1000;
    const background = world.addPlate('Passive ocean');
    background.isBackground = true;
    const plate = world.addPlate('Detached ocean');
    plate.crust.create(cell, CrustType.OCEAN, formedAt);
    plate.refreshExtent(mesh.xyz);
    world.owner[cell] = plate.id;
    world.ownerCell[cell] = cell;
    giveToBackground(world, plate, background, [cell]);
    assert.equal(background.crust.mask[cell], 1, 'ocean must return to background');
    assert.equal(background.crust.type[cell], CrustType.OCEAN, 'type must remain ocean');
    assert.equal(background.crust.formedAt[cell], formedAt,
        'formation time must be preserved (including ages after simulation start)');
    assert.equal(plate.crust.mask[cell], 0, 'source raster must lose transferred ocean');
    console.log('PASS  formation timestamp ' + formedAt + ' Myr preserved on background transfer');
}
console.log('Ocean age return: all 5 checks passed');
