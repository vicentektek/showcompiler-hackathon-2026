import test from 'node:test';
import assert from 'node:assert/strict';
import { isSceneHeading, planScriptAnalysis } from '../src/core/sceneAnalysis.mjs';

test('recognizes conservative multilingual headings and screenplay slug lines', () => {
  for (const heading of [
    'SCENE 1', 'ESCENA PRIMERA', 'SCÈNE DEUX', 'SZENE DREI', 'CENA UM',
    'ACT II — The return', 'ACTO 2: Regreso', 'INT. CASA - NOCHE', 'EXT./INT. COCHE - DÍA',
  ]) assert.equal(isSceneHeading(heading), true, heading);
  for (const dialogue of [
    'ANA: Esta escena termina.', 'The act was difficult.', '(Interior de la casa)', '',
  ]) assert.equal(isSceneHeading(dialogue), false, dialogue);
});

test('creates stable scene and window identifiers across languages', () => {
  const script = [
    'ESCENA 1', '(Lluvia)', 'ANA: Hola',
    'SCÈNE DEUX', '(Une cloche)',
    'SZENE DREI', '(Wind)',
    'CENA UM', '(Mar)',
    'INT. CASA - NOCHE', '(Silencio)',
  ].join('\n');
  const plan = planScriptAnalysis(script);
  assert.deepEqual(plan.scenes.map(scene => scene.id), ['S1', 'S2', 'S3', 'S4', 'S5']);
  assert.deepEqual(plan.scenes.map(scene => scene.headingLineId), ['L1', 'L4', 'L6', 'L8', 'L10']);
  assert.deepEqual(plan.windows.map(window => window.id), ['S1-W1', 'S2-W1', 'S3-W1', 'S4-W1', 'S5-W1']);
  assert.equal(plan.scenes[1].headingText, 'SCÈNE DEUX');
  assert.equal(plan.windows[1].coreLines[1].text, '(Une cloche)');
});

test('splits long scenes into bounded core windows with read-only context', () => {
  const script = ['SCENE 1', ...Array.from({ length: 7 }, (_, index) => `Line ${index + 2}`)].join('\n');
  const plan = planScriptAnalysis(script, { maxCoreLines: 3, contextLines: 2 });
  assert.deepEqual(plan.windows.map(window => window.coreLines.map(line => line.id)), [
    ['L1', 'L2', 'L3'], ['L4', 'L5', 'L6'], ['L7', 'L8'],
  ]);
  assert.deepEqual(plan.windows[0].contextAfter.map(line => line.id), ['L4', 'L5']);
  assert.deepEqual(plan.windows[1].contextBefore.map(line => line.id), ['L2', 'L3']);
  assert.deepEqual(plan.windows[1].contextAfter.map(line => line.id), ['L7', 'L8']);
  assert.deepEqual(plan.windows[2].contextBefore.map(line => line.id), ['L5', 'L6']);
});

test('a script without headings, including blank lines, remains one exact scene', () => {
  const script = 'Prólogo\n\nANA: Olá\n(Fin)';
  const plan = planScriptAnalysis(script);
  assert.equal(plan.scenes.length, 1);
  assert.equal(plan.scenes[0].headingLineId, null);
  assert.deepEqual(plan.windows[0].coreLines.map(line => line.text), ['Prólogo', '', 'ANA: Olá', '(Fin)']);
  assert.deepEqual(plan.coverage.coveredLineIds, ['L1', 'L2', 'L3', 'L4']);
  assert.deepEqual(plan.coverage.uncoveredLineIds, []);
  assert.equal(plan.coverage.coveragePercent, 100);
});

test('core coverage is exact, deterministic and detached from subsequent results', () => {
  const script = 'SCENE 1\nα\nβ\nESCENA 2\n雨\n';
  const first = planScriptAnalysis(script, { maxCoreLines: 2, contextLines: 1 });
  const second = planScriptAnalysis(script, { maxCoreLines: 2, contextLines: 1 });
  assert.deepEqual(first, second);
  const ids = first.windows.flatMap(window => window.coreLines.map(line => line.id));
  assert.equal(ids.length, new Set(ids).size);
  assert.deepEqual(ids, ['L1', 'L2', 'L3', 'L4', 'L5', 'L6']);
  first.windows[0].coreLines[0].text = 'changed output only';
  assert.equal(second.windows[0].coreLines[0].text, 'SCENE 1');
  assert.equal(script, 'SCENE 1\nα\nβ\nESCENA 2\n雨\n');
});

test('validates planner options before producing windows', () => {
  assert.throws(() => planScriptAnalysis('x', null), TypeError);
  assert.throws(() => planScriptAnalysis('x', { maxCoreLines: 0 }), RangeError);
  assert.throws(() => planScriptAnalysis('x', { maxCoreLines: 121 }), RangeError);
  assert.throws(() => planScriptAnalysis('x', { contextLines: -1 }), RangeError);
  assert.throws(() => planScriptAnalysis('x', { contextLines: 11 }), RangeError);
});


test('preamble is folded into the first headed scene without creating a billable dummy window', () => {
  const text = [
    'PROTOCOLO FICTICIO', 'Thriller de tres actores', 'Reparto: ALMA, RUIZ, SISTEMA',
    'Sala de mando con botón de utilería.', '', 'ESCENA 1 — EL AVISO',
    '[Suena una señal grave.]', 'SISTEMA: Mensaje recibido.',
    '', 'ESCENA 2 — LA RESPUESTA', '[Se escucha una alarma.]', 'FIN',
  ].join('\n');
  const plan = planScriptAnalysis(text);
  assert.equal(plan.coverage.totalLines, 12);
  assert.equal(plan.coverage.sceneCount, 2);
  assert.equal(plan.coverage.windowCount, 2);
  assert.deepEqual(plan.scenes.map(scene => scene.headingLineId), ['L6','L10']);
  assert.deepEqual(plan.windows.map(window => [window.startLineId,window.endLineId]), [
    ['L1','L9'],['L10','L12'],
  ]);
  assert.deepEqual(plan.coverage.uncoveredLineIds, []);
  assert.equal(plan.coverage.coveredLines, 12);
});
