// Lab phase 1 — foundations & rigid kinematics.
// A phase module tells the lab shell what to build, which layers exist, how to get the
// Frame for a time, and what the developer should verify. It contains no DOM code.

import { buildRigidDriftWorld, setRigidDriftTime, RIGID_DRIFT_MAX_MYR } from '../../tectonics/scenarios/rigid-drift.js';
import { reconstruct } from '../../tectonics/step/reconstruct.js';
import { captureFrame } from '../../tectonics/snapshot.js';
import { frameTallies } from '../../tectonics/measure.js';
import { speedCmYrAt } from '../../tectonics/step/kinematics.js';
import { colorByPlate, colorByCrustType, css, GAP_RGB } from '../../view/palettes.js';
import { CrustType } from '../../tectonics/model/crust.js';
import { describeCell } from './phase-kit.js';

export function createPhase(simMesh, seed) {
    const world = buildRigidDriftWorld(simMesh, seed);
    let frame = null;

    return {
        title: 'Phase 1 — Foundations & rigid kinematics',
        summary: 'Continents-first, as in Worldbuilding Pasta’s GPlates workflow: four plates that are nothing but a ' +
            'continent, each on a fixed Euler pole, drifting over one passive pre-history ocean that never moves. ' +
            'Nothing is resolved yet — behind a moving continent a black gap opens; ahead of it the continent rides ' +
            'over the old ocean (faint magenta tint). Land running into land is strong magenta. Phase 2 resolves all three.',
        checklist: [
            'Continents and cratons keep their exact shape at every time — no blurring, shredding or shimmer beyond single-cell edges.',
            'Only land moves. The ocean is a single stationary background plate; hover it to check.',
            'Dragging time back to 0 Myr re-tiles the sphere perfectly: no black, no magenta.',
            '“Drifter” (pole 90° away) slides in a straight great-circle path at 5 cm/yr ≈ 4.5° per 10 Myr.',
            '“Spinner” (pole at its centre) rotates in place; “Hinge” swings around its nearby pole; “Anchor” never moves.',
            'Each moving continent leaves a gap of its own shape behind it and an equal overlap ahead: gap % ≈ overlap % at all times.',
            'Velocity arrows are tangent to circles around each plate’s pole marker (◎).',
        ],
        checkCommand: 'node v2/tools/check-phase1.mjs',
        maxTime: RIGID_DRIFT_MAX_MYR,
        timeStep: 1,
        initialView: [5, -15],
        layers: [
            { label: 'Plates', paint: colorByPlate },
            { label: 'Crust type', paint: colorByCrustType },
        ],
        hasBoundaries: false,
        legend: [
            { color: css(GAP_RGB), label: 'gap — crust pulled apart (future new ocean)' },
            { color: '#5c3a78', label: 'faint tint — land over old ocean (future subduction)' },
            { color: '#ff00c8', label: 'strong tint — land over land (future collision)' },
        ],

        // Closed-form motion, so any time can be reconstructed on demand (and scrubbing backwards is exact).
        frameAt(t) {
            if (frame && frame.time === t) return frame;
            setRigidDriftTime(world, t);
            reconstruct(world);
            frame = captureFrame(world, frame);
            return frame;
        },

        // Reads the live world as well as the frame: valid because frameAt() has just posed the world at fr.time.
        stats(fr) {
            const t = frameTallies(fr), pct = v => (100 * v / t.cells).toFixed(2) + ' %';
            return {
                cards: [
                    { big: pct(t.gaps), small: 'of the surface is gap' },
                    { big: pct(t.landOverOcean + t.collision), small: `is overlap · ${pct(t.collision)} land-on-land` },
                ],
                head: ['Plate', 'cm/yr', 'moved', 'fidelity'],
                rows: world.plates.map(p => {
                    const m = p.mat, c = p.scene.centre;
                    const x = m[0] * c[0] + m[1] * c[1] + m[2] * c[2], y = m[3] * c[0] + m[4] * c[1] + m[5] * c[2], z = m[6] * c[0] + m[7] * c[1] + m[8] * c[2];
                    const moved = Math.acos(Math.max(-1, Math.min(1, x * c[0] + y * c[1] + z * c[2]))) * 6371;
                    return {
                        plateId: p.id, name: p.name, note: p.scene.def.note,
                        cells: [speedCmYrAt(p.omega, x, y, z).toFixed(2), `${moved.toFixed(0)} km`,
                            p.stats.continentalCells ? shapeFidelity(world, p).toFixed(2) + ' %' : '—'],
                    };
                }),
                hint: 'Fidelity = reconstructed continent area ÷ stored area. It should stay within ~1 % of 100 at every time; that residue is cell-sampling noise, not deformation.',
            };
        },

        markers() {
            const out = [];
            for (const p of world.plates) {
                if (p.scene.def.speedCmYr === 0) continue;
                out.push({ xyz: p.scene.pole, plateId: p.id, label: p.name + ' pole' });
                out.push({ xyz: p.scene.pole.map(v => -v), plateId: p.id, label: '' });
            }
            return out;
        },

        describeCell,
    };
}

// World cells on which this plate shows continental crust ÷ continental cells in its raster.
function shapeFidelity(world, plate) {
    const { xyz, numCells, index } = world.mesh, m = plate.mat, { mask, type } = plate.crust;
    let n = 0;
    for (let w = 0; w < numCells; w++) {
        const x = xyz[3 * w], y = xyz[3 * w + 1], z = xyz[3 * w + 2];
        const c = index.nearest(m[0] * x + m[3] * y + m[6] * z, m[1] * x + m[4] * y + m[7] * z, m[2] * x + m[5] * y + m[8] * z);
        if (mask[c] && type[c] !== CrustType.OCEAN) n++;
    }
    return 100 * n / Math.max(1, plate.stats.continentalCells);
}
