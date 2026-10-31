import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewShow} from '../src/core/workspace.mjs';
import {insertManualCue} from '../src/core/manualCues.mjs';
import {resolveAgentDialogue,boundedAgentConversation} from '../src/core/agentDialogue.mjs';
import {prepareAgentPlan,commitAgentPlan,undoAgentPlan} from '../src/core/agentCore.mjs';
import {normalizeShowProject} from '../src/core/projectPersistence.mjs';
import {proposeAgentVoiceTriggers} from '../src/core/agentVoice.mjs';

function show(){
 let p=createNewShow({name:'Last cue',scriptText:'ANA: Final musical phrase is here\n(Closing)'});
 p=insertManualCue(p,{label:'Triumphant musical transition'}).project;
 return p;
}
const history=[
 {role:'user',text:'añadelos al final son para rematar el show'},
 {role:'assistant',text:'¿Qué elementos quieres añadir al final?'}
];
test('ambiguous follow-up becomes a safe creative three-cue PLAN, without fabricating script or assets',()=>{
 const original=show();
 const reply=resolveAgentDialogue(original,'los que te parezcan más apropiados',{history});
 assert.equal(reply.status,'PLAN');
 assert.equal(reply.operations.length,3);
 assert.equal(reply.basis,'CREATIVE_OPERATOR_PROPOSAL');
 assert.ok(reply.message.includes('propuestas creativas'));
 const plan=prepareAgentPlan(original,reply.operations);
 assert.equal(original.cues.length,1,'Preview must not edit live show');
 assert.equal(plan.proposedProject.cues.length,4);
 assert.ok(plan.proposedProject.cues.slice(1).every(c=>c.sourceLineIds.length===0&&
   c.actions[0].type==='PLAN_AUDIO'&&c.origin==='MANUAL'));
 const applied=commitAgentPlan(original,plan,{editable:true});
 assert.deepEqual(undoAgentPlan(applied.project,applied.undo,{editable:true}),original);
});
test('explicit empty multi-cue request is resolved without a paid AI call',()=>{
 const p=show();
 const answer=resolveAgentDialogue(p,'quiero que añadas 3 cues vacíos al finalizar el show');
 assert.equal(answer.status,'PLAN');
 assert.deepEqual(answer.operations.map(o=>o.label),['Cue pendiente 1','Cue pendiente 2','Cue pendiente 3']);
});
test('follow-up correction reuses only bounded local session context',()=>{
 const p=show();
 const result=resolveAgentDialogue(p,'mejor cuatro cues en vez de tres',{history});
 assert.equal(result.status,'PLAN');
 assert.equal(result.operations.length,4);
 assert.equal(boundedAgentConversation([...history,{role:'user',text:'a'.repeat(2000)}]).at(-1).text.length,400);
});
test('negation, overly large batches and absent history never silently edit',()=>{
 const p=show();
 assert.notEqual(resolveAgentDialogue(p,'No añadas 3 cues al final').status,'PLAN');
 assert.notEqual(resolveAgentDialogue(p,'añade 40 cues vacíos al final').status,'PLAN');
 assert.notEqual(resolveAgentDialogue(p,'los que te parezcan más apropiados').status,'PLAN');
});
test('voice trigger workflow never becomes empty cue creation',()=>{
 const p=show();
 assert.notEqual(resolveAgentDialogue(p,'Pon pies de voz coherentes a todos los cues').basis,
  'CREATIVE_OPERATOR_PROPOSAL');
});
test('context from old project can be ignored by supplying empty conversation',()=>{
 const p=show();
 assert.notEqual(resolveAgentDialogue(p,'you decide',{history:[]}).status,'PLAN');
});

test('English count before adjective is not replaced by a default of three',()=>{
 const project=show();
 const result=resolveAgentDialogue(project,'Add 2 empty cues at the end');
 assert.equal(result.status,'PLAN');
 assert.equal(result.operations.length,2);
 assert.deepEqual(result.operations.map(x=>x.label),['Pending cue 1','Pending cue 2']);
});

function voiceShow(){
 let p=createNewShow({name:'Scoped voice',scriptText:[
  'ANA: Tonight we will begin the original performance',
  '(Opening)',
  'LUIS: The door must close before we leave this room',
  '(Door)',
  'ANA: This is our last chance to make a decision',
  '(Decision)',
 ].join('\n')});
 for(const label of ['Opening','Door','Decision'])p=insertManualCue(p,{label}).project;
 return normalizeShowProject({...p,cues:p.cues.map((cue,i)=>({...cue,sourceLineIds:['L'+(i*2+2)]}))});
}
test('ES/EN explicit voice target proposes only that cue, never the whole show',()=>{
 const p=voiceShow();
 for(const prompt of ['Propón pies de voz para el cue 2','Propose a spoken trigger for cue 2']){
  const reply=resolveAgentDialogue(p,prompt);
  assert.equal(reply.status,'PLAN',prompt);
  assert.deepEqual(reply.operations.map(op=>op.cueId),[p.cues[1].id],prompt);
 }
 assert.equal(proposeAgentVoiceTriggers(p).operations.length,3,'Explicit whole-show operation remains available');
});
test('absent or ambiguous voice targets never widen to a whole-show batch',()=>{
 const p=voiceShow();
 for(const prompt of ['Propón pies de voz para el cue 99','Assign voice triggers to cues 1 and 2',
  'Assign voice triggers to cue 1 and cue 2','Assign voice triggers to cue 1 and 2',
  'Propón pies de voz para cue 1-3']){
  const reply=resolveAgentDialogue(p,prompt);
  assert.equal(reply.status,'CLARIFY',prompt);
  assert.deepEqual(reply.operations,[]);
 }
});
test('selected-cue commands resolve by stable identity and require actual context',()=>{
 const p=voiceShow();
 for(const prompt of ['Propón pies de voz para el cue seleccionado','Propose a spoken trigger for this cue']){
  const reply=resolveAgentDialogue(p,prompt,{selectedCueId:p.cues[2].id});
  assert.equal(reply.status,'PLAN');
  assert.deepEqual(reply.operations.map(op=>op.cueId),[p.cues[2].id]);
  assert.equal(resolveAgentDialogue(p,prompt).status,'CLARIFY');
 }
});
test('scoped voice selection still checks collisions across the complete show',()=>{
 const p=voiceShow(),first=proposeAgentVoiceTriggers(p).suggestions[0];
 const colliding=normalizeShowProject({...p,cues:p.cues.map((cue,i)=>i===1?{...cue,trigger:first.trigger}:cue)});
 const result=proposeAgentVoiceTriggers(colliding,{cueIds:[p.cues[0].id]});
 assert.equal(result.operations.length,0);
 assert.equal(result.skipped[0].reason,'AMBIGUOUS_TRIGGER');
 assert.throws(()=>proposeAgentVoiceTriggers(p,{cueIds:['absent']}),/INVALID_VOICE_SCOPE/);
});
