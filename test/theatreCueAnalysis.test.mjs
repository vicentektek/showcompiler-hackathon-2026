import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyTheatricalSuggestions,
  parseTheatricalCueContent,
  prepareTheatricalCueAnalysis,
  TheatricalCueValidationError,
} from '../src/core/theatreCueAnalysis.mjs';
import { addAudioReference, createNewShow } from '../src/core/workspace.mjs';

function project(scriptText = [
  'SCENE 1',
  '(A distant bell rings.)',
  'A wet empty station at dawn.',
  '(The rain continues.)',
  '(Absolute silence.)',
  '(The music fades out.)',
  'MARA: I remember the storm.',
].join('\n')) {
  return createNewShow({ id: 'theatre-test', name: 'Transient analysis', scriptText });
}

function item(overrides = {}) {
  return {
    windowId: 'S1-W1',
    sourceLineId: 'L2',
    sourceEvidence: '(A distant bell rings.)',
    cueKind: 'FX',
    basis: 'EXPLICIT',
    transport: 'PLAY',
    label: 'Distant bell',
    soundPrompt: 'One distant brass bell strike with a soft attack and long natural decay.',
    assetId: null,
    trigger: 'ON_LINE',
    durationSeconds: 4,
    loop: false,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    confidence: 0.95,
    reason: 'The stage direction explicitly calls for a bell.',
    ...overrides,
  };
}

