import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {acquireAgentEvalBudget} from '../tools/agentLiveBudget.mjs';
import {parseAgentLiveOptions,getAgentLiveScenario,
 judgeAgentLiveReply} from '../tools/runq-agent-live-eval.mjs';

test('each paid intent category has independently generated Spanish AND English cases',()=>{
 const cases=Array.from({length:60},(_,i)=>getAgentLiveScenario(i,20261031));
 const groups=new Map();
 for(const item of cases){
  const languages=groups.get(item.kind)??new Set();
  languages.add(item.language);groups.set(item.kind,languages);
  assert.ok(item.project.scriptText.includes(item.language==='es'?'Esta noche':'Tonight'));
  assert.match(item.id,/^paid-\d+$/);
 }
 assert.equal(groups.size,10);
 for(const [kind,languages] of groups)
  assert.deepEqual([...languages].sort(),['en','es'],kind);
 assert.equal(getAgentLiveScenario(0).kind,getAgentLiveScenario(1).kind);
 assert.notEqual(getAgentLiveScenario(0).language,getAgentLiveScenario(1).language);
 assert.notEqual(getAgentLiveScenario(20,20261031).id,
  getAgentLiveScenario(0,20261031).id);
});

test('start-index makes consecutive paid batches disjoint; invalid ranges fail closed',()=>{
 const first=parseAgentLiveOptions(['--cases','20','--providers','meta,baseten',
  '--start-index','0','--seed','20261031']);
 const next=parseAgentLiveOptions(['--cases','180','--providers','meta,baseten',
  '--start-index','10','--seed','20261031']);
 const ids=cfg=>new Set(Array.from({length:cfg.cases/cfg.providers.length},
  (_,i)=>getAgentLiveScenario(cfg.startIndex+i,cfg.seed).id));
 const a=ids(first),b=ids(next);
 assert.equal(a.size,10);assert.equal(b.size,90);
 assert.equal([...a].filter(id=>b.has(id)).length,0);
 assert.throws(()=>parseAgentLiveOptions(['--start-index','-1']),/INVALID_AGENT_LIVE_EVAL_CONFIG/);
 assert.throws(()=>parseAgentLiveOptions(['--start-index','100001']),/INVALID_AGENT_LIVE_EVAL_CONFIG/);
});

test('agent evaluator does not grade empty generic ANSWER as correct summary',()=>{
 const show=getAgentLiveScenario(10); // index 10 = summary, Spanish
 assert.equal(show.kind,'summary');
 const generic=judgeAgentLiveReply(show,{status:'ANSWER',
  message:'This show looks good.',operations:[]});
 assert.equal(generic.correct,false);
 assert.equal(generic.valid,true);
 const grounded=judgeAgentLiveReply(show,{status:'ANSWER',
  message:'Cues: '+show.project.cues.map(c=>c.label).join('; '),operations:[]});
 assert.equal(grounded.correct,true);
 const unsafe=judgeAgentLiveReply(show,{status:'ANSWER',
  message:'I made the changes',operations:[{op:'DELETE_CUE'}]});
 assert.equal(unsafe.valid,false);
});

test('open-ended sound advice is explicitly human-reviewed, not auto-scored',()=>{
 const show=getAgentLiveScenario(18); // audio Spanish
 assert.equal(show.kind,'audio');
 const decision=judgeAgentLiveReply(show,{status:'ANSWER',
  message:'Add a short natural ambience with a soft fade.',operations:[]});
 assert.equal(decision.valid,true);
 assert.equal(decision.correct,null);
 assert.equal(decision.reviewRequired,true);
});

test('case reservations survive process restart and reject duplicate paid identities',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'runq-agent-dedup-'));
 const file=join(dir,'paid-ledger.json');
 try{
  const first=await acquireAgentEvalBudget({file,limitUsd:0.60});
  assert.equal(await first.reserveCase(0.15,'r2-20261031-0-meta'),'RESERVED');
  assert.equal(await first.reserveCase(0.15,'r2-20261031-0-meta'),'DUPLICATE');
  assert.equal(await first.reserveCase(0.15,'r2-20261031-0-baseten'),'RESERVED');
  assert.equal(first.committedUsd(),0.30);
  await first.close();
  const second=await acquireAgentEvalBudget({file,limitUsd:0.60});
  assert.equal(await second.reserveCase(0.15,'r2-20261031-0-meta'),'DUPLICATE');
  assert.equal(await second.reserveCase(0.15,'r2-20261031-1-meta'),'RESERVED');
  assert.equal(await second.reserveCase(0.20,'r2-20261031-2-meta'),'BUDGET_CAP');
  await second.close();
  const data=JSON.parse(await readFile(file,'utf8'));
  assert.equal(data.records.length,3);
  assert.equal(new Set(data.records.map(r=>r.caseKey)).size,3);
 }finally{await rm(dir,{recursive:true,force:true});}
});
