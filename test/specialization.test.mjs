import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCorpus,experimentPlan,splitOf} from '../tools/qa-specialization/build-dataset.mjs';
import {validateRows,readJsonl} from '../tools/qa-specialization/validate-dataset.mjs';
import {exportSft} from '../tools/qa-specialization/export-sft.mjs';
import {routeMessages,validateWireTarget,wireToOperations} from '../tools/qa-specialization/contract.mjs';
import {AGENT_SYSTEM_PROMPT,AGENT_OUTPUT_SCHEMA} from '../tools/agentRoutes.mjs';
import {SCENES} from '../fixtures/qa/theatre-real/scenes.mjs';

const {rows}=buildCorpus();
const approve=r=>({...r,review_status:'approved',reviewer:'test-reviewer',allow_training:true});

test('corpus rows are all valid against the real agent contract (offline, simulated targets)', () => {
  assert.ok(rows.length>250);
  const {errors,stats}=validateRows(rows);
  assert.deepEqual(errors,[]);
  assert.equal(stats.trainable,0);
  assert.equal(stats.pending,rows.length);
});

test('partitions are disjoint by scene and holdout equals the frozen eval holdout', () => {
  const byScene=new Map();
  for(const r of rows){byScene.set(r.work_id,new Set([...(byScene.get(r.work_id)??[]),r.split]));}
  for(const [,s] of byScene)assert.equal(s.size,1);
  for(const s of SCENES)assert.equal(splitOf(s)==='holdout',s.split==='holdout');
  assert.ok(rows.some(r=>r.split==='train'&&r.language==='es'));
  assert.ok(rows.some(r=>r.split==='train'&&r.language==='en'));
});

test('validator rejects leakage, holdout training, unreviewed training and bad targets', () => {
  const train=rows.find(r=>r.split==='train'),hold=rows.find(r=>r.split==='holdout');
  assert.match(validateRows([{...hold,allow_training:true}]).errors.join(),/holdout cannot train|unreviewed/);
  assert.match(validateRows([{...train,allow_training:true}]).errors.join(),/unreviewed training/);
  assert.match(validateRows([{...train,id:'X',work_id:hold.work_id}, hold]).errors.join(),/several splits/);
  const bad={...train,expected:{status:'PLAN',message:'x',operations:[{op:'DELETE_CUE',cueId:'nope'}]}};
  assert.match(validateRows([bad]).errors.join(),/expected target/);
  const ghost={...train,expected:{status:'PLAN',message:'x',operations:[{op:'DELETE_CUE',cueId:'ghost',afterCueId:null,targetCueId:null,position:null,label:null,edits:[]}]}};
  assert.match(validateWireTarget(ghost.expected,ghost.context).join(),/CUE_NOT_IN_CONTEXT/);
  assert.match(validateWireTarget({status:'ANSWER',message:'x',operations:[{}]},ghost.context).join(),/NON_PLAN_WITH_OPERATIONS/);
});

test('SFT export is gated: refuses pending rows, exports approved train rows in the exact route format', () => {
  assert.throws(()=>exportSft(rows),/NO_APPROVED_LICENSED_TRAINING_EXAMPLES/);
  const train=rows.filter(r=>r.split==='train').slice(0,3).map(approve);
  const out=exportSft([...train,...rows.filter(r=>r.split==='holdout').slice(0,2)]);
  assert.equal(out.length,3);
  const [dev,user,assistant]=out[0].messages;
  assert.equal(dev.role,'developer');assert.equal(dev.content,AGENT_SYSTEM_PROMPT);
  assert.equal(user.content,routeMessages(train[0])[1].content);
  const target=JSON.parse(assistant.content);
  assert.deepEqual(Object.keys(target),['status','message','operations']);
  assert.deepEqual(Object.keys(target.operations[0]??{op:1,cueId:1,afterCueId:1,targetCueId:1,position:1,label:1,edits:1}),
    Object.keys(AGENT_OUTPUT_SCHEMA.properties.operations.items.properties));
  assert.throws(()=>exportSft([approve(rows.find(r=>r.split==='holdout'))]),/INVALID_DATASET/);
});

test('wire targets map to the same agentCore operations the route would produce', () => {
  const r=rows.find(x=>x.fn==='update-fade');
  assert.deepEqual(wireToOperations(r.expected),[{op:'UPDATE_CUE',cueId:r.expected.operations[0].cueId,changes:{fadeInMs:3000}}]);
});

test('committed sample fixture validates and the experiment plan declares no training or paid spend', () => {
  const sample=readJsonl('fixtures/qa/specialization/examples.jsonl');
  assert.deepEqual(validateRows(sample).errors,[]);
  const plan=experimentPlan(rows);
  assert.equal(plan.status,'PREPARED_NOT_EXECUTED');
  assert.equal(plan.arms.find(a=>a.id.includes('lora')).measured,null);
});
