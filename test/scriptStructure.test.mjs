import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeScriptStructure } from '../src/core/scriptStructure.mjs';

test('preserves original lines and distinguishes dramatic roles without sound guesses', () => {
  const scriptText = [
    'ESCENA 1 — LA CASA',
    'ANA: Recuerdo aquella tormenta.',
    '(Un teléfono suena.)',
    'SFX 12: teléfono, timbre grabado',
    'LUIS: ¿Lo escuchas?',
    'La puerta permanece abierta.',
    '',
    'ESCENA 2 — EL JARDÍN',
    'ELENA: Buenos días.',
  ].join('\n');
  const result = analyzeScriptStructure(scriptText);
  assert.deepEqual(result.lines.map(line => line.role), [
    'SCENE_HEADING', 'DIALOGUE', 'STAGE_DIRECTION', 'TECHNICAL_DIRECTION',
    'DIALOGUE', 'UNMARKED_TEXT', 'BLANK', 'SCENE_HEADING', 'DIALOGUE',
  ]);
  assert.equal(result.lines[1].speaker, 'ANA');
  assert.equal(result.lines[1].spokenText, 'Recuerdo aquella tormenta.');
  assert.equal(result.lines[1].text, 'ANA: Recuerdo aquella tormenta.');
  assert.equal(result.lines[6].lineId, 'L7');
  assert.equal(result.scenes.length, 2);
  assert.equal(result.lines[2].sceneId, 'S1');
  assert.equal(result.lines[8].sceneId, 'S2');
  assert.equal(result.totalLines, 9);
  assert.equal(Object.hasOwn(result, 'cues'), false);
});

test('recognizes English/French accents and avoids inventing cues on ambiguous text', () => {
  const input = 'SCÈNE 1\nÉLISE : Bonjour.\n(The bell rings.)\nBLACKOUT\nMUSIQUE: reprise\nSCENE 2';
  const result = analyzeScriptStructure(input);
  assert.equal(result.lines[0].role, 'SCENE_HEADING');
  // Space before the colon is part of the speaker label but never the source text.
  assert.equal(result.lines[1].role, 'DIALOGUE');
  assert.equal(result.lines[1].speaker, 'ÉLISE');
  assert.equal(result.lines[2].role, 'STAGE_DIRECTION');
  assert.equal(result.lines[3].role, 'UNMARKED_TEXT');
  assert.equal(result.lines[4].role, 'TECHNICAL_DIRECTION');
  assert.equal(result.lines[5].role, 'SCENE_HEADING');
});

test('does not rewrite line endings in the input or infer cues from keywords', () => {
  const original = '\uFEFFSCENE 1\r\nMARA: I remember the music.\r\n(Mara looks at a door.)';
  const plan = analyzeScriptStructure(original);
  assert.equal(plan.lines[1].text, 'MARA: I remember the music.');
  assert.equal(plan.lines[2].role, 'STAGE_DIRECTION');
  assert.equal(plan.lines.length, 3);
  assert.equal(original.includes('\r\n'), true);
  assert.equal(Object.hasOwn(plan, 'proposals'), false);
});

test('rejects non-text sources', () => {
  assert.throws(() => analyzeScriptStructure(null), TypeError);
});
