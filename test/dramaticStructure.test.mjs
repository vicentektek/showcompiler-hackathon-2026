import test from 'node:test';
import assert from 'node:assert/strict';
import { annotateDramaticStructure } from '../src/core/dramaticStructure.mjs';
import { prepareTheatricalCueAnalysis } from '../src/core/theatreCueAnalysis.mjs';
import { createNewShow } from '../src/core/workspace.mjs';

const shortPlay = [
  'Título: Una oportunidad',
  'Personajes:',
  'MARTA (20-30 años): Vive con prisas.',
  'LEO (20-30 años): Es observador.',
  'Escenografía: un despacho con reloj de pared.',
  '[ESCENA ÚNICA]',
  '(MARTA mira el reloj y ajusta la silla.)',
  'MARTA',
  '(Sin apartar la vista del reloj)',
  'No tenemos tiempo para hablar.',
  '',
  'LEO',
  '(Se sienta.)',
  'Hoy no hay que correr.',
  'MARTA',
  'He recordado la tormenta de ayer.',
  '(Pausa. LEO sonríe.)',
  'SONIDO 12: comienza un timbre lejano.',
  'LEO: ¿Has oído eso?',
  'TELÓN',
].join('\n');

test('standalone character headings remain linked to following dialogue across directions and blanks', () => {
  const source = annotateDramaticStructure(shortPlay);
  const roles = source.lines.map(line => line.role);
  assert.equal(source.totalLines, 20);
  assert.equal(roles[2], 'CAST_ENTRY');
  assert.equal(roles[3], 'CAST_ENTRY');
  assert.equal(roles[5], 'SCENE_HEADING');
  assert.equal(roles[6], 'STAGE_DIRECTION');
  assert.equal(roles[7], 'SPEAKER_LABEL');
  assert.equal(source.lines[7].speaker, 'MARTA');
  assert.equal(roles[8], 'STAGE_DIRECTION');
  assert.equal(roles[9], 'DIALOGUE');
  assert.equal(source.lines[9].speaker, 'MARTA');
  assert.equal(source.lines[9].spokenText, 'No tenemos tiempo para hablar.');
  assert.equal(roles[11], 'SPEAKER_LABEL');
  assert.equal(source.lines[13].speaker, 'LEO');
  assert.equal(roles[16], 'STAGE_DIRECTION');
  assert.equal(roles[17], 'TECHNICAL_DIRECTION');
  assert.equal(roles[18], 'DIALOGUE');
  assert.equal(source.lines[18].speaker, 'LEO');
  assert.equal(roles[19], 'STAGE_DIRECTION');
  assert.equal(source.lines[19].speaker, null);
  assert.equal(source.lines[2].lineId, 'L3');
  assert.equal(source.lines[17].text, 'SONIDO 12: comienza un timbre lejano.');
});

test('production type and bare mention of storm do not manufacture a playable cue', () => {
  const original = shortPlay;
  const show = createNewShow({ name:'Una oportunidad', scriptText:shortPlay });
  const prepared = prepareTheatricalCueAnalysis(show,{
    performanceKind:'play', documentKind:'dramatic_script',
    designMode:'balanced', scriptLanguage:'es',
  });
  const document = JSON.parse(prepared.request.messages[1].content);
  const received = document.batch.windows.flatMap(window=>window.coreLines);
  assert.equal(received.length,20);
  assert.equal(received[7].role,'SPEAKER_LABEL');
  assert.equal(received[7].speaker,'MARTA');
  assert.equal(received[15].role,'DIALOGUE');
  assert.equal(received[15].speaker,'MARTA');
  assert.equal(received[17].role,'TECHNICAL_DIRECTION');
  assert.equal(received[17].speaker,null);
  assert.equal(received[18].role,'DIALOGUE');
  assert.equal(received[18].speaker,'LEO');
  assert.match(prepared.request.messages[0].content,/NOT a soundtrack event/);
  assert.equal(prepared.request.response_format.type,'json_schema');
  assert.equal(prepared.request.messages[1].content.includes(original),false,
    'script is still sent only as bounded line records, not an extra full copy');
  assert.equal(show.scriptText,original);
  assert.equal(Object.hasOwn(document,'executable'),false);
  assert.equal(Object.hasOwn(document,'GO'),false);
});

test('rundown rows and sound tech commands are annotated independently from conversation', () => {
  const input = 'BLOQUE 1 | 03:00 | Presentación\nLX 04: blackout\nVIDEO: paquete 01\nTÉCNICO\nSOUND 12: música de entrada';
  const a=annotateDramaticStructure(input);
  assert.deepEqual(a.lines.map(l=>l.role),[
    'RUNNING_ORDER_ROW','TECHNICAL_DIRECTION','TECHNICAL_DIRECTION',
    'UNMARKED_TEXT','TECHNICAL_DIRECTION',
  ]);
  assert.equal(a.lines.every(l=>l.speaker===null),true);
});

test('script line IDs and text remain unchanged in multilingual documents', () => {
  const input='\uFEFFSCÈNE 1\r\nÉLISE: Bonjour.\r\n(La porte est ouverte.)\r\nFIN';
  const lines=annotateDramaticStructure(input).lines;
  assert.deepEqual(lines.map(l=>l.lineId),['L1','L2','L3','L4']);
  assert.equal(lines[1].role,'DIALOGUE');
  assert.equal(lines[1].speaker,'ÉLISE');
  assert.equal(lines[2].role,'STAGE_DIRECTION');
  assert.equal(lines[3].role,'STAGE_DIRECTION');
  assert.equal(input.includes('\r\n'),true);
  assert.throws(()=>annotateDramaticStructure(null),TypeError);
});
