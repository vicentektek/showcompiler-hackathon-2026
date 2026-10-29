import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { parseEvalArguments, makePlan, classifyArtifact, browserChecks } from '../tools/eval-commands.mjs';

const catalog = JSON.parse(await readFile(new URL('./fixtures/eval-campaign-catalog.json', import.meta.url),'utf8'));

test('catalog schema: unique IDs, explicit provenance, required properties', () => {
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.state, 'PLANNING_NOT_TEST_RESULTS');
  assert.ok(catalog.cases.length >= 80);
  const ids = new Set();
  for (const x of catalog.cases) {
    assert.match(x.id, /^(?:CORE|AI|SFX|LIB|EDIT|OP|VOICE|PERSIST|UX|VIDEO)-\d{3}$/);
    assert.equal(ids.has(x.id), false, 'duplicate scenario id '+x.id);
    ids.add(x.id);
    assert.ok(['P0','P1','P2'].includes(x.priority), x.id);
    assert.ok(['offline','meta','baseten','modal','voice'].includes(x.provider), x.id);
    assert.ok(['existing','planned','manual'].includes(x.automation), x.id);
    assert.equal(typeof x.fixture, 'string', x.id);
    assert.ok(x.fixture.length > 0, x.id);
    assert.equal(typeof x.metric, 'string', x.id);
    assert.ok(x.metric.length >= 8, x.id);
    assert.ok(x.videoShot === null || /^S(?:0[1-9]|1[01])$/.test(x.videoShot), x.id);
  }
  assert.equal(ids.size, catalog.cases.length);
});

test('all 11 planned video storyboards have acceptance criteria', () => {
  const shots = new Set(catalog.cases.map(c=>c.videoShot).filter(Boolean));
  for(let i=1;i<=11;i++) assert.ok(shots.has('S'+String(i).padStart(2,'0')));
  const p0 = catalog.cases.filter(c=>c.priority==='P0');
  assert.ok(p0.length>=30);
});

test('AI plans are gated: 100 attempts remain zero executed', () => {
  for (const provider of ['meta','baseten','modal','voice']) {
    const settings = parseEvalArguments('ai',['--provider',provider,'--runs','100']);
    assert.equal(settings.executeOffline, false);
    const result=makePlan(settings,catalog);
    assert.equal(result.requestedRuns,100);
    assert.equal(result.completedRuns,0);
    assert.equal(result.providerCalls,0);
    assert.equal(result.state,'PLAN_ONLY_NO_EXECUTION');
    assert.ok(result.scenarios.every(item=>typeof item.id==='string'));
  }
});

test('full campaign stays plan-only unless --execute-offline is explicitly specified', () => {
  const p=parseEvalArguments('full',['--runs','20']);
  assert.deepEqual(p,{mode:'full',provider:null,runs:20,executeOffline:false});
  const plan=makePlan(p,catalog);
  assert.equal(plan.completedRuns,0);
  assert.equal(plan.providerCalls,0);
  assert.equal(plan.requestedRuns,20);
  assert.ok(plan.totalProposedScenarioExecutions>20);
  const explicit=parseEvalArguments('full',['--runs','2','--execute-offline']);
  assert.equal(explicit.executeOffline,true);
  assert.equal(explicit.runs,2);
});

test('offline mode defaults to planning, even when no options are provided', () => {
  assert.deepEqual(parseEvalArguments('offline'),{
    mode:'offline',provider:null,runs:1,executeOffline:false,
  });
  assert.equal(makePlan(parseEvalArguments('offline'),catalog).completedRuns,0);
});

test('paid or unknown CLI flags fail closed across modes', () => {
  for (const mode of ['offline','full','ai','report','video']) {
    for (const arg of ['--live','--ack-paid','--execute','--api-key','--budget-usd']) {
      assert.throws(()=>parseEvalArguments(mode,[arg]),/Opcion no permitida/);
    }
  }
});

test('AI mode never accepts offline execution flag', () => {
  assert.throws(()=>parseEvalArguments('ai',['--provider','meta','--execute-offline']));
  assert.throws(()=>parseEvalArguments('ai',['--provider','unknown']));
  assert.throws(()=>parseEvalArguments('ai',[]));
  assert.throws(()=>parseEvalArguments('ai',['--provider','meta','--provider','baseten']));
});

test('run counts must be bounded, integral, finite, and positive', () => {
  for(const bad of ['0','-1','NaN','Infinity','1.1','1001','abc']) {
    assert.throws(()=>parseEvalArguments('ai',['--provider','meta','--runs',bad]),bad);
  }
  for(const bad of ['21','0','-100','1.5','1e309']) {
    assert.throws(()=>parseEvalArguments('full',['--runs',bad]),bad);
  }
  assert.throws(()=>parseEvalArguments('offline',['--runs']));
  assert.throws(()=>parseEvalArguments('ai',['--provider','meta','--runs','--live']));
  assert.throws(()=>parseEvalArguments('video',['--runs','1']));
  assert.throws(()=>parseEvalArguments('report',['--runs','1']));
});

test('video plans identify capture needs, never mark a shot as certified', () => {
  const plan=makePlan(parseEvalArguments('video'),catalog);
  assert.ok(plan.scenarios.length>10);
  assert.equal(plan.state,'PLAN_ONLY_NO_EXECUTION');
  assert.equal(plan.completedRuns,0);
  assert.ok(plan.scenarios.some(x=>x.videoShot==='S08'));
  assert.ok(!('approved' in plan));
});

test('reports never infer Meta or Baseten quality from the presence of a file', () => {
  const synthetic=classifyArtifact({
    fixtureProvenance:'HAND_AUTHORED_ILLUSTRATIVE_PREDICTIONS_NOT_META_OUTPUT',
    f1:1,accuracy:1,
  },'artifacts/cue-qa/report.json');
  assert.equal(synthetic.present,true);
  assert.equal(synthetic.qualityVerified,false);
  assert.match(synthetic.provenanceLabel,/HAND_AUTHORED/);
  const fake=classifyArtifact({ f1:1,sourceType:'meta_live'},'fake.json');
  assert.equal(fake.qualityVerified,false);
  assert.ok(fake.sha256.match(/^[0-9a-f]{64}$/));
});

test('browser checks point to a bounded documented set of real smoke scripts', () => {
  assert.equal(browserChecks.length,7);
  assert.equal(new Set(browserChecks).size, browserChecks.length);
  for(const x of browserChecks) assert.match(x,/^tools\/[a-z0-9-]+\.mjs$/);
});

test('existing test scenarios refer to real checked-in fixtures or documented test glob', async () => {
  const existing=catalog.cases.filter(x=>x.automation==='existing');
  assert.ok(existing.length>10);
  for (const x of existing) {
    if (x.fixture==='test/*.test.mjs') continue; // Node test discovery glob.
    assert.ok(!x.fixture.includes('..'), x.id + ' should not traverse directories');
    await assert.doesNotReject(access(new URL('../'+x.fixture,import.meta.url)), x.id + ': '+x.fixture);
  }
});
