import test from 'node:test';
import assert from 'node:assert/strict';
import { STUDIO_PANE_MODES, normalizeStudioPaneMode, toggleStudioPaneMode }
  from '../src/core/studioPaneMode.mjs';

test('pane modes accept only known presentation values', () => {
  assert.deepEqual([...STUDIO_PANE_MODES], ['split', 'list', 'inspector']);
  for (const invalid of [undefined, null, '', 'stage', 'operation', 'audio', {}, 1]) {
    assert.equal(normalizeStudioPaneMode(invalid), 'split');
  }
  for (const value of STUDIO_PANE_MODES) assert.equal(normalizeStudioPaneMode(value), value);
});

test('focus toggle is reversible and does not require a new cue queue', () => {
  assert.equal(toggleStudioPaneMode('split', 'list'), 'list');
  assert.equal(toggleStudioPaneMode('list', 'list'), 'split');
  assert.equal(toggleStudioPaneMode('split', 'inspector'), 'inspector');
  assert.equal(toggleStudioPaneMode('inspector', 'inspector'), 'split');
  assert.equal(toggleStudioPaneMode('list', 'inspector'), 'inspector');
  assert.equal(toggleStudioPaneMode('inspector', 'list'), 'list');
});

test('unknown targets never arm a new mode', () => {
  for (const target of ['go', 'operation', 'rehearsal', 'automatic', null, undefined]) {
    assert.equal(toggleStudioPaneMode('inspector', target), 'inspector');
  }
});
