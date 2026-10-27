import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERFORMANCE_KINDS, DOCUMENT_KINDS,
  validateProductionContext, buildProductionGuidance,
} from '../src/core/performanceKnowledge.mjs';
import { prepareTheatricalCueAnalysis } from '../src/core/theatreCueAnalysis.mjs';
import { createNewShow } from '../src/core/workspace.mjs';

test('production profiles are bounded and never control an audio transport', () => {
  assert.equal(PERFORMANCE_KINDS.includes('gala'), true);
  assert.equal(DOCUMENT_KINDS.includes('running_order'), true);
  assert.deepEqual(validateProductionContext(), { performanceKind: 'auto', documentKind: 'auto' });
  assert.throws(() => validateProductionContext(null), TypeError);
  assert.throws(() => validateProductionContext({ documentKind: 'shell_command' }), TypeError);
  assert.throws(() => validateProductionContext({ performanceKind: 'casino' }), TypeError);
  assert.throws(() => validateProductionContext({ documentKind:'cue_sheet', additional:'x' }), TypeError);
  assert.match(buildProductionGuidance(), /not an automatically executable/);
  assert.match(buildProductionGuidance({ performanceKind:'play',documentKind:'dramatic_script' }), /Names on their own line/);
  assert.match(buildProductionGuidance({ performanceKind:'musical',documentKind:'libretto' }), /backing track/);
  assert.match(buildProductionGuidance({ performanceKind:'gala',documentKind:'running_order' }), /Time columns are estimates/);
  assert.match(buildProductionGuidance({ performanceKind:'concert',documentKind:'setlist' }), /live musicians/);
  assert.match(buildProductionGuidance({ performanceKind:'opera',documentKind:'score' }), /graphic staff notation/);
  assert.match(buildProductionGuidance({ performanceKind:'dance',documentKind:'calling_script' }), /A standby is preparation/);
  assert.match(buildProductionGuidance({ performanceKind:'circus',documentKind:'technical_script' }), /STANDBY|STANDBY|STAGE-MANAGER|standby/i);
  assert.match(buildProductionGuidance({ performanceKind:'corporate',documentKind:'cue_sheet' }), /cue sheet/);
  for (const show of PERFORMANCE_KINDS) {
    for (const documentKind of DOCUMENT_KINDS) {
      assert.ok(buildProductionGuidance({performanceKind:show,documentKind}).length > 120);
    }
  }
});

test('Meta request includes approved genre/document context without changing script or project', () => {
  const scriptText = [
    'ESCENA 1',
    'Escenografía: cafetería con reloj de pared.',
    'MARCOS',
    '(Mira el reloj)',
    'Nos quedan tres minutos.',
    'SOFÍA',
    '(Responde con calma.)',
    'Tomemos el café.',
  ].join('\n');
  const show = createNewShow({ id:'context-qa',name:'El café',scriptText });
  const before = structuredClone(show);
  const prepared = prepareTheatricalCueAnalysis(show, {
    scriptLanguage:'es',
    designMode:'expressive',
    performanceKind:'play',
    documentKind:'dramatic_script',
  });
  const payload = JSON.parse(prepared.request.messages[1].content);
  assert.deepEqual(payload.productionContext, { performanceKind:'play', documentKind:'dramatic_script' });
  assert.match(prepared.request.messages[0].content, /THEATRE:/);
  assert.match(prepared.request.messages[0].content, /DRAMATIC SCRIPT:/);
  assert.match(prepared.request.messages[0].content, /EXPRESSIVE sound design/);
  assert.equal(prepared.request.response_format.type, 'json_schema');
  assert.equal(prepared.coverage.analyzedLines, 8);
  assert.equal(prepared.request.messages[1].role, 'user');
  assert.deepEqual(show,before, 'profile selection must not persist or modify the show');

  const auto=prepareTheatricalCueAnalysis(show);
  assert.deepEqual(JSON.parse(auto.request.messages[1].content).productionContext,
    {performanceKind:'auto',documentKind:'auto'});
  assert.throws(() => prepareTheatricalCueAnalysis(show,{ documentKind:'play' }),TypeError);
  assert.throws(() => prepareTheatricalCueAnalysis(show,{ performanceKind:'play', documentKind:'run-my-code' }),TypeError);
});

test('a running order does not become dramatic dialogue or a soundtrack automatically', () => {
  const show=createNewShow({ name:'Gala 2026',scriptText:
    'BLOQUE 1 | DURACIÓN 03:00 | PRESENTADOR | WALK-IN | VÍDEO\n' +
    'BLOQUE 2 | DURACIÓN 12:00 | PREMIOS | APLAUSOS\n' +
    'BLOQUE 3 | DURACIÓN 04:00 | CIERRE' });
  const request=prepareTheatricalCueAnalysis(show,{
    performanceKind:'gala',
    documentKind:'running_order',
  }).request;
  assert.match(request.messages[0].content,/Running-order timings|Time columns are estimates/);
  assert.match(request.messages[0].content,/do not silently convert a multi-column rundown|multi-column rundown/);
  assert.match(request.messages[0].content,/not a GO/);
  assert.equal(request.messages[1].content.includes('BLOQUE 2'),true);
});
