import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeShowProject, serializeShowProject, deserializeShowProject, PROJECT_SCHEMA_VERSION, MAX_PROJECT_JSON_BYTES } from '../src/core/projectPersistence.mjs';

function show() {
  return {
    schemaVersion: 1,
    id: 'show-demo',
    name: 'Ensayo de prueba',
    scriptText: 'ANA: Música\r\n(Suena una campana)\n',
    assets: [{ id: 'campana', name: 'Campana de prueba.wav' }],
    proposals: [{ id: 'prop-1', label: 'Campana', sourceLineIds: ['L2'], actions: [{ type: 'PLAY', assetId: 'campana' }], status: 'APPROVED' }],
    cues: [{ id: 'cue-1', number: 1, label: 'Campana', sourceProposalId: 'prop-1', sourceLineIds: ['L2'], actions: [{ type: 'PLAY', assetId: 'campana' }], status: 'DRAFT' }],
  };
}
const rejected = (mutate) => {
  const s = show();
  mutate(s);
  assert.throws(() => serializeShowProject(s), { code: 'INVALID_SHOW_PROJECT' });
};

test('save/load round trip retains script, original newline encoding, and cues', () => {
  const s = show();
  const restored = deserializeShowProject(serializeShowProject(s));
  assert.deepEqual(restored, s);
  assert.equal(restored.scriptText.includes('\r\n'), true);
  assert.equal(restored.schemaVersion, PROJECT_SCHEMA_VERSION);
});

test('canonicalization returns new independent object graph', () => {
  const s = show();
  const normalized = normalizeShowProject(s);
  normalized.assets[0].name = 'Editada';
  normalized.cues[0].actions[0].assetId = 'otra';
  assert.equal(s.assets[0].name, 'Campana de prueba.wav');
  assert.equal(s.cues[0].actions[0].assetId, 'campana');
});

test('rejects unsupported schema version and extra top-level fields', () => {
  rejected(s => { s.schemaVersion = 2; });
  rejected(s => { s.token = 'should not be stored'; });
});

test('rejects malformed, non-string and oversized JSON before parsing', () => {
  assert.throws(() => deserializeShowProject('{oops'), { code: 'INVALID_SHOW_PROJECT' });
  assert.throws(() => deserializeShowProject(null), { code: 'INVALID_SHOW_PROJECT' });
  assert.throws(() => deserializeShowProject(' '.repeat(MAX_PROJECT_JSON_BYTES + 1)), { code: 'INVALID_SHOW_PROJECT' });
});

test('rejects duplicate asset and cue IDs and cue numbers', () => {
  rejected(s => { s.assets.push({ id: 'campana', name: 'copy' }); });
  rejected(s => { s.cues.push({ ...s.cues[0] }); });
  rejected(s => { s.cues.push({ ...s.cues[0], id: 'cue-2' }); });
});

test('rejects cues referring to absent or rejected proposals', () => {
  rejected(s => { s.cues[0].sourceProposalId = 'missing'; });
  rejected(s => { s.proposals[0].status = 'REJECTED'; });
});

test('rejects references to missing script lines or audio assets', () => {
  rejected(s => { s.scriptText = 'only one line'; });
  rejected(s => { s.assets = []; });
  rejected(s => { s.cues[0].sourceLineIds = ['L99']; });
});

test('rejects diverging cue actions, unapproved action types and cue runtime status', () => {
  rejected(s => { s.assets.push({id: 'other', name: 'Other.wav'}); s.cues[0].actions[0].assetId = 'other'; });
  rejected(s => { s.proposals[0].actions[0].type = 'EXECUTE_SHELL'; });
  rejected(s => { s.cues[0].status = 'PLAYING'; });
});

test('allows pending and rejected proposals but only approved linked cues', () => {
  const s = show();
  s.proposals.push({ id: 'prop-2', label: 'Otro', sourceLineIds: ['L1'], actions: [{ type: 'PLAY', assetId: 'campana' }], status: 'PENDING' });
  s.proposals.push({ id: 'prop-3', label: 'No', sourceLineIds: ['L1'], actions: [{ type: 'PLAY', assetId: 'campana' }], status: 'REJECTED' });
  assert.equal(deserializeShowProject(serializeShowProject(s)).proposals.length, 3);
});

test('rejects duplicates in script references and proposal identifiers', () => {
  rejected(s => { s.cues[0].sourceLineIds = ['L2','L2']; });
  rejected(s => { s.proposals.push({ ...s.proposals[0] }); });
});

test('rejects prototype-pollution fields from untrusted JSON', () => {
  const corrupt = serializeShowProject(show()).replace('"schemaVersion": 1,', '"schemaVersion": 1, "__proto__": { "admin": true },');
  assert.throws(() => deserializeShowProject(corrupt), { code: 'INVALID_SHOW_PROJECT' });
  assert.equal({}.admin, undefined);
});

test('does not store binary audio or transport state', () => {
  const s = show();
  s.assets[0].bytes = [1,2,3];
  assert.throws(() => serializeShowProject(s), { code: 'INVALID_SHOW_PROJECT' });
  assert.doesNotMatch(serializeShowProject(show()), /PLAYING|apiKey|bytes/);
});

test('rejects script and cue count limits', () => {
  rejected(s => { s.scriptText = 'A'.repeat(500_001); });
  rejected(s => { s.cues[0].number = 10001; });
});
