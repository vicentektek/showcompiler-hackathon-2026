import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewShow,addAudioReference,assignAudioToCue} from '../src/core/workspace.mjs';
import {insertManualCue} from '../src/core/manualCues.mjs';
import {normalizeShowProject} from '../src/core/projectPersistence.mjs';
import {buildAgentContext,resolveAgentCue,auditAgentProject,validateAgentOperations,
 prepareAgentPlan,commitAgentPlan,undoAgentPlan} from '../src/core/agentCore.mjs';
import {proposeAgentVoiceTriggers} from '../src/core/agentVoice.mjs';
import {interpretLocalAgentRequest} from '../src/core/agentIntent.mjs';

const script=[
 'ESCENA I',
 'ANA: Estamos todos listos para comenzar',
 '(Entra la música)',
 'LUIS: Abre la puerta cuando llegue el momento',
 '(Suena una puerta)',
 'ANA: Esta noche las luces se apagarán',
 '(Comienza la tormenta)',
 'FIN'
].join('\n');
function fixture(){
 let project=createNewShow({id:'agent-test',name:'Prueba agente',scriptText:script});
 project=addAudioReference(project,'efecto.wav');
 for(const label of ['Música','Puerta','Tormenta']){
  project=insertManualCue(project,{label}).project;
 }
 project=normalizeShowProject({...project,cues:project.cues.map((c,i)=>({
  ...c,sourceLineIds:[['L3','L5','L7'][i]]
 }))});
 return project;
}
test('context builder exposes bounded, original source and stable identities',()=>{
 const project=fixture();
 const context=buildAgentContext(project,{maxCues:2,maxScriptLines:3,focusLineId:'L5'});
 assert.equal(context.projectName,'Prueba agente');
 assert.equal(context.cues.length,2);
 assert.equal(context.truncated.cues,true);
 assert.deepEqual(context.lines.map(x=>x.id),['L4','L5','L6']);
 assert.equal(resolveAgentCue(project,'cue 2').id,project.cues[1].id);
 assert.equal(resolveAgentCue(project,3).id,project.cues[2].id);
 assert.equal(resolveAgentCue(project,'cue 3000'),null);
});
test('local agent accepts narrow commands but refuses unsupported/negated requests',()=>{
 const p=fixture();
 const deletion=interpretLocalAgentRequest(p,'elimina el cue 2');
 assert.equal(deletion.status,'PLAN');
 assert.deepEqual(deletion.operations,[{op:'DELETE_CUE',cueId:p.cues[1].id}]);
 assert.equal(interpretLocalAgentRequest(p,'No elimines el cue 2').status,'CLARIFY');
 assert.equal(interpretLocalAgentRequest(p,'Borra todos los cues').status,'NEEDS_AI');
 const moving=interpretLocalAgentRequest(p,'Mueve el cue 3 antes del 1');
 assert.equal(moving.operations[0].targetCueId,p.cues[0].id);
 assert.equal(moving.operations[0].position,'before');
 assert.equal(interpretLocalAgentRequest(p,'Review the show').status,'ANSWER');
 assert.equal(interpretLocalAgentRequest(p,'Create a cue named Telephone').status,'PLAN');
});
test('propose voice triggers from real dialogue, skip absent source and conflicts',()=>{
 const p=fixture();
 const suggestions=proposeAgentVoiceTriggers(p);
 assert.equal(suggestions.suggestions.length,3);
 assert.deepEqual(suggestions.suggestions.map(x=>x.evidenceLineId),['L2','L4','L6']);
 assert.equal(suggestions.operations[0].changes.trigger,'Estamos todos listos para comenzar');
 const unanchored=normalizeShowProject({...p,cues:p.cues.map((c,i)=>i===0?{...c,sourceLineIds:[]}:c)});
 const skipped=proposeAgentVoiceTriggers(unanchored);
 assert.equal(skipped.skipped.find(x=>x.cueId===p.cues[0].id).reason,'NO_SOURCE_LINE');
 const duplicated=normalizeShowProject({...p,cues:p.cues.map((c,i)=>i===1?{...c,sourceLineIds:['L3']}:c)});
 const ambiguous=proposeAgentVoiceTriggers(duplicated);
 assert.equal(ambiguous.skipped.some(x=>x.reason==='AMBIGUOUS_TRIGGER'),true);
});
test('atomic edit/delete/reorder, source and media preserved, undo works',()=>{
 let p=fixture();
 const id=p.cues[0].id;
 p=assignAudioToCue(p,id,p.assets[0].id);
 const ops=[
  {op:'UPDATE_CUE',cueId:id,changes:{gainDb:-9,fadeInMs:1000}},
  {op:'DELETE_CUE',cueId:p.cues[1].id},
  {op:'REORDER_CUE',cueId:p.cues[2].id,targetCueId:id,position:'before'}
 ];
 const plan=prepareAgentPlan(p,ops);
 assert.equal(p.cues.length,3);
 assert.equal(plan.proposedProject.cues.length,2);
 assert.equal(plan.proposedProject.cues[1].id,id);
 assert.equal(plan.proposedProject.assets[0].id,p.assets[0].id);
 assert.equal(plan.proposedProject.cues[1].playback.gainDb,-9);
 assert.deepEqual(plan.proposedProject.cues[1].sourceLineIds,['L3']);
 assert.equal(Object.hasOwn(plan,'go'),false);
 assert.throws(()=>commitAgentPlan(p,plan,{editable:false}),/AGENT_EDIT_NOT_ALLOWED/);
 const committed=commitAgentPlan(p,plan,{editable:true});
 assert.equal(committed.project.cues.length,2);
 assert.deepEqual(undoAgentPlan(committed.project,committed.undo,{editable:true}),p);
 const external=normalizeShowProject({...committed.project,name:'Cambio externo'});
 assert.throws(()=>undoAgentPlan(external,committed.undo,{editable:true}),/STALE_AGENT_UNDO/);
 assert.throws(()=>commitAgentPlan(external,plan,{editable:true}),/STALE_AGENT_PLAN/);
});
test('invalid batch aborts without partially changing the original',()=>{
 const p=fixture();
 assert.throws(()=>prepareAgentPlan(p,[
  {op:'DELETE_CUE',cueId:p.cues[0].id},
  {op:'UPDATE_CUE',cueId:'not-present',changes:{gainDb:-6}},
 ]),/AGENT_PLAN_FAILED_AT_1/);
 assert.equal(p.cues.length,3);
 assert.throws(()=>validateAgentOperations([{op:'GO',cueId:p.cues[0].id}]),/UNSUPPORTED_AGENT_OPERATION/);
 assert.throws(()=>validateAgentOperations([{op:'UPDATE_CUE',cueId:p.cues[0].id,changes:{transport:'GO'}}]));
 assert.throws(()=>validateAgentOperations(Array.from({length:31},()=>({op:'DELETE_CUE',cueId:p.cues[0].id}))),/INVALID_OPERATION_COUNT/);
});
test('audit detects unresolved media and missing triggers without playback',()=>{
 const p=fixture(),report=auditAgentProject(p,{assetAvailable:()=>false});
 assert.equal(report.cueCount,3);
 assert.equal(report.issues.filter(x=>x.code==='NO_VOICE_TRIGGER').length,3);
 assert.equal(report.issues.filter(x=>x.code==='UNRESOLVED_AUDIO').length,3);
});
