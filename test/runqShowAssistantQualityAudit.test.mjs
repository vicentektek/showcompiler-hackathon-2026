import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyLocalGap,auditShowAssistantQuality} from '../tools/runq-show-assistant-quality-audit.mjs';
import {getStatefulConversationDefinitions,runStatefulConversations} from '../tools/runq-agent-stateful-conversations.mjs';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('quality audit degrades to NOT_RUN in a clean checkout without live evidence or ledger',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'runq-audit-'));
 try{
  const corpus=JSON.parse(readFileSync(new URL('../fixtures/qa/show-assistant-gauntlet-v2.json',import.meta.url),'utf8'));
  const turn=corpus.scenarios[0].turns[0];
  const offlinePath=join(dir,'offline.json');
  writeFileSync(offlinePath,JSON.stringify({results:[{id:turn.id,journey:corpus.scenarios[0].id,outcome:'LOCAL_GAP',observed:'NEEDS_AI'}]}));
  const report=await auditShowAssistantQuality({write:false,offlinePath,
   liveDir:join(dir,'missing-live'),ledgerPath:join(dir,'missing-ledger.json')});
  assert.equal(report.mode,'READ_ONLY_NO_PAID_CALLS');
  assert.equal(report.liveEvidence.status,'NOT_RUN');
  assert.match(report.liveEvidence.reason,/NO_LIVE_GAUNTLET_REPORT/);
  assert.equal(report.semanticReview.status,'NOT_RUN');
  assert.equal(report.reservationReconciliation.status,'NOT_RUN');
  assert.equal(report.localGaps.total,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('LOCAL_GAP taxonomy separates ambiguity, missing local functions, AI reasoning and unavailable capabilities',()=>{
 assert.equal(classifyLocalGap({prompt:'Move the next cue before that one',expect:'C'},{journey:'x',observed:'NEEDS_AI'}).category,'LEGITIMATE_AMBIGUITY');
 assert.equal(classifyLocalGap({prompt:'Create cue Rain',expect:'P'},{journey:'x',observed:'CLARIFY'}).category,'MISSING_LOCAL_FUNCTION');
 assert.equal(classifyLocalGap({prompt:'Why is rain theatrically necessary?',expect:'A'},{journey:'x',observed:'NEEDS_AI'}).category,'REQUIRES_AI_REASONING');
 assert.equal(classifyLocalGap({prompt:'Can you promise independent PFL?',expect:'A'},{journey:'x',observed:'NEEDS_AI'}).category,'NOT_IMPLEMENTED_CAPABILITY');
});
test('routine npm test strips paid-provider credentials before spawning the suite',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 const runner=readFileSync(new URL('../tools/run-offline-tests.mjs',import.meta.url),'utf8');
 assert.equal(pkg.scripts.test,'node tools/run-offline-tests.mjs');
 for(const key of ['MODEL_API_KEY','BASETEN_API_KEY','MODAL_PROXY_TOKEN_SECRET'])
  assert.match(runner,new RegExp("'"+key+"'"));
 assert.match(runner,/delete env\[key\]/);
});
test('five real stateful conversations contain 25-50 turns and cover every lifecycle boundary',async()=>{
 const definitions=getStatefulConversationDefinitions();
 assert.equal(definitions.length,5);
 assert.ok(definitions.every(item=>item.turns.length>=25&&item.turns.length<=50));
 const report=await runStatefulConversations({write:false});
 assert.equal(report.conversations,5);assert.equal(report.turns,150);
 const events=report.reports.flatMap(row=>row.events.map(event=>event.event));
 for(const required of ['APPLY','REJECT','CANCEL','UNDO','STALE_AFTER_MANUAL_EDIT','REPLACE_PROJECT'])
  assert.ok(events.includes(required),required);
 assert.ok(report.reports.every(row=>row.paidRequests===0&&row.transportCalls===0));
});
