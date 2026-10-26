import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScript } from '../src/core/script.mjs';
import { foldScriptSearch, findScriptMatches, scriptWindow } from '../src/core/scriptNavigation.mjs';

test('script search ignores case and accents while preserving exact original source', () => {
  const script = 'ESCENA 1\n(La música suena.)\nMARTA: ¡Qué música!\n(The LIGHT goes off.)';
  const lines = parseScript(script);
  assert.equal(foldScriptSearch('MÚSICA'), 'musica');
  assert.deepEqual(findScriptMatches(lines, 'MUSICA'), ['L2', 'L3']);
  assert.deepEqual(findScriptMatches(lines, 'light'), ['L4']);
  assert.deepEqual(findScriptMatches(lines, '  '), []);
  assert.equal(lines[1].text, '(La música suena.)');
});
test('long scripts can navigate to a source beyond the first 300 lines', () => {
  const lines = parseScript(Array.from({ length: 900 }, (_, i) => 'LINE ' + (i + 1)).join('\n'));
  const { start, visible } = scriptWindow(lines, 'L850');
  assert.equal(visible.length, 300);
  assert.ok(start > 300);
  assert.ok(visible.some(line => line.id === 'L850'));
  assert.equal(scriptWindow(lines, 'L0').start, 0);
});
test('script search is bounded and input is validated', () => {
  const lines = parseScript('BELL\nBELL\nBELL');
  assert.deepEqual(findScriptMatches(lines, 'bell', 2), ['L1', 'L2']);
  assert.throws(() => findScriptMatches(null, 'bell'));
  assert.throws(() => findScriptMatches(lines, 'bell', 5001));
  assert.throws(() => scriptWindow(lines, 'L1', 0));
});
