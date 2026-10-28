import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, rm as unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLevel1Corpus, validateLevel1Corpus, toStageCueGold, summarizeLevel1Corpus } from '../tools/level1Corpus.mjs';
import { evaluateStageEventCases } from '../src/core/stageCueQa.mjs';
import { planScriptAnalysis } from '../src/core/sceneAnalysis.mjs';
import { runLevel1Review } from '../tools/level1-review.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CASE_IDS = [
  'marina-house', 'pastel-company', 'bosque-narrado', 'gala-estelar', 'obertura-viva',
  'glass-river-dance', 'circo-cuchillos', 'keynote-rundown', 'monologo-farola', 'despedida-mixta',
];
const SHOW_TYPES = ['play', 'comedy', 'children-theatre', 'gala', 'musical', 'dance', 'circus', 'corporate', 'monologue', 'mixed-programme'];

const manifestSnapshot = JSON.parse(
  await readFile(join(ROOT, 'fixtures/qa/level1/corpus-v1.json'), 'utf8'));
const scriptsById = Object.fromEntries(
  await Promise.all(manifestSnapshot.cases.map(async entry => [entry.id,
    await readFile(join(ROOT, 'fixtures/qa/level1', entry.id + '.txt'), 'utf8')])));
const corpus = validateLevel1Corpus({manifest: manifestSnapshot, scriptsById});
const byId = Object.fromEntries(corpus.cases.map(item => [item.id, item]));

function tamper(mutate) {
  const manifest = structuredClone(manifestSnapshot);
  mutate(manifest);
  return () => validateLevel1Corpus({manifest, scriptsById});
}

test('level1 corpus loads, stays provisional and matches the level 1 contract', () => {
  assert.equal(corpus.corpus, 'RUNQ_LEVEL1_EVAL_CORPUS');
  assert.equal(corpus.humanReviewStatus, 'PROVISIONAL_UNREVIEWED');
  assert.equal(corpus.level.index, 1);
  assert.equal(corpus.level.name, 'Explicit versus false positives');
  assert.equal(corpus.level.gate.kind, 'EXACT_CASES');
  assert.equal(corpus.level.gate.exactCasesRequired, 10);
  assert.equal(corpus.cases.length, 10);
  assert.deepEqual(corpus.caseOrder, CASE_IDS);
  for (const item of corpus.cases) {
    assert.equal(item.reviewStatus, 'PROVISIONAL_UNREVIEWED');
    assert.equal(item.tuningUse, item.pool === 'development');
    assert.ok(item.expected.length >= 1, item.id + ' keeps at least one expected event');
    for (const event of item.expected) {
      assert.deepEqual(Object.keys(event).sort(), ['basis', 'cueKind', 'lineId', 'transport']);
      assert.equal(event.basis, 'EXPLICIT');
      assert.equal((event.transport === 'SILENCE') === (event.cueKind === 'SILENCE'), true);
    }
    for (const lineId of item.forbiddenPlayLineIds) assert.match(lineId, /^L[1-9]\d*$/);
    assert.ok(item.justifications.expected.length === item.expected.length);
    assert.ok(item.justifications.negative.length === item.forbiddenPlayLineIds.length);
  }
  const totals = summarizeLevel1Corpus(corpus);
  assert.equal(totals.cases, 10);
  assert.equal(totals.windows, 15);
  assert.equal(totals.expectedEvents, 34);
  assert.equal(totals.forbiddenPlayLines, 54);
  assert.deepEqual(totals.languages, {es: 8, en: 2});
  assert.deepEqual(totals.pools, {development: 6, qualification: 4});
  assert.deepEqual([...new Set(corpus.cases.map(item => item.type))].sort(), [...SHOW_TYPES].sort());
});

test('window accounting matches the deterministic offline planner', () => {
  for (const item of corpus.cases) {
    const plan = planScriptAnalysis(item.scriptText);
    assert.equal(plan.coverage.totalLines, item.lineCount, item.id);
    assert.equal(plan.coverage.windowCount, item.sceneWindowCount, item.id);
    assert.equal(plan.coverage.uncoveredLineIds.length, 0, item.id);
    assert.deepEqual(item.windowIds, plan.windows.map(window => window.id), item.id);
    const covered = new Set(plan.windows.flatMap(window => window.coreLines.map(line => line.id)));
    for (const lineId of [...item.expected.map(event => event.lineId), ...item.forbiddenPlayLineIds]) {
      assert.ok(covered.has(lineId), item.id + ' annotation ' + lineId + ' must sit inside a window');
    }
  }
  assert.ok(corpus.cases.filter(item => item.sceneWindowCount > 1).length >= 5);
  assert.ok(corpus.cases.filter(item => item.sceneWindowCount === 1).length >= 2);
});

