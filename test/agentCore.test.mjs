import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewShow,addAudioReference,assignAudioToCue,addMockProposal} from '../src/core/workspace.mjs';
import {stageAddCueTrack} from '../src/core/cueTracks.mjs';
import {insertManualCue} from '../src/core/manualCues.mjs';
import {normalizeShowProject} from '../src/core/projectPersistence.mjs';
import {AGENT_CONTEXT_MAX_CHARS,buildAgentContext,resolveAgentCue,auditAgentProject,validateAgentOperations,
 prepareAgentPlan,commitAgentPlan,undoAgentPlan} from '../src/core/agentCore.mjs';
import {proposeAgentVoiceTriggers} from '../src/core/agentVoice.mjs';
import {interpretLocalAgentRequest} from '../src/core/agentIntent.mjs';
import {parseScript} from '../src/core/script.mjs';

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

function longShow(total=1500,cueCount=40){
 const lines=Array.from({length:total},(_,i)=>['ANA','LUIS','MARTA'][i%3]+': Frase de ensayo '+(i+1)+' con texto de relleno para medir el contexto del agente');
 if(total>=900)lines[899]='(Suena el teléfono del despacho)';
 let project=createNewShow({id:'agent-long',name:'Obra larga',scriptText:lines.join('\n')});
 for(let i=0;i<cueCount;i++)project=insertManualCue(project,{label:'Cue largo '+(i+1)}).project;
 return normalizeShowProject({...project,cues:project.cues.map((c,i)=>({
  ...c,sourceLineIds:['L'+(i===6&&total>=1100?1100:i*7+10)]
 }))});
}
const hasLine=(context,id)=>context.lines.some(line=>line.id===id);
test('AI context fits the server budget for a realistic show and keeps exact source lines',()=>{
 const project=longShow(300,40);
 const context=buildAgentContext(project,{});
 assert.ok(JSON.stringify(context).length<=AGENT_CONTEXT_MAX_CHARS,'context exceeds server budget');
 assert.equal(context.truncated.script,true);
 assert.equal(context.cues.length,40);
 assert.ok(context.lines.length>=40);
 const original=new Map(parseScript(project.scriptText).map(line=>[line.id,line.text]));
 const numbers=context.lines.map(line=>Number(line.id.slice(1)));
 assert.deepEqual(numbers,[...numbers].sort((x,y)=>x-y));
 assert.equal(new Set(numbers).size,numbers.length);
 for(const line of context.lines)assert.equal(line.text,original.get(line.id).slice(0,350));
});
test('AI context retrieves script evidence named by the instruction outside the focus window',()=>{
 const project=longShow();
 assert.equal(hasLine(buildAgentContext(project,{}),'L1234'),false);
 const byLine=buildAgentContext(project,{instruction:'¿Qué sonido pondrías en L1234?'});
 for(const id of ['L1233','L1234','L1235'])assert.ok(hasLine(byLine,id),id);
 const byKeyword=buildAgentContext(project,{instruction:'Propón un sonido para cuando suena el teléfono del despacho'});
 assert.ok(hasLine(byKeyword,'L900'));
 const byCue=buildAgentContext(project,{instruction:'Mejora el cue 7 por favor'});
 for(const id of ['L1097','L1098','L1099','L1100'])assert.ok(hasLine(byCue,id),id);
 const selected=buildAgentContext(project,{selectedCueId:project.cues[6].id,instruction:'¿Qué le falta a este cue?'});
 assert.ok(hasLine(selected,'L1100'));
 for(const context of [byLine,byKeyword,byCue,selected])
  assert.ok(JSON.stringify(context).length<=AGENT_CONTEXT_MAX_CHARS);
 assert.throws(()=>buildAgentContext(project,{instruction:'x'.repeat(1601)}),/INVALID_CONTEXT_LIMIT/);
});
test('AI context keeps every cue visible when stage-manager notes are long instead of blocking the request',()=>{
 const base=longShow(1500,80);
 const note='Regiduría: entrar con la luz del pasillo, esperar a que ANA cierre la puerta y confirmar por intercom con el técnico de sonido antes de lanzar. Nivel -12 dB, fundido 3 s, nunca solapar con la música del cambio de escena.';
 const project=normalizeShowProject({...base,cues:base.cues.map((c,i)=>({...c,label:'Efecto ambiente escena '+(1+Math.floor(i/8))+' — variante '+(i+1),
  trigger:'Después de que LUIS diga la frase de entrada número '+(i+1)+' y cruce el escenario',notes:note}))});
 const selected=project.cues[6];
 const context=buildAgentContext(project,{instruction:'Revisa el cue 12 y el teléfono del despacho',selectedCueId:selected.id,focusLineId:selected.sourceLineIds[0]});
 assert.ok(JSON.stringify(context).length<=AGENT_CONTEXT_MAX_CHARS);
 assert.equal(context.truncated.cues,false,'UI blocks the request when cues are truncated');
 assert.deepEqual(context.cues.map(c=>c.id),project.cues.map(c=>c.id));
 assert.equal(context.truncated.cueDetails,true);
 const sel=context.cues.find(c=>c.id===selected.id),twelve=context.cues.find(c=>c.number===12);
 assert.equal(sel.notes,note.slice(0,240));assert.equal(sel.trigger,selected.trigger);
 assert.equal(twelve.notes,note.slice(0,240));
 for(const cue of context.cues)assert.deepEqual(cue.sourceLineIds,project.cues.find(c=>c.id===cue.id).sourceLineIds);
 assert.ok(hasLine(context,'L900')&&hasLine(context,selected.sourceLineIds[0]));
 assert.ok(context.lines.length>=20,'enough script remains for the model');
});
test('AI context drops whole cues only as a last resort and never the selected cue',()=>{
 const project=longShow(1500,80),selected=project.cues.at(-1);
 const context=buildAgentContext(project,{maxContextChars:2000,selectedCueId:selected.id,focusLineId:selected.sourceLineIds[0]});
 assert.ok(JSON.stringify(context).length<=2000);
 assert.equal(context.truncated.cues,true);
 assert.ok(context.cues.some(c=>c.id===selected.id));
 assert.ok(context.cues.length<80&&context.lines.length>=1);
});
