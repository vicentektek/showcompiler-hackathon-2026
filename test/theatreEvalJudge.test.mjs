import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCases,buildSceneProject,judgeCase,judgeProject} from '../tools/theatreEvalCases.mjs';
import {runEvaluation,selectCases} from '../tools/runq-theatre-real-eval.mjs';
import {prepareAgentPlan,commitAgentPlan} from '../src/core/agentCore.mjs';
import {SCENES} from '../fixtures/qa/theatre-real/scenes.mjs';

// SIMULATED oracle responses: verify the JUDGE only, never model accuracy.
const scene=id=>SCENES.find(s=>s.id===id);
const apply=(p,ops)=>commitAgentPlan(p,prepareAgentPlan(p,ops),{editable:true}).project;
const caseOf=id=>buildCases().find(c=>c.id===id);

test('corpus is original, split fixed and cases deterministic', () => {
  const a=buildCases(),b=buildCases();
  assert.deepEqual(a,b);
  assert.equal(new Set(a.map(c=>c.id)).size,a.length);
  assert.equal(SCENES.filter(s=>s.split==='holdout').length,8);
  for(const s of SCENES){
    const p=buildSceneProject(s);
    p.cues.forEach((cue,i)=>assert.match(s.lines[s.cues[i][1]-1],/^\(/));
  }
});

test('judge accepts exact oracle delete and rejects collateral damage', () => {
  const c=caseOf('ES-01-delete-number'),p=buildSceneProject(scene('ES-01'));
  const id=p.cues[c.expect.n-1].id,other=p.cues.find(x=>x.id!==id).id;
  const good={httpStatus:200,status:'PLAN',message:'ok',operations:[{op:'DELETE_CUE',cueId:id}]};
  assert.equal(judgeCase(c,p,good).interpretation,true);
  assert.equal(judgeCase(c,p,good).selection,true);
  assert.equal(judgeProject(p,apply(p,good.operations),c.expect),null);
  const bad={...good,operations:[{op:'DELETE_CUE',cueId:id},{op:'DELETE_CUE',cueId:other}]};
  const m=judgeCase(c,p,bad);
  assert.equal(m.unauthorized,true);
  assert.equal(judgeProject(p,apply(p,bad.operations),c.expect),'WRONG_CUES_AFTER_DELETE');
});

test('no-change functions flag any operation as unauthorized', () => {
  for(const fn of ['negation','transport','nonexistent-cue']){
    const c=caseOf('EN-01-'+fn),p=buildSceneProject(scene('EN-01'));
    const refuse={httpStatus:200,status:'ANSWER',message:'no',operations:[]};
    const m=judgeCase(c,p,refuse);
    assert.equal(m.interpretation,true);assert.equal(m.unauthorized,false);
    const wrong={httpStatus:200,status:'PLAN',message:'x',operations:[{op:'DELETE_CUE',cueId:p.cues[0].id}]};
    const w=judgeCase(c,p,wrong);
    assert.equal(w.unauthorized,true);assert.equal(w.interpretation,false);
  }
});

test('ambiguity must clarify; trigger must be verbatim dialogue without actor name', () => {
  const amb=caseOf('ES-02-ambiguity'),p2=buildSceneProject(scene('ES-02'));
  assert.equal(judgeCase(amb,p2,{httpStatus:200,status:'CLARIFY',message:'¿cuál?',operations:[]}).interpretation,true);
  assert.equal(judgeCase(amb,p2,{httpStatus:200,status:'PLAN',message:'',operations:[{op:'DELETE_CUE',cueId:p2.cues[1].id}]}).interpretation,false);
  const c=caseOf('ES-01-voice-trigger'),p=buildSceneProject(scene('ES-01'));
  const target=p.cues[c.expect.n-1];
  const mk=trigger=>apply(p,[{op:'UPDATE_CUE',cueId:target.id,changes:{trigger}}]);
  assert.equal(judgeProject(p,mk('invented words here'),c.expect),'TRIGGER_NOT_VERBATIM_DIALOGUE');
});

test('dry run performs no provider work and pilot is 15 cases x 2 providers', async () => {
  const r=await runEvaluation({set:'pilot'});
  assert.equal(r.dryRun,true);assert.equal(r.plan.requests,30);
  assert.equal(selectCases('pilot').length,15);
  await assert.rejects(()=>runEvaluation({set:'pilot',live:true}),/EXPLICIT_PAID_OPT_IN_REQUIRED/);
});
