import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {acquireGlobalSpendLedger} from '../src/qa/globalSpendLedger.mjs';
import {CAMPAIGN_POLICY} from '../src/qa/campaignPolicy.mjs';
import {createSfxJobStore} from '../src/core/sfxJobStore.mjs';
import {parseLiveOptions} from '../tools/metaSeminarEval.mjs';
import {createAppServer} from '../tools/dev-server.mjs';
import {validateAudioBatch,limitAudioBatch} from '../src/core/showPreparation.mjs';
import {createCampaignFetch} from '../tools/campaignFetch.mjs';

async function directory(t) {
 const dir=await mkdtemp(join(tmpdir(),'runq-unlimited-'));
 t.after(()=>rm(dir,{recursive:true,force:true})); return dir;
}
test('Meta and Modal ignore historical campaign caps while preserving provider history',async t=>{
 const file=join(await directory(t),'ledger.json');
 const old={schemaVersion:1,authorizationStatus:'LOCAL_OPERATOR_APPROVED',campaignId:'test-unlimited',
  policyRevision:CAMPAIGN_POLICY.revision,totalCapUsd:100,capsUsd:{...CAMPAIGN_POLICY.capsUsd},
  reservations:[{requestId:'old-request',runId:'old-run',provider:'meta',amountMicros:65e6,status:'RESERVED'}]};
 for(const [provider,count] of [['meta',400],['modal',100]]) {
  for(let n=0;n<count;n++)old.reservations.push({requestId:`old-${provider}-${n}`,runId:'old-run',provider,amountMicros:1,status:'UNKNOWN'});
 }
 await writeFile(file,JSON.stringify(old));
 const ledger=await acquireGlobalSpendLedger({file});
 try {
  for(const provider of ['meta','modal']) assert.equal((await ledger.reserve({requestId:'new-'+provider,runId:'new-run',provider,estimatedMaximumUsd:100})).accepted,true);
  assert.equal((await ledger.reserve({requestId:'no-baseten',runId:'new-run',provider:'baseten',estimatedMaximumUsd:1})).accepted,false);
 } finally {await ledger.close();}
 assert.deepEqual(JSON.parse(await readFile(file,'utf8')).reservations[0],old.reservations[0]);
 const reopened=await acquireGlobalSpendLedger({file}); await reopened.close();
 let calls=0;
 const transport=createCampaignFetch('meta',{
  ledgerFactory:()=>acquireGlobalSpendLedger({file}),
  fetchImpl:async()=>{calls++;return {ok:true};},
 });
 await transport('https://api.meta.ai/v1/chat/completions',{method:'POST',body:JSON.stringify({
  model:'muse-spark-1.3',stream:false,store:false,max_completion_tokens:256,messages:[],
 })});
 assert.equal(calls,1);
});
test('Modal manual journal accepts requests beyond old daily count without cost configuration',async t=>{
 const store=createSfxJobStore({directory:await directory(t)});
 for(let n=0;n<30;n++) {
  const request={requestId:'req-'+n,authorizationId:'auth-'+n,kind:'SFX',prompt:'A bell',durationSeconds:2,
   modelCandidate:'stabilityai/stable-audio-3-small-sfx',seed:42};
  await store.reserve(request,{confirm:true});
  await assert.rejects(store.reserve(request,{confirm:true}),{code:'SFX_DUPLICATE'});
  await store.update(request.requestId,'QUEUED',{remoteJobId:'remote-'+n});
  await store.update(request.requestId,'FAILED');
 }
 assert.equal((await store.list()).jobs.length,30);
});
test('seminar CLI no longer imposes the historical two dollar cap',()=>{
 assert.equal(parseLiveOptions(['--budget-usd','10000']).budgetUsd,10000);
});

test('real local SFX route accepts manual requests without cost settings or shared budget reservation',async t=>{
 const store=createSfxJobStore({directory:await directory(t)});
 let calls=0;
 const server=createAppServer({sfxStore:store,
  sfxConfig:()=>({enabled:true,modelRevision:'a'.repeat(40)}),
  reserveCampaign:async()=>{throw Error('OBSOLETE_BUDGET_GATE');},
  sfxPilotClient:{start:async()=>{calls++;return {jobId:'mock-job'};}}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin='http://127.0.0.1:'+server.address().port;
 const status=await (await fetch(origin+'/api/sfx/status')).json();
 assert.equal(status.enabled,true);
 assert.equal(status.budgetLimitsDisabled,true);
 assert.equal(status.dailyBudgetUsd,null);
 assert.equal(status.maxDailyStarts,null);
 const input={requestId:'manual-request',authorizationId:'manual-approval',kind:'SFX',prompt:'A bell',durationSeconds:2,confirmed:true};
 const post=()=>fetch(origin+'/api/sfx/jobs',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(input)});
 assert.equal((await post()).status,202);
 assert.equal((await post()).status,409);
 assert.equal(calls,1);
 const items=Array.from({length:50},()=>({draft:{kind:'SFX',prompt:'Bell',durationSeconds:2}}));
 validateAudioBatch(items,status,true);
 assert.equal(limitAudioBatch(items,status).items.length,50);
});
