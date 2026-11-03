import test from 'node:test';
import assert from 'node:assert/strict';
import {buildExhaustiveCorpus} from './fixtures/runq-evals/corpus.mjs';
import {evaluateExhaustiveScript,evaluateExhaustiveDialogue,evaluateCoreJourney} from '../tools/runq-evals-offline.mjs';

const corpus=buildExhaustiveCorpus();
test('100 scripts, 102 conversations, 18 journeys are original, paired, reproducible and split without leakage',()=>{
 assert.equal(corpus.scripts.length,100);assert.equal(corpus.dialogues.length,102);
 assert.equal(corpus.journeys.length,18);
 assert.deepEqual(buildExhaustiveCorpus(),corpus);
 for(const rows of [corpus.scripts,corpus.dialogues]){
  assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
  assert.equal(rows.filter(r=>r.language==='es').length,rows.length/2);
  for(const group of new Set(rows.map(r=>r.scenarioGroup))){
   const pair=rows.filter(r=>r.scenarioGroup===group);
   assert.equal(new Set(pair.map(r=>r.split)).size,1);
  }
 }
 assert.equal(new Set(corpus.scripts.map(r=>r.scriptText)).size,100);
 assert.equal(new Set(corpus.dialogues.map(r=>JSON.stringify(r.turns))).size,102);
 assert.ok(corpus.dialogues.every(r=>!r.automaticGoAllowed&&!r.automaticCommitAllowed&&!r.paidCallAllowedByFixture));
 assert.ok(corpus.scripts.some(r=>r.scriptText.split('\n').length>200));
 assert.ok(corpus.scripts.filter(r=>r.negativeControl).every(r=>r.expected.length===0));
});
test('all script references and request windows are exercised, with independent deliberately wrong event controls',()=>{
 const rows=corpus.scripts.map(evaluateExhaustiveScript);
 assert.equal(rows.filter(r=>r.status==='PASS').length,100);
 assert.ok(rows.reduce((n,r)=>n+r.mutationsRejected,0)>=400);
 assert.ok(rows.some(r=>r.windows>1));
});
test('long conversations retain project-scoped pending intent without widening network history',()=>{
 const rows=corpus.dialogues.filter(r=>r.category==='long-context').map(evaluateExhaustiveDialogue);
 assert.equal(rows.length,6);
 assert.ok(rows.every(r=>r.status==='PASS'&&r.observedStatus==='PLAN'));
 assert.ok(rows.every(r=>r.historyTurns>8&&r.outboundHistoryTurns===8&&r.providerRequests===0));
});
test('editing fade on an unresolved cue produces a validated local plan without execution',()=>{
 const row=evaluateExhaustiveDialogue(corpus.dialogues.find(r=>r.category==='fade'));
 assert.equal(row.status,'PASS');
 assert.equal(row.planError,null);
});
test('18 planned journeys exercise real core actions without mislabelling browser or ZIP execution',()=>{
 const rows=corpus.journeys.map(evaluateCoreJourney);
 assert.equal(rows.length,18);
 assert.ok(rows.every(r=>r.coreStatus==='PASS'&&r.browserStatus==='NOT_RUN'&&r.trace.length>0));
 assert.ok(rows.find(r=>r.name==='zip-reopen').limitations.includes('ZIP_NOT_RUN_JSON_PERSISTENCE_ONLY'));
});
