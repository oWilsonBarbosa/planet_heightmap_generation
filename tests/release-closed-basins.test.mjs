import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FINISH } from '../v2/js/finish/finish-config.js';
import { finishConfigOf, finishOverrides } from '../v2/js/present/knobs.js';

const file = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Generate and Import enable closed basins via their shared finish override', () => {
  assert.equal(finishOverrides().closedBasins, true);
  assert.equal(finishConfigOf().closedBasins, true);
  assert.equal(finishConfigOf({hydraulicErosion:0.25}).closedBasins, true);
});
test('Evolution and strait defaults remain separate and unchanged', () => {
  const before={...FINISH};
  assert.equal(FINISH.closedBasins, false);
  assert.equal(FINISH.seaRemnantAnySize, false);
  assert.deepEqual(finishOverrides(), {carveTimeMyr:FINISH.carveTimeMyr, closedBasins:true});
  assert.equal(finishConfigOf().seaRemnantAnySize, false);
  assert.deepEqual(finishConfigOf().straitSillM, FINISH.straitSillM);
  assert.deepEqual(finishConfigOf().straitKm, FINISH.straitKm);
  assert.equal(finishConfigOf().straitDepthKm, FINISH.straitDepthKm);
  assert.deepEqual(FINISH,before);
});
test('Generate and Import send the same overrides to the finish-worker', () => {
  const source=file('../js/planet-worker.js');
  assert.match(source, /finish:\s*finishOverrides\(present\.knobs \?\? \{\}\)/);
  assert.match(source, /finish:\s*finishOverrides\(knobs\)/);
  const worker=file('../v2/js/finish/finish-worker.js');
  assert.match(worker, /F:\s*\{\s*\.\.\.FINISH,\s*\.\.\.data\.finish\s*\}/);
});
test('Generate announces salt lakes and historical version fallback', () => {
  const html=file('../generate.html');
  assert.match(html,/Salt lakes and salt pans/);
  assert.match(html,/Evolution's drainage defaults are unchanged/);
  assert.match(html,/v\/2\.3\/generate/);
});
