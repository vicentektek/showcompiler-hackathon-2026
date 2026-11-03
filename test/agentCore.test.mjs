import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewShow,addAudioReference,assignAudioToCue,addMockProposal} from '../src/core/workspace.mjs';
import {stageAddCueTrack} from '../src/core/cueTracks.mjs';
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
test('assistant configures a continuous loop and another cue stops it with a targeted fade',()=>{
 let p=fixture();
 p=assignAudioToCue(p,p.cues[0].id,p.assets[0].id);
 p.cues[0].playback={fadeOutMs:1000,repeatCount:3};
 p=normalizeShowProject(p);
 const before=JSON.stringify(p);
 const plan=prepareAgentPlan(p,[
  {op:'UPDATE_CUE',cueId:p.cues[0].id,changes:{loop:true}},
  {op:'SET_CUE_STOP',cueId:p.cues[2].id,targetCueId:p.cues[0].id,fadeMs:5000},
 ]);
 assert.equal(JSON.stringify(p),before);
 assert.equal(plan.proposedProject.cues[0].playback.loop,true);
 assert.equal(plan.proposedProject.cues[0].playback.fadeOutMs,0);
 assert.equal(plan.proposedProject.cues[0].playback.repeatCount,1);
 assert.deepEqual(plan.proposedProject.cues[2].automation.stopCueIds,[p.cues[0].id]);
 assert.equal(plan.proposedProject.cues[2].stopFadeOverrides[p.cues[0].id],5000);
 const committed=commitAgentPlan(p,plan,{editable:true});
 assert.equal(JSON.stringify(undoAgentPlan(committed.project,committed.undo,{editable:true})),before);
});
test('local loop / last-cue commands prepare actual audio edits without transport',()=>{
 const p=fixture();
 for(const text of ['cue 1 debe ser loop','cue 1 must be a loop']){
  const answer=interpretLocalAgentRequest(p,text);
  assert.equal(answer.status,'PLAN',text);
  assert.equal(prepareAgentPlan(p,answer.operations).proposedProject.cues[0].playback.loop,true);
 }
 for(const text of ['el ultimo cue debe detener el cue 1 con un fade out de 5 segundos',
  'the last cue must stop cue 1 with a fade out of 5 seconds']){
  const answer=interpretLocalAgentRequest(p,text);
  assert.equal(answer.status,'PLAN',text);
  const final=prepareAgentPlan(p,answer.operations).proposedProject.cues.at(-1);
  assert.equal(final.stopFadeOverrides[p.cues[0].id],5000);
 }
 const combined=interpretLocalAgentRequest(p,'la lluvia del sonido del cue 1 debe ser un loop y lo debe detener el ultimo cue con un fade out');
 assert.equal(combined.operations.length,2);
 assert.equal(prepareAgentPlan(p,combined.operations).proposedProject.cues.at(-1).stopFadeOverrides[p.cues[0].id],1500);
 assert.equal(interpretLocalAgentRequest(p,'No hagas cue 1 loop y el ultimo cue debe detener cue 1').status,'CLARIFY');
 assert.equal(interpretLocalAgentRequest(p,'cue 1 debe detener cue 1').status,'CLARIFY');
});
test('audio assignments, layers, settings, stop removal and overlap remain atomic and undoable',()=>{
 let p=fixture();
 p=addAudioReference(p,'second.wav');
 const id=p.cues[0].id,assetId=p.assets[1].id;
 const ops=[
  {op:'ASSIGN_AUDIO',cueId:id,assetId},
  {op:'ADD_AUDIO_TRACK',cueId:id,assetId:p.assets[0].id,changes:{loop:true,fadeInMs:1200}},
  {op:'UPDATE_AUDIO_TRACK',cueId:id,trackId:'track-1',changes:{gainDb:-12,pan:-0.5,fadeInMs:1000,playbackRate:0.8,endAtMs:2000}},
  {op:'SET_ENTRY_POLICY',cueId:id,mode:'STOP_PREVIOUS',fadeMs:3000},
 ];
 const plan=prepareAgentPlan(p,ops,{assetAvailable:()=>true});
 assert.equal(plan.structural,false);
 const proposed=plan.proposedProject;
 assert.equal(proposed.cues[0].actions[0].assetId,assetId);
 assert.equal(proposed.cues[0].audioTracks[0].playback.gainDb,-12);
 assert.deepEqual(proposed.cues[0].entryPolicy,{mode:'STOP_PREVIOUS',fadeOutMs:3000});
 assert.equal(proposed.cues[0].audioTracks[0].playback.loop,true);
 const trackReplacement=prepareAgentPlan(proposed,[
  {op:'UPDATE_AUDIO_TRACK',cueId:id,trackId:'track-1',assetId},
 ],{assetAvailable:()=>true});
 assert.equal(trackReplacement.proposedProject.cues[0].audioTracks[0].assetId,assetId);
 assert.equal(trackReplacement.proposedProject.cues[0].audioTracks[0].playback.gainDb,-12);
 assert.ok(commitAgentPlan(proposed,trackReplacement,{editable:true,assetAvailable:()=>true}).project);
 const context=buildAgentContext(proposed);
 assert.deepEqual(context.cues[0].audioTracks,proposed.cues[0].audioTracks);
 const replace=prepareAgentPlan(proposed,[{op:'ASSIGN_AUDIO',cueId:id,assetId:p.assets[0].id}],{assetAvailable:()=>true});
 assert.equal(replace.proposedProject.cues[0].actions[0].assetId,p.assets[0].id);
 const removed=prepareAgentPlan(proposed,[{op:'REMOVE_AUDIO_TRACK',cueId:id,trackId:'track-1'}]);
 assert.deepEqual(removed.proposedProject.cues[0].audioTracks,[]);
 assert.throws(()=>prepareAgentPlan(p,ops,{assetAvailable:()=>false}),{code:'AUDIO_ASSET_UNAVAILABLE'});
 const committed=commitAgentPlan(p,plan,{editable:true,assetAvailable:()=>true});
 assert.deepEqual(undoAgentPlan(committed.project,committed.undo,{editable:true}),p);
 assert.throws(()=>commitAgentPlan(p,plan,{editable:true,assetAvailable:()=>false}),{code:'AUDIO_ASSET_UNAVAILABLE'});
 assert.throws(()=>prepareAgentPlan(p,[{op:'UPDATE_CUE',cueId:id,changes:{loop:true,fadeOutMs:1500}}]),{code:'LOOP_NEEDS_TARGETED_STOP'});
 const stopper=p.cues[2].id;
 const stopped=prepareAgentPlan(p,[{op:'SET_CUE_STOP',cueId:stopper,targetCueId:id,fadeMs:2500}]).proposedProject;
 assert.ok(buildAgentContext(stopped).cues[2].stopFadeOverrides[id]===2500);
 const changed=prepareAgentPlan(stopped,[{op:'SET_CUE_STOP',cueId:stopper,targetCueId:id,fadeMs:5000}]);
 assert.ok(changed.changes[0].changes.some(c=>c.field==='stopFadeOverrides'));
 const another=prepareAgentPlan(changed.proposedProject,[
  {op:'SET_CUE_STOP',cueId:stopper,targetCueId:p.cues[1].id,fadeMs:800},
 ]).proposedProject;
 assert.deepEqual(another.cues[2].automation.stopCueIds,[id,p.cues[1].id]);
 assert.equal(another.cues[2].stopFadeOverrides[id],5000);
 assert.equal(another.cues[2].stopFadeOverrides[p.cues[1].id],800);
 const cleared=prepareAgentPlan(stopped,[{op:'REMOVE_CUE_STOP',cueId:stopper,targetCueId:id}]).proposedProject;
 assert.deepEqual(cleared.cues[2].automation.stopCueIds,[]);
 assert.deepEqual(cleared.cues[2].stopFadeOverrides,{});
 assert.throws(()=>prepareAgentPlan(p,[{op:'SET_CUE_STOP',cueId:id,targetCueId:'unknown',fadeMs:1000}]),{code:'INVALID_STOP_TARGET'});
});
test('readiness answers explain actual unresolved audio without provider calls or edits',()=>{
 const p=fixture(),before=JSON.stringify(p);
 for(const prompt of ['Which audio is still unresolved?','¿Qué falta para ensayar, sin afirmar que está listo?',
  'Can you review the audio without playing it?','Are we ready to go live?']){
  const answer=interpretLocalAgentRequest(p,prompt);
  assert.equal(answer.status,'ANSWER',prompt);
  assert.deepEqual(answer.operations,[]);
  assert.equal(answer.readiness.readyCues,0);
  assert.equal(answer.readiness.totalCues,3);
  assert.equal(answer.readiness.ready,false);
  assert.match(answer.message,/Puerta/);
 }
 assert.equal(JSON.stringify(p),before);
});
test('cue readiness distinguishes decoded, missing and unknown files and exact selected scope',()=>{
 let p=fixture();
 p=assignAudioToCue(p,p.cues[0].id,p.assets[0].id);
 const id=p.cues[0].id;
 for(const available of [true,false,null]){
  const answer=interpretLocalAgentRequest(p,'Is cue 1 ready?',{assetAvailable:()=>available});
  assert.equal(answer.status,'ANSWER');
  assert.equal(answer.readiness.totalCues,1);
  assert.equal(answer.readiness.ready,available===true);
  assert.match(answer.message,available===true?/decoded audio/i:available===false?/Load or relink/:/not verified/);
 }
 const selected=interpretLocalAgentRequest(p,'¿Está listo el cue seleccionado?',{
  selectedCueId:id,assetAvailable:()=>true});
 assert.equal(selected.readiness.readyCues,1);
 assert.equal(interpretLocalAgentRequest(p,'Is cue 99 ready?').status,'CLARIFY');
 assert.equal(interpretLocalAgentRequest(p,'Are cues 1 and 2 ready?').status,'CLARIFY');
 assert.equal(interpretLocalAgentRequest(p,'Is cue Rain ready?').status,'CLARIFY');
 assert.equal(interpretLocalAgentRequest(p,'Are you ready?').status,'NEEDS_AI');
 assert.equal(interpretLocalAgentRequest(p,'Now imagine the main audio file is missing.').status,'NEEDS_AI');
 assert.equal(interpretLocalAgentRequest(p,'Set cue 1 gain to -6 dB').status,'PLAN');
});
test('secondary tracks, unknown availability, empty shows and pending reviews cannot become live certification',()=>{
 let p=fixture();
 p=addAudioReference(p,'secondary.wav');
 p=assignAudioToCue(p,p.cues[0].id,p.assets[0].id);
 p=normalizeShowProject(stageAddCueTrack(p,p.cues[0].id,p.assets[1].id));
 p=addMockProposal(p,{lineId:'L2',label:'Human review required'});
 const before=JSON.stringify(p);
 const availability=id=>id===p.assets[0].id?true:null;
 const answer=interpretLocalAgentRequest(p,'Is cue 1 ready?',{assetAvailable:availability});
 assert.equal(answer.readiness.ready,false);
 assert.equal(answer.readiness.unknownAudio,1);
 assert.ok(answer.readiness.issues.some(i=>i.assetId===p.assets[1].id));
 const pending=interpretLocalAgentRequest(p,'Dime qué quedó pendiente.',{assetAvailable:availability});
 assert.equal(pending.projectState.unknown.length,1);
 assert.ok(!pending.projectState.locallyResolved.some(c=>c.cueId===p.cues[0].id));
 const full=interpretLocalAgentRequest(p,'Are we ready for rehearsal?',{assetAvailable:()=>true});
 assert.equal(full.readiness.warningCount,1);
 assert.equal(full.readiness.liveReady,false);
 assert.match(full.message,/human review/);
 const empty=interpretLocalAgentRequest(createNewShow({name:'Empty'}),'Are we ready to go live?');
 assert.equal(empty.readiness.ready,false);
 assert.ok(empty.readiness.issues.some(i=>i.code==='EMPTY_SHOW'));
 assert.equal(JSON.stringify(p),before);
});
test('context builder exposes bounded, original source and stable identities',()=>{
 const project=fixture();
 const context=buildAgentContext(project,{maxCues:2,maxScriptLines:3,focusLineId:'L5'});
 assert.equal(context.projectName,'Prueba agente');
 assert.equal(context.workspace,'ai');
 assert.equal(context.mode,'design-manual');
 assert.equal(context.selectedCueId,null);
 assert.equal(context.cues.length,2);
 assert.equal(context.truncated.cues,true);
 assert.deepEqual(context.lines.map(x=>x.id),['L4','L5','L6']);
 assert.equal(resolveAgentCue(project,'cue 2').id,project.cues[1].id);
 assert.equal(resolveAgentCue(project,3).id,project.cues[2].id);
 assert.equal(resolveAgentCue(project,'cue 3000'),null);
 const focused=buildAgentContext(project,{maxCues:2,maxScriptLines:3,
  workspace:'script',selectedCueId:project.cues[1].id});
 assert.equal(focused.workspace,'script');
 assert.equal(focused.selectedCueId,project.cues[1].id);
 let large=project;
 for(let index=0;index<80;index++)
  large=insertManualCue(large,{afterCueId:large.cues.at(-1).id,label:'Extra '+index}).project;
 const lastCue=large.cues.at(-1);
 const bounded=buildAgentContext(large,{selectedCueId:lastCue.id});
 assert.equal(bounded.truncated.cues,true);
 assert.ok(bounded.cues.some(cue=>cue.id===lastCue.id));
 assert.equal(bounded.cues.length,80);
 assert.throws(()=>buildAgentContext(project,{workspace:'operation'}),/INVALID_CONTEXT_LIMIT/);
 assert.throws(()=>buildAgentContext(project,{selectedCueId:'unknown'}),/INVALID_SELECTED_CUE/);
});
test('selected script context contains only exact existing lines and stays bounded',()=>{
 const project=fixture();
 const context=buildAgentContext(project,{selectedLineIds:['L5','L2']});
 assert.deepEqual(context.lines,[{id:'L5',text:'(Suena una puerta)'},{id:'L2',text:'ANA: Estamos todos listos para comenzar'}]);
 assert.equal(context.truncated.script,false);
 assert.throws(()=>buildAgentContext(project,{selectedLineIds:['L99']}),/INVALID_SELECTED_SCRIPT_LINE/);
 assert.throws(()=>buildAgentContext(project,{selectedLineIds:[]}),/INVALID_CONTEXT_LIMIT/);
 assert.throws(()=>buildAgentContext(project,{selectedLineIds:Array.from({length:21},(_,index)=>'L'+(index+1))}),/INVALID_CONTEXT_LIMIT/);
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
test('natural ES/EN rename resolves exact cue identity locally and preserves spelling and bounds',()=>{
 const p=fixture(),id=p.cues[1].id;
 for(const [prompt,label] of [
  ['Renombra el cue 2 como Último eco','Último eco'],
  ['Rename cue 2 to Final Door','Final Door'],
  ['Rename the selected cue to "Door: Finale"','Door: Finale'],
 ]){
  const reply=interpretLocalAgentRequest(p,prompt,{selectedCueId:id});
  assert.equal(reply.status,'PLAN');
  assert.deepEqual(reply.operations,[{op:'UPDATE_CUE',cueId:id,changes:{label}}]);
  const plan=prepareAgentPlan(p,reply.operations);
  assert.equal(plan.proposedProject.cues[1].label,label);
  assert.deepEqual(plan.proposedProject.cues[1].actions,p.cues[1].actions);
 }
 for(const prompt of ['No renombres el cue 2','Rename cue 99 to Finale',
  'Rename cue 2 to '+ 'x'.repeat(201),'Rename cue 2 to ""',
  'Rename cue 2 to Finale and delete cue 1']){
  assert.notEqual(interpretLocalAgentRequest(p,prompt).status,'PLAN',prompt);
 }
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

test('deleting a cue previews indirect automation edits on surviving cues',()=>{
 const p=fixture();
 const deleted=p.cues[1], survivor=p.cues[2];
 const modified=normalizeShowProject({...p,cues:p.cues.map(c=>c.id===survivor.id?{
  ...c,automation:{stopCueIds:[deleted.id]}
 }:c)});
 const plan=prepareAgentPlan(modified,[{op:'DELETE_CUE',cueId:deleted.id}]);
 const indirect=plan.changes.find(change=>change.cueId===survivor.id);
 assert.ok(indirect,'The surviving cue must be included in the operator preview');
 assert.ok(indirect.changes.some(field=>field.field==='automation'),
  'The removed stop target is a material automation edit');
 assert.ok(indirect.changes.some(field=>field.field==='number'),
  'Renumbering after deletion must still be visible');
 assert.equal(modified.cues[2].automation.stopCueIds[0],deleted.id,
  'Preview must not mutate the source show');
 const committed=commitAgentPlan(modified,plan,{editable:true});
 assert.deepEqual(committed.project.cues.find(c=>c.id===survivor.id).automation.stopCueIds,[]);
 assert.deepEqual(undoAgentPlan(committed.project,committed.undo,{editable:true}),modified);
});
