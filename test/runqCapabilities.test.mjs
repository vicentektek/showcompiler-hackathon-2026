import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { RUNQ_CAPABILITIES, retrieveCapabilities } from '../src/core/runqCapabilities.mjs';

const root = new URL('../', import.meta.url);
const read = file => readFile(fileURLToPath(new URL(file, root)), 'utf8');

test('catalogue records have stable bilingual shape and verifiable source/test evidence', async () => {
  const ids = new Set();
  for (const capability of RUNQ_CAPABILITIES) {
    assert.deepEqual(Object.keys(capability).sort(), [
      'accessPath', 'description', 'evidence', 'id', 'keywords',
      'prerequisites', 'prohibitions', 'state', 'tests',
    ]);
    assert.match(capability.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(ids.has(capability.id), false);
    ids.add(capability.id);
    assert.ok(capability.description.en);
    assert.ok(capability.description.es);
    assert.ok(capability.accessPath);
    assert.ok(['supported', 'partial', 'experimental'].includes(capability.state));
    assert.ok(capability.prerequisites.length > 0);
    assert.ok(capability.prohibitions.length > 0);
    assert.ok(capability.evidence.length > 0);
    assert.ok(capability.tests.length > 0);
    for (const evidence of capability.evidence) {
      const sourceLines = (await read(evidence.file)).split(/\r?\n/);
      assert.ok(sourceLines[evidence.line - 1]?.includes(evidence.contains),
        `${capability.id}: ${evidence.file}:${evidence.line} must contain ${evidence.contains}`);
    }
    for (const reference of capability.tests) {
      assert.ok((await read(reference.file)).includes(reference.name),
        `${capability.id}: missing test reference ${reference.file} — ${reference.name}`);
    }
  }
});

test('retrieval is deterministic, relevant, bounded, and expands whole-catalogue prompts', () => {
  assert.deepEqual(
    retrieveCapabilities('undo agent edits').map(item => item.id),
    retrieveCapabilities('undo agent edits').map(item => item.id),
  );
  assert.ok(retrieveCapabilities('undo assistant edits').some(item => item.id === 'assistant-edit-review-and-undo'));
  assert.equal(retrieveCapabilities('undo assistant edits', 1).length, 1);
  assert.equal(retrieveCapabilities('What can RUNQ do?').length, RUNQ_CAPABILITIES.length);
  assert.equal(retrieveCapabilities('all capabilities').length, RUNQ_CAPABILITIES.length);
  assert.ok(retrieveCapabilities('does all audio work?').length < RUNQ_CAPABILITIES.length);
  assert.ok(retrieveCapabilities('Help with L2').some(item => item.id === 'original-script-and-line-references'));
  assert.deepEqual(retrieveCapabilities('help with an unknown topic').map(item => item.id), ['runtime-capability-overview']);
  const overview = retrieveCapabilities('What can RUNQ do?');
  assert.deepEqual(overview.map(item => item.id), RUNQ_CAPABILITIES.map(item => item.id));
  for (const prompt of [
    'Tengo un guion escolar. Guíame paso a paso sin mandarme a otras pestañas.',
    'I have a school script. Guide me step by step without sending me to other tabs.',
  ]) {
    const workflow = retrieveCapabilities(prompt);
    assert.deepEqual(workflow.map(item => item.id).sort(), RUNQ_CAPABILITIES.map(item => item.id).sort());
    assert.ok(Buffer.byteLength(JSON.stringify(workflow)) < 5000);
    assert.equal(retrieveCapabilities(prompt, 2).length, 2);
  }
  assert.ok(Buffer.byteLength(JSON.stringify(overview)) <= 5000);
  assert.ok(overview.every(item => item.evidence.every(ref =>
    Object.keys(ref).sort().join(',') === 'file,line')));
  assert.ok(RUNQ_CAPABILITIES.every(item => item.keywords.length > 0));
  assert.equal(retrieveCapabilities('What can RUNQ do?', 2).length, 2);
  assert.deepEqual(retrieveCapabilities('unrelated query with no matching capability'), []);
  assert.throws(() => retrieveCapabilities('audio', 0), RangeError);
});
