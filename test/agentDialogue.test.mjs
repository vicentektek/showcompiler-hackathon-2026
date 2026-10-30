import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewShow} from '../src/core/workspace.mjs';
import {insertManualCue} from '../src/core/manualCues.mjs';
import {resolveAgentDialogue,boundedAgentConversation} from '../src/core/agentDialogue.mjs';
import {prepareAgentPlan,commitAgentPlan,undoAgentPlan} from '../src/core/agentCore.mjs';

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
 assert.notEqual(resolveAgentDialogue(p,
  'A\u00f1ade 3 cues al final, pero no los a\u00f1adas todav\u00eda').status,'PLAN');
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

test('an unrelated turn closes an older pending creative request',()=>{
 const p=show();
 const interrupted=[
  {role:'user',text:'Add 2 empty cues at the end'},
  {role:'assistant',text:'Which cues should I add?'},
  {role:'user',text:'How many cues are already in this show?'},
  {role:'assistant',text:'There is one existing cue.'}
 ];
 const result=resolveAgentDialogue(p,'you decide',{history:interrupted});
 assert.notEqual(result.status,'PLAN');
 assert.deepEqual(result.operations,[]);
});

test('English count before adjective is not replaced by a default of three',()=>{
 const project=show();
 const result=resolveAgentDialogue(project,'Add 2 empty cues at the end');
 assert.equal(result.status,'PLAN');
 assert.equal(result.operations.length,2);
 assert.deepEqual(result.operations.map(x=>x.label),['Pending cue 1','Pending cue 2']);
});

test('English delegated and corrective follow-ups stay in English',()=>{
 const project=show();
 const englishHistory=[
  {role:'user',text:'Add some cues at the end to finish the show'},
  {role:'assistant',text:'Which cues should I add?'}
 ];
 for(const prompt of ['you choose','as you see fit','make it four cues instead']){
  const result=resolveAgentDialogue(project,prompt,{history:englishHistory});
  assert.equal(result.status,'PLAN');
  assert.match(result.message,/^I propose /);
  assert.ok(result.operations.every(operation=>
   /^(?:Closing|Final|Exit|Farewell|Last|Additional)/.test(operation.label)));
 }
});