test('designed traps exist verbatim in the scripts', () => {
  assert.match(byId['monologo-farola'].scriptText, /En el sueño oí una campana/);
  assert.match(byId['monologo-farola'].scriptText, /No hay música esta noche/);
  assert.match(byId['bosque-narrado'].scriptText, /NO reproducimos la música de la cueva/);
  assert.match(byId['pastel-company'].scriptText, /resbala con el jabón real del suelo/);
  assert.match(byId['pastel-company'].scriptText, /no se reproduce ninguna risa grabada/);
  assert.match(byId['marina-house'].scriptText, /El teléfono real del atrezo suena/);
  assert.match(byId['circo-cuchillos'].scriptText, /SILENCIO ABSOLUTO/);
  assert.match(byId['despedida-mixta'].scriptText, /se acabó el archivo/);
});

test('duplicate case ids are rejected', () => {
  assert.throws(tamper(manifest => { manifest.cases[1].id = manifest.cases[0].id; }),
    TypeError, /Duplicate level1 case id/);
});

test('duplicate expected events and duplicate forbidden lines are rejected', () => {
  assert.throws(tamper(manifest => { manifest.cases[0].expected.push({...manifest.cases[0].expected[0]}); }),
    TypeError, /Duplicate level1 expected event/);
  assert.throws(tamper(manifest => {
    manifest.cases[0].forbiddenPlayLineIds.push(manifest.cases[0].forbiddenPlayLineIds[0]);
  }), TypeError, /Duplicate level1 forbidden line/);
});

test('references must exist in scripts and windows must match the manifest', () => {
  assert.throws(tamper(manifest => { manifest.cases[0].forbiddenPlayLineIds.push('L77'); }),
    TypeError, /Forbidden level1 line outside script/);
  assert.throws(tamper(manifest => {
    manifest.cases[0].expected.push({lineId: 'L99', transport: 'PLAY', cueKind: 'FX', basis: 'EXPLICIT'});
  }), TypeError, /Expected level1 event outside script/);
  assert.throws(tamper(manifest => { manifest.cases[3].sceneWindowCount = 2; }),
    TypeError, /Scene window accounting mismatch/);
});

test('conflicting gold semantics are rejected', () => {
  assert.throws(tamper(manifest => {
    manifest.cases[1].expected.push({lineId: 'L4', transport: 'PLAY', cueKind: 'FX', basis: 'EXPLICIT'});
  }), TypeError, /Expected PLAY on a forbidden line/);
  assert.throws(tamper(manifest => { manifest.cases[8].expected[0].cueKind = 'FX'; }),
    TypeError, /SILENCE transport and SILENCE cueKind must be paired/);
  assert.throws(tamper(manifest => { manifest.cases[0].expected[0].basis = 'SUGGESTED'; }),
    TypeError, /must be EXPLICIT/);
});

test('justifications are complete and bounded', () => {
  assert.throws(tamper(manifest => {
    manifest.cases[0].justifications.negative = manifest.cases[0].justifications.negative.slice(1);
  }), TypeError, /Incomplete justifications in negative justifications/);
  assert.throws(tamper(manifest => {
    manifest.cases[0].justifications.expected = manifest.cases[0].justifications.expected.slice(1);
  }), TypeError, /Incomplete justifications in expected justifications/);
  assert.throws(tamper(manifest => {
    manifest.cases[1].justifications.negative[0].text = 'gag';
  }), TypeError, /Invalid negative justifications text/);
  assert.throws(tamper(manifest => {
    manifest.cases[1].justifications.negative[0].text = 'x'.repeat(420);
  }), TypeError, /Invalid negative justifications text/);
  assert.throws(tamper(manifest => {
    manifest.cases[0].justifications.expected[0].lineId = 'L6';
  }), TypeError, /Justification line outside its class/);
});

test('strict schema consistency for cases and manifest', () => {
  assert.throws(tamper(manifest => { manifest.cases[2].mystery = true; }),
    TypeError, /Unexpected key mystery in level1 case/);
  assert.throws(tamper(manifest => { manifest.cases[2].documentKind = 'novel'; }),
    TypeError, /Invalid level1 documentKind/);
  assert.throws(tamper(manifest => { manifest.cases[2].pool = 'bogus'; }),
    TypeError, /Invalid level1 pool/);
  assert.throws(tamper(manifest => { manifest.cases[4].tuningUse = true; }),
    TypeError, /tuningUse must match the pool policy/);
  assert.throws(tamper(manifest => { manifest.cases[2].difficulty.rating = 0; }),
    TypeError, /Invalid level1 difficulty rating/);
  assert.throws(tamper(manifest => { manifest.cases[2].reviewStatus = 'HUMAN_REVIEWED'; }),
    TypeError, /PROVISIONAL_UNREVIEWED/);
  assert.throws(tamper(manifest => { manifest.humanReviewStatus = 'HUMAN_REVIEWED'; }),
    TypeError, /PROVISIONAL_UNREVIEWED/);
  assert.throws(tamper(manifest => { manifest.level.gate.exactCasesRequired = 9; }),
    TypeError, /exactly 10 exact cases/);
  assert.throws(tamper(manifest => {
    [manifest.caseOrder[0], manifest.caseOrder[1]] = [manifest.caseOrder[1], manifest.caseOrder[0]];
  }), TypeError, /caseOrder must list the exact case ids/);
  assert.throws(tamper(manifest => {
    manifest.cases[1].file = 'fixtures/qa/level2/pastel-company.txt';
  }), TypeError, /Unsafe or mismatched level1 script file/);
});