test('prepares a strict official request with dynamic core and asset enums', () => {
  const original = addAudioReference(project(), 'bell.wav');
  const before = structuredClone(original);
  const prepared = prepareTheatricalCueAnalysis(original, { scriptLanguage: 'en' });
  const request = prepared.request;
  assert.equal(request.model, 'muse-spark-1.3');
  assert.equal(request.messages[0].role, 'developer');
  assert.match(request.messages[0].content, /basis EXPLICIT/);
  assert.match(request.messages[0].content, /merely mentioning or remembering/);
  assert.match(request.messages[0].content, /transport CONTINUE/);
  assert.match(request.messages[0].content, /intentional silence/);
  assert.match(request.messages[0].content, /untrusted theatrical material/);
  assert.equal(request.reasoning_effort, 'low');
  assert.equal(request.max_completion_tokens, 4096);
  assert.equal(request.stream, false);
  assert.equal(request.store, false);

  const root = request.response_format.json_schema.schema;
  const proposal = root.properties.proposals.items;
  assert.equal(request.response_format.type, 'json_schema');
  assert.equal(request.response_format.json_schema.strict, true);
  assert.equal(root.additionalProperties, false);
  assert.equal(proposal.additionalProperties, false);
  assert.deepEqual(proposal.required.sort(), Object.keys(proposal.properties).sort());
  assert.deepEqual(proposal.properties.windowId.enum, ['S1-W1']);
  assert.deepEqual(proposal.properties.sourceLineId.enum, ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7']);
  assert.deepEqual(proposal.properties.assetId.anyOf[0].enum, ['asset-1']);
  assert.deepEqual(original, before);
  assert.equal(Object.hasOwn(original, 'coverage'), false);
});

test('empty audio library constrains assetId to null and sends no binary fields', () => {
  const prepared = prepareTheatricalCueAnalysis(project());
  const asset = prepared.request.response_format.json_schema.schema
    .properties.proposals.items.properties.assetId;
  assert.deepEqual(asset, { type: 'null' });
  const document = JSON.parse(prepared.request.messages[1].content);
  assert.deepEqual(document.availableAudio, []);
  assert.doesNotMatch(prepared.request.messages[1].content, /audioBuffer|binary|schemaVersion/);
});

test('batches scripts beyond 120 lines with exact visible coverage', () => {
  const source = ['ESCENA 1', ...Array.from({ length: 129 }, (_, index) =>
    index === 0 ? 'Línea íntegra en español' : `Línea ${index + 2}`)].join('\n');
  const first = prepareTheatricalCueAnalysis(project(source), { scriptLanguage: 'es', windowStart: 0 });
  assert.equal(first.coverage.totalLines, 130);
  assert.equal(first.coverage.totalWindows, 3);
  assert.deepEqual(first.coverage.analyzedWindowIds, ['S1-W1', 'S1-W2']);
  assert.equal(first.coverage.analyzedLineIds[0], 'L1');
  assert.equal(first.coverage.analyzedLineIds.at(-1), 'L120');
  assert.equal(first.coverage.analyzedLines, 120);
  assert.equal(first.coverage.nextWindowStart, 2);
  assert.equal(first.coverage.complete, false);

  const last = prepareTheatricalCueAnalysis(project(source), { scriptLanguage: 'es', windowStart: 2 });
  assert.deepEqual(last.coverage.analyzedLineIds, Array.from({ length: 10 }, (_, i) => `L${121 + i}`));
  assert.equal(last.coverage.nextWindowStart, null);
  assert.equal(last.coverage.complete, true);
  const body = JSON.parse(first.request.messages[1].content);
  assert.equal(body.batch.windows[0].coreLines[1].text, 'Línea íntegra en español');
  assert.equal(source.includes('Línea íntegra en español'), true);
});

test('marks bounded line truncation without modifying original script text', () => {
  const long = 'á'.repeat(300);
  const show = project(`SCENE 1\n${long}`);
  const before = show.scriptText;
  const prepared = prepareTheatricalCueAnalysis(show);
  const body = JSON.parse(prepared.request.messages[1].content);
  assert.equal(body.batch.windows[0].coreLines[1].text.length, 250);
  assert.equal(body.batch.windows[0].coreLines[1].truncated, true);
  assert.equal(show.scriptText, before);
  assert.equal(prepared.scope.windows[0].coreLines[1].text.length, 300);
});

test('parses explicit, suggested, continuing, silence and stop classifications', () => {
  const prepared = prepareTheatricalCueAnalysis(project());
  const proposals = [
    item(),
    item({
      sourceLineId: 'L3', sourceEvidence: 'wet empty station', cueKind: 'AMBIENCE',
      basis: 'SUGGESTED', label: 'Empty station air', soundPrompt: 'Sparse exterior air and distant city wash, seamless loop, no voices.',
      durationSeconds: 90, loop: true, fadeInSeconds: 2, fadeOutSeconds: 3, confidence: 0.55,
      reason: 'A restrained atmosphere is a creative option for the setting.',
    }),
    item({
      sourceLineId: 'L4', sourceEvidence: '(The rain continues.)', cueKind: 'AMBIENCE',
      transport: 'CONTINUE', label: 'Continue rain', soundPrompt: 'Maintain the existing rain ambience unchanged.',
      durationSeconds: null, loop: true, confidence: 0.9, reason: 'The line confirms continuity rather than a new onset.',
    }),
    item({
      sourceLineId: 'L5', sourceEvidence: '(Absolute silence.)', cueKind: 'SILENCE',
      transport: 'SILENCE', label: 'Intentional silence', soundPrompt: 'Intentional silence; generate and play no audio.',
      durationSeconds: null, confidence: 0.98, reason: 'The script explicitly requires silence.',
    }),
    item({
      sourceLineId: 'L6', sourceEvidence: '(The music fades out.)', cueKind: 'MUSIC',
      transport: 'STOP', label: 'Fade existing music', soundPrompt: 'Fade the already-running music; do not start a new file.',
      durationSeconds: 3, fadeOutSeconds: 3, confidence: 0.96, reason: 'This is an exit for existing music.',
    }),
  ];
  const parsed = parseTheatricalCueContent(JSON.stringify({ proposals }), prepared.scope);
  assert.equal(parsed[1].basis, 'SUGGESTED');
  assert.equal(parsed[2].transport, 'CONTINUE');
  assert.equal(parsed[3].transport, 'SILENCE');
  assert.equal(parsed[4].transport, 'STOP');
  const classified = classifyTheatricalSuggestions(parsed);
  assert.equal(classified.proposals.length, 2);
  assert.equal(classified.details.length, 2);
  assert.deepEqual(classified.observations.map(entry => entry.transport), ['CONTINUE', 'SILENCE', 'STOP']);
  assert.equal(classified.duplicatesRemoved, 0);
});

test('rejects malformed schema separately from contextual semantic failures', () => {
  const prepared = prepareTheatricalCueAnalysis(project());
  assert.throws(() => parseTheatricalCueContent('{"proposals":', prepared.scope), error =>
    error instanceof TheatricalCueValidationError && error.safeReason === 'NOT_JSON');
  assert.throws(() => parseTheatricalCueContent(JSON.stringify({ proposals: [{ ...item(), extra: true }] }), prepared.scope), error =>
    error.safeReason === 'SCHEMA');

  const semanticCases = [
    item({ windowId: 'S9-W9' }),
    item({ sourceLineId: 'L3', sourceEvidence: 'words that are not present' }),
    item({ assetId: 'invented-asset' }),
    item({ transport: 'CONTINUE', assetId: 'asset-1' }),
    item({ cueKind: 'SILENCE', transport: 'PLAY' }),
    item({ transport: 'STOP', loop: true }),
  ];
  for (const invalid of semanticCases) {
    assert.throws(() => parseTheatricalCueContent(JSON.stringify({ proposals: [invalid] }), {
      ...prepared.scope,
      assetIds: ['asset-1'],
    }), error => error.safeReason === 'SEMANTIC');
  }
});

test('context lines cannot be cited as core evidence', () => {
  const source = ['SCENE 1', ...Array.from({ length: 120 }, (_, i) => `Line ${i + 2}`)].join('\n');
  const prepared = prepareTheatricalCueAnalysis(project(source), { windowStart: 0 });
  // L61 belongs to S1-W2, even though it is contextAfter for S1-W1.
  const invalid = item({ windowId: 'S1-W1', sourceLineId: 'L61', sourceEvidence: 'Line 61' });
  assert.throws(() => parseTheatricalCueContent(JSON.stringify({ proposals: [invalid] }), prepared.scope), error =>
    error.safeReason === 'SEMANTIC');
});

test('deduplicates ambience per scene and other cues only at the same source line', () => {
  const base = {
    ...item(), sceneId: 'S1',
  };
  const ambience = {
    ...base,
    sourceLineId: 'L3', sourceEvidence: 'station', cueKind: 'AMBIENCE',
    label: 'Station air', soundPrompt: 'Soft WIND; distant city.', loop: true,
  };
  const items = [
    ambience,
    { ...ambience, sourceLineId: 'L4', soundPrompt: 'soft wind, distant city' },
    base,
    { ...base },
    { ...base, sourceLineId: 'L7' },
  ];
  const result = classifyTheatricalSuggestions(items);
  assert.equal(result.proposals.length, 3);
  assert.equal(result.details.length, 3);
  assert.equal(result.duplicatesRemoved, 2);
  assert.notEqual(result.details[0], items[0]);
  assert.equal(items.length, 5);
});

test('validates options without any network or persistence side effect', () => {
  const show = project();
  const before = JSON.stringify(show);
  assert.throws(() => prepareTheatricalCueAnalysis(show, null), TypeError);
  assert.throws(() => prepareTheatricalCueAnalysis(show, { windowStart: -1 }), RangeError);
  assert.throws(() => prepareTheatricalCueAnalysis(show, { windowStart: 99 }), RangeError);
  assert.throws(() => prepareTheatricalCueAnalysis(show, { model: 'https://evil.example' }), TypeError);
  assert.throws(() => prepareTheatricalCueAnalysis(show, { extra: true }), TypeError);
  assert.equal(JSON.stringify(show), before);
});
