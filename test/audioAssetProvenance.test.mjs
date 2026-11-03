import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  normalizeShowProject, serializeShowProject, deserializeShowProject,
} from '../src/core/projectPersistence.mjs';
import { createNewShow, addAudioReference } from '../src/core/workspace.mjs';
import { exportPortableShow, importPortableShow } from '../src/core/showArchive.mjs';
import { readZipStore, writeZipStore } from '../src/core/zipStore.mjs';

const audioBytes = new TextEncoder().encode('RIFF generated PCM16 test bytes');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function provenance(overrides = {}) {
  return {
    origin: 'AI_GENERATED_SFX',
    provider: 'MODAL',
    model: 'stabilityai/stable-audio-3-small-sfx',
    modelRevision: 'a'.repeat(40),
    requestId: 'req-sfx-001',
    sourceLineId: 'L2',
    prompt: 'A heavy wooden door opens slowly, creaks, then closes with one impact.',
    seed: 42001,
    requestedDurationSeconds: 5,
    sha256: sha256(audioBytes),
    generatedDurationSeconds: 5,
    sampleRateHz: 44100,
    channels: 2,
    byteLength: audioBytes.byteLength,
    reviewedRegion: { inMs: 125, outMs: 4875 },
    estimatedMaxCostUsd: 0.05,
    actualCostUsd: null,
    createdAt: '2026-10-28T10:00:00.000Z',
    acceptedAt: '2026-10-28T10:02:00.000Z',
    ...overrides,
  };
}

function projectWithProvenance(value = provenance()) {
  let project = createNewShow({
    id: 'show-sfx-provenance',
    name: 'SFX provenance',
    scriptText: 'SCENE 1\n(The old door opens)\n',
  });
  project = addAudioReference(project, 'runq-sfx-req-sfx-001.wav', {
    provenance: value,
  });
  return project;
}

function fileFor(bytes = audioBytes) {
  return {
    name: 'runq-sfx-req-sfx-001.wav',
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer.slice(
      bytes.byteOffset, bytes.byteOffset + bytes.byteLength,
    ),
  };
}

test('unknown generation estimate roundtrips without inventing a zero cost',()=>{
 const project=projectWithProvenance(provenance({estimatedMaxCostUsd:null}));
 const restored=deserializeShowProject(serializeShowProject(project));
 assert.equal(restored.assets[0].provenance.estimatedMaxCostUsd,null);
 assert.deepEqual(restored,project);
});

test('legacy schema-v1 assets remain unchanged and generated provenance roundtrips', () => {
  const legacy = addAudioReference(createNewShow(), 'legacy.wav');
  assert.deepEqual(deserializeShowProject(serializeShowProject(legacy)), legacy);
  assert.deepEqual(legacy.assets[0], { id: 'asset-1', name: 'legacy.wav' });

  const generated = projectWithProvenance();
  const restored = deserializeShowProject(serializeShowProject(generated));
  assert.equal(restored.schemaVersion, 1);
  assert.deepEqual(restored, generated);
  assert.deepEqual(restored.assets[0].provenance, provenance());
});

test('source line provenance is nullable when no script reference exists', () => {
  const project = addAudioReference(
    createNewShow({ id: 'show-unlinked-sfx', scriptText: '' }),
    'runq-sfx-req-sfx-001.wav',
    { provenance: provenance({ sourceLineId: null }) },
  );
  const restored = deserializeShowProject(serializeShowProject(project));
  assert.equal(restored.assets[0].provenance.sourceLineId, null);
});

test('addAudioReference clones provenance and rejects unsupported options', () => {
  const input = provenance();
  const project = projectWithProvenance(input);
  input.reviewedRegion.inMs = 999;
  input.prompt = 'mutated after import';
  assert.equal(project.assets[0].provenance.reviewedRegion.inMs, 125);
  assert.notEqual(project.assets[0].provenance.prompt, input.prompt);
  assert.notStrictEqual(project.assets[0].provenance, input);
  assert.notStrictEqual(project.assets[0].provenance.reviewedRegion, input.reviewedRegion);

  assert.throws(
    () => addAudioReference(createNewShow(), 'bad.wav', { unknown: true }),
    { code: 'INVALID_SHOW_PROJECT' },
  );
  assert.throws(
    () => addAudioReference(createNewShow(), 'bad.wav', null),
    { code: 'INVALID_SHOW_PROJECT' },
  );
});