test('the corpus feeds the offline scorer without any provider claim', () => {
  const gold = toStageCueGold(corpus);
  const empty = evaluateStageEventCases(gold, {
    version: 1,
    provenance: 'TEST_EMPTY_PREDICTIONS_NO_PROVIDER',
    predictionsByCase: {},
  });
  assert.equal(empty.modelQualityMeasured, false);
  assert.equal(empty.summary.expectedEvents, 34);
  assert.equal(empty.summary.falseNegatives, 34);
  assert.equal(empty.summary.forbiddenPlay, 0);
  assert.match(empty.goldProvenance, /HUMAN_REVIEW_STATUS_PROVISIONAL_UNREVIEWED$/);

  const pastel = byId['pastel-company'];
  const monologo = byId['monologo-farola'];
  const scored = evaluateStageEventCases(gold, {
    version: 1,
    provenance: 'TEST_SHAPED_PREDICTIONS_NO_PROVIDER',
    predictionsByCase: {
      [pastel.id]: [
        {...pastel.expected[0]},
        {lineId: 'L9', transport: 'PLAY', cueKind: 'FX', basis: 'EXPLICIT'},
        {lineId: 'L2', transport: 'PLAY', cueKind: 'FX', basis: 'EXPLICIT'},
      ],
      [monologo.id]: monologo.expected.map(event => ({...event})),
    },
  });
  const pastelResult = scored.prioritizedCases.find(entry => entry.id === pastel.id);
  const monologoResult = scored.prioritizedCases.find(entry => entry.id === monologo.id);
  assert.equal(pastelResult.truePositives, 1);
  assert.equal(pastelResult.falsePositives, 2);
  assert.equal(pastelResult.falseNegatives, 1);
  assert.equal(pastelResult.forbiddenPlay, 2);
  assert.equal(monologoResult.truePositives, 1);
  assert.equal(monologoResult.falsePositives, 0);
  assert.equal(monologoResult.falseNegatives, 0);
  assert.equal(monologoResult.truePositives === monologoResult.expectedEvents &&
    monologoResult.expectedEvents > 0, true);

  assert.throws(() => evaluateStageEventCases(gold, {
    version: 1, provenance: 'TEST_UNKNOWN_CASE_NO_PROVIDER',
    predictionsByCase: {unknown: []},
  }), TypeError, /unknown case/);
});

test('the offline review command renders the human review draft', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'runq-level1-'));
  try {
    const review = await runLevel1Review({outputDir: join(temp, 'out')});
    assert.equal(review.totals.humanReviewStatus, 'PROVISIONAL_UNREVIEWED');
    const md = await readFile(review.mdPath, 'utf8');
    const json = JSON.parse(await readFile(review.jsonPath, 'utf8'));
    assert.equal(json.kind, 'RUNQ_LEVEL1_CORPUS_REVIEW_DRAFT');
    assert.equal(json.claim, 'OFFLINE_HUMAN_REVIEW_DRAFT_NO_MODEL_RESULTS');
    assert.match(md, /PROVISIONAL_UNREVIEWED/);
    assert.match(md, /marina-house/);
    assert.match(md, /No provider calls, no credentials, no audio transport/);
    assert.match(md, /must never\s+be used for prompt optimization/);
    assert.match(md, /APROBAR/);
    for (const id of ['pastel-company', 'monologo-farola', 'circo-cuchillos']) {
      assert.ok(md.includes('## ' + id + ' —'), 'review md includes case ' + id);
    }
    assert.match(md, /L2\s{2}\(SONIDO 7: reproducir el trueno largo grabado, volumen medio\.\)/);
    assert.equal(md.split('### Operator sign-off').length - 1, 10);
  } finally {
    await rm(temp, {recursive: true, force: true});
  }
});

test('the reader reports missing script files cleanly on disk', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'runq-level1-disk-'));
  try {
    const root = join(temp, 'repo');
    await mkdir(root, {recursive: true});
    await cp(join(ROOT, 'fixtures'), join(root, 'fixtures'), {recursive: true});
    const diskCorpus = await readLevel1Corpus({rootDir: root});
    assert.equal(diskCorpus.cases.length, 10);
    await unlink(join(root, 'fixtures/qa/level1/gala-estelar.txt'));
    await assert.rejects(() => readLevel1Corpus({rootDir: root}),
      TypeError, /Missing level1 script file for gala-estelar/);
  } finally {
    await rm(temp, {recursive: true, force: true});
  }
});
