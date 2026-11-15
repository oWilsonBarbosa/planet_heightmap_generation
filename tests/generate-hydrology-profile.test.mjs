import test from 'node:test';
import assert from 'node:assert/strict';
import { FINISH } from '../v2/js/finish/finish-config.js';
import { finishConfigOf, finishOverrides, generateFinishOverrides } from '../v2/js/present/knobs.js';

test('Generate uses the unchanged v3 profile by default', () => {
    const baseline = finishOverrides({});
    assert.deepEqual(generateFinishOverrides({}), baseline);
    assert.deepEqual(generateFinishOverrides({}, 'v3'), baseline);
    assert.equal(finishConfigOf({}).closedBasins, FINISH.closedBasins);
    assert.equal(FINISH.closedBasins, false);
    assert.equal(FINISH.seaRemnantAnySize, false);
});

test('opt-in terminal-basin profile enables retained salt-lake behavior', () => {
    const overrides = generateFinishOverrides({ hydraulicErosion: 0.25 }, 'closed-basins');
    assert.equal(overrides.closedBasins, true);
    assert.equal(overrides.seaRemnantAnySize, true);
    assert.equal(overrides.carveTimeMyr, FINISH.carveTimeMyr * 0.5);
});

test('unknown profile does not silently enable closed basins', () => {
    const overrides = generateFinishOverrides({}, 'unexpected');
    assert.equal(Object.hasOwn(overrides, 'closedBasins'), false);
    assert.equal(Object.hasOwn(overrides, 'seaRemnantAnySize'), false);
    assert.equal(FINISH.closedBasins, false);
});

test('profile overrides are deterministic and do not mutate defaults', () => {
    const a = generateFinishOverrides({}, 'closed-basins');
    const b = generateFinishOverrides({}, 'closed-basins');
    assert.deepEqual(a, b);
    a.closedBasins = false;
    assert.equal(b.closedBasins, true);
    assert.equal(FINISH.closedBasins, false);
});