test('normalization returns an independent provenance object graph', () => {
  const input = projectWithProvenance();
  const normalized = normalizeShowProject(input);
  normalized.assets[0].provenance.reviewedRegion.inMs = 400;
  normalized.assets[0].provenance.prompt = 'changed';
  assert.equal(input.assets[0].provenance.reviewedRegion.inMs, 125);
  assert.notEqual(input.assets[0].provenance.prompt, 'changed');
});

test('strictly rejects malformed SFX provenance and unknown fields', async t => {
  const cases = [
    ['unknown provenance field', value => { value.unknown = true; }],
    ['unknown reviewed-region field', value => { value.reviewedRegion.extra = 1; }],
    ['wrong origin', value => { value.origin = 'AI_AUDIO'; }],
    ['wrong provider', value => { value.provider = 'OTHER'; }],
    ['wrong model', value => { value.model = 'floating/latest'; }],
    ['unpinned revision', value => { value.modelRevision = 'main'; }],
    ['unsafe request id', value => { value.requestId = '../request'; }],
    ['invalid script reference', value => { value.sourceLineId = 'L0'; }],
    ['missing script reference', value => { value.sourceLineId = 'L99'; }],
    ['empty prompt', value => { value.prompt = '   '; }],
    ['oversized prompt', value => { value.prompt = 'x'.repeat(1001); }],
    ['negative seed', value => { value.seed = -1; }],
    ['non-integer seed', value => { value.seed = 1.5; }],
    ['duration below pilot range', value => { value.requestedDurationSeconds = 0; }],
    ['non-integer requested duration', value => { value.requestedDurationSeconds = 1.5; }],
    ['invalid digest', value => { value.sha256 = 'A'.repeat(64); }],
    ['zero generated duration', value => { value.generatedDurationSeconds = 0; }],
    ['excess generated duration', value => { value.generatedDurationSeconds = 13.001; }],
    ['invalid sample rate', value => { value.sampleRateHz = 15999; }],
    ['invalid channels', value => { value.channels = 3; }],
    ['zero byte length', value => { value.byteLength = 0; }],
    ['oversized byte length', value => { value.byteLength = 4 * 1024 * 1024 + 1; }],
    ['negative IN', value => { value.reviewedRegion.inMs = -1; }],
    ['empty region', value => { value.reviewedRegion.outMs = value.reviewedRegion.inMs; }],
    ['region after generated audio', value => { value.reviewedRegion.outMs = 5001; }],
    ['negative estimate', value => { value.estimatedMaxCostUsd = -0.01; }],
    ['invalid actual cost', value => { value.actualCostUsd = Number.NaN; }],
    ['non-canonical created time', value => { value.createdAt = '2026-10-28 10:00:00'; }],
    ['acceptance before creation', value => { value.acceptedAt = '2026-10-28T09:59:59.999Z'; }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const value = provenance();
      mutate(value);
      assert.throws(() => projectWithProvenance(value), {
        code: 'INVALID_SHOW_PROJECT',
      });
    });
  }
});

test('accepts documented provenance boundaries', () => {
  const value = provenance({
    modelRevision: 'b'.repeat(64),
    seed: 2147483647,
    requestedDurationSeconds: 12,
    generatedDurationSeconds: 13,
    sampleRateHz: 96000,
    channels: 1,
    byteLength: 4 * 1024 * 1024,
    reviewedRegion: { inMs: 0, outMs: 13000 },
    estimatedMaxCostUsd: 0,
    actualCostUsd: 0,
    acceptedAt: '2026-10-28T10:00:00.000Z',
  });
  assert.deepEqual(projectWithProvenance(value).assets[0].provenance, value);
});

test('portable ZIP preserves provenance and verifies it against original bytes', async () => {
  const project = projectWithProvenance();
  const archive = await exportPortableShow(
    project,
    new Map([['asset-1', fileFor()]]),
  );
  const restored = await importPortableShow(archive);
  assert.deepEqual(restored.project, project);
  assert.deepEqual(restored.project.assets[0].provenance, provenance());

  const changed = new TextEncoder().encode('RIFF different generated audio');
  await assert.rejects(
    exportPortableShow(project, new Map([['asset-1', fileFor(changed)]])),
    /provenance.*match/i,
  );

  const entries = readZipStore(archive);
  const document = JSON.parse(new TextDecoder().decode(entries.get('project.json')));
  document.assets[0].provenance.sha256 = 'f'.repeat(64);
  entries.set('project.json', new TextEncoder().encode(JSON.stringify(document)));
  const inconsistent = writeZipStore(
    [...entries].map(([name, bytes]) => ({ name, bytes })),
  );
  await assert.rejects(importPortableShow(inconsistent), /provenance.*match/i);
});
