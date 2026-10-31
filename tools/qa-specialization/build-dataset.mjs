#!/usr/bin/env node
// Builds the specialization corpus from the frozen, ORIGINAL theatre-real scenes.
// Targets are deterministic reference plans in the real agent wire format, verified by the real judge
// and agentCore on a project copy. They are NOT human reviewed: review_status stays "pending" and
// allow_training stays false until a person approves each row.
import {writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildCases,buildSceneProject} from '../theatreEvalCases.mjs';
import {SCENES} from '../../fixtures/qa/theatre-real/scenes.mjs';
import {buildAgentContext,fitAgentContext} from '../../src/core/agentCore.mjs';
import {buildReferenceTarget,verifyTarget,validateWireTarget} from './contract.mjs';

// Partition by SCENE (a scene never straddles splits). Holdout stays the frozen holdout of the real eval.
export const splitOf=scene=>scene.split==='holdout'?'holdout':/-0[78]$/.test(scene.id)?'dev':'train';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');

export function buildCorpus(){
  const rows=[],skipped={};
  for(const c of buildCases()){
    const scene=SCENES.find(s=>s.id===c.scene);
    const project=buildSceneProject(scene);
    const target=buildReferenceTarget(c,project);
    if(!target){skipped[c.fn]=(skipped[c.fn]??0)+1;continue;}
    const context=fitAgentContext(buildAgentContext(project,{focusLineId:null,assetAvailable:()=>true}));
    const problems=validateWireTarget(target,context);
    const check=verifyTarget(c,project,target);
    if(problems.length||!check.ok)throw new Error(`REFERENCE_TARGET_INVALID ${c.id} ${problems} ${check.projectFailure}`);
    rows.push({id:c.id,work_id:c.scene,language:c.language,split:splitOf(scene),fn:c.fn,
      instruction:c.prompt,conversation:c.conversation,context,expected:target,judge_expect:c.expect,
      source:'theatre-real-original',review_status:'pending',reviewer:null,license_status:'original',allow_training:false,
      context_sha256:sha(context)});
  }
  return {rows,skipped};
}

export function experimentPlan(rows){
  const count=s=>rows.filter(r=>r.split===s).length;
  return {
    status:'PREPARED_NOT_EXECUTED',
    note:'No training was run. SFT/LoRA starts only after human-approved training rows exist (see export-sft.mjs gate).',
    corpus:{rows:rows.length,train:count('train'),dev:count('dev'),holdout:count('holdout'),sha256:sha(rows)},
    arms:[
      {id:'meta-muse-spark-1.3',type:'hosted-base',route:'/api/agent/interpret provider=meta',measured:'holdout1 (128 cases) in docs/RUNQ_REAL_AGENT_EVAL_2026-10-31.md'},
      {id:'baseten-muse-spark-open',type:'open-weight-base',route:'/api/agent/interpret provider=baseten',measured:'holdout1 (128 cases)'},
      {id:'open-weight-lora-specialized',type:'open-weight+LoRA',route:'NOT_IMPLEMENTED: needs a deployed endpoint and a provider adapter in agentRoutes',measured:null},
    ],
    rules:['Same frozen cases and judge (cases.lock.json) for every arm.','Train only on split=train rows approved by a human; dev for tuning; holdout touched once per arm.',
      'The holdout has already been scored once for the two base arms; it remains independent of any training data.',
      'Spend stays inside the 30 USD authorization via the per-provider ledgers; no retries; duplicates blocked.'],
  };
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(invoked){
  const out=process.argv[2]??'artifacts/specialization/runq-corpus.jsonl';
  const {rows,skipped}=buildCorpus();
  mkdirSync(dirname(resolve(out)),{recursive:true});
  writeFileSync(resolve(out),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
  writeFileSync(resolve(dirname(out),'experiment-plan.json'),JSON.stringify(experimentPlan(rows),null,1));
  console.log(JSON.stringify({out,rows:rows.length,skippedNeedingHumanTarget:skipped,
    bySplit:Object.fromEntries(['train','dev','holdout'].map(s=>[s,rows.filter(r=>r.split===s).length]))}));
}
