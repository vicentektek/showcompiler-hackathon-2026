import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScript, getScriptLine, searchScript } from '../src/core/script.mjs';

test('parses CRLF and preserves source line numbers and blank lines', () => {
  assert.deepEqual(parseScript('ACTO 1\r\n\r\nANA: Hola'), [
    { id: 'L1', lineNumber: 1, text: 'ACTO 1' },
    { id: 'L2', lineNumber: 2, text: '' },
    { id: 'L3', lineNumber: 3, text: 'ANA: Hola' },
  ]);
});

test('handles BOM and old Mac line endings', () => {
  assert.deepEqual(parseScript('\uFEFFUno\rDos').map((line) => line.text), ['Uno', 'Dos']);
});

test('does not silently accept non-text input', () => {
  assert.throws(() => parseScript(null), TypeError);
});

test('resolves existing source references and rejects missing references', () => {
  const lines = parseScript('Uno\nDos');
  assert.equal(getScriptLine(lines, 'L2')?.text, 'Dos');
  assert.equal(getScriptLine(lines, 'L99'), null);
});

test('search ignores case and accents without altering source', () => {
  const lines = parseScript('MÚSICA: entrada\nOscuro\n');
  assert.deepEqual(searchScript(lines, 'musica').map((line) => line.id), ['L1']);
  assert.deepEqual(searchScript(lines, '  '), []);
  assert.equal(lines[0].text, 'MÚSICA: entrada');
});
