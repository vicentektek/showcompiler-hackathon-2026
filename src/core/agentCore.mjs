/**
 * RUNQ Agent: read-only context, stable cue identity and atomic proposals.
 * NO transport, model calls, file I/O, or automatic application.
 * The existing show schema remains unchanged.
 */
import {parseScript} from './script.mjs';
import {normalizeShowProject} from './projectPersistence.mjs';
import {stageCueConversationChange,validateCueChatChanges,normalizeConversationalPlayback} from './cueConversation.mjs';
import {insertManualCue,deleteOperatorCue,reorderOperatorCue} from './manualCues.mjs';
import {normalizeSpeech} from './voiceFollow.mjs';
import {validateHeroCueOperation} from './heroCue.mjs';
import {assignAudioToCue,replaceCueAudioAsset} from './workspace.mjs';
import {stageCueStopTransitions} from './cueStopFades.mjs';
import {setCueEntryPolicy} from './cueEntryPolicy.mjs';
import {stageAddCueTrack,stageChangeCueTrack,stageRemoveCueTrack} from './cueTracks.mjs';
import {normalizeCuePlayback} from './cuePlayback.mjs';

export const AGENT_MAX_OPERATIONS=30;
export const AGENT_DESIGN_WORKSPACES=Object.freeze([
 'home','script','ai','cues','audio','soundlab','setup','preflight',
]);
const EDITABLE=new Set(['UPDATE_CUE','DELETE_CUE','CREATE_CUE','CREATE_CONFIGURED_CUE','REORDER_CUE',
 'SET_CUE_STOP','REMOVE_CUE_STOP','ASSIGN_AUDIO','ADD_AUDIO_TRACK','UPDATE_AUDIO_TRACK','REMOVE_AUDIO_TRACK','SET_ENTRY_POLICY']);
const DESIGN_WORKSPACES=new Set(AGENT_DESIGN_WORKSPACES);
const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const fingerprint=project=>JSON.stringify(normalizeShowProject(project));
function validId(id){return typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(id);}
function fail(code){const error=new TypeError(code);error.code=code;throw error;}

/** Cue numbers are presentation-only. Resolve them ONCE against a source snapshot. */
export function resolveAgentCue(project,reference){
 const p=normalizeShowProject(project);
 if(typeof reference==='number'&&Number.isSafeInteger(reference))
  return p.cues.find(c=>c.number===reference)??null;
 if(typeof reference!=='string'||reference.length>100)return null;
 const term=reference.trim();
 const exact=p.cues.find(c=>c.id===term);
 if(exact)return exact;
 const numbered=/^(?:(?:cue|q)[\s#º°.:_-]*)?0*([1-9]\d{0,4})$/i.exec(term);
 if(numbered)return p.cues.find(c=>c.number===Number(numbered[1]))??null;
 return null;
}
export function buildAgentContext(project,{
 cueIds=null,maxCues=80,maxScriptLines=120,focusLineId=null,assetAvailable=()=>null,
 workspace='ai',mode='design-manual',selectedCueId=null,selectedLineIds=null,
}={}){
 const p=normalizeShowProject(project);
 if(!Number.isSafeInteger(maxCues)||maxCues<1||maxCues>200||
    !Number.isSafeInteger(maxScriptLines)||maxScriptLines<1||maxScriptLines>200||
    !DESIGN_WORKSPACES.has(workspace)||mode!=='design-manual'||
    (selectedCueId!==null&&typeof selectedCueId!=='string')||
    (selectedLineIds!==null&&(!Array.isArray(selectedLineIds)||selectedLineIds.length<1||
      selectedLineIds.length>20||selectedLineIds.some(id=>typeof id!=='string')||
      new Set(selectedLineIds).size!==selectedLineIds.length)))
  fail('INVALID_CONTEXT_LIMIT');
 const cues=cueIds===null?p.cues:p.cues.filter(c=>cueIds.includes(c.id));
 const selectedCue=selectedCueId===null?null:cues.find(c=>c.id===selectedCueId);
 if(selectedCueId!==null&&!selectedCue)fail('INVALID_SELECTED_CUE');
 const boundedCues=cues.slice(0,maxCues);
 if(selectedCue&&!boundedCues.some(c=>c.id===selectedCueId)){
  boundedCues[maxCues-1]=selectedCue;
  boundedCues.sort((a,b)=>a.number-b.number);
 }
 const lines=parseScript(p.scriptText);
 const selectedLines=selectedLineIds===null?null:selectedLineIds.map(id=>{
  const line=lines.find(item=>item.id===id);
  if(!line)fail('INVALID_SELECTED_SCRIPT_LINE');
  return line;
 });
 const focus=Number(/^L([1-9]\d*)$/.exec(focusLineId??'')?.[1])||1;
 const first=Math.max(0,Math.min(focus-1-Math.floor(maxScriptLines/2),Math.max(0,lines.length-maxScriptLines)));
 return {
  projectId:p.id,projectName:p.name,workspace,mode,selectedCueId,
  counts:{cues:p.cues.length,assets:p.assets.length,scriptLines:lines.length},
  truncated:{cues:cues.length>maxCues,script:selectedLines===null&&lines.length>maxScriptLines},
  cues:boundedCues.map(c=>({
   id:c.id,number:c.number,label:c.label,trigger:c.trigger??'',
   notes:c.notes??'',sourceLineIds:[...c.sourceLineIds],
   actions:c.actions.map(a=>a.type==='PLAY'?{type:a.type,assetId:a.assetId}:{type:a.type}),
   automation:c.automation??null,
   playback:c.playback??{},assetIds:[
    ...c.actions.filter(a=>a.type==='PLAY').map(a=>a.assetId),
    ...(c.audioTracks??[]).map(t=>t.assetId)
   ],audioTracks:c.audioTracks??[],entryPolicy:c.entryPolicy??{mode:'OVERLAP',fadeOutMs:0},
   stopCueIds:c.automation?.stopCueIds??[],stopFadeOverrides:c.stopFadeOverrides??{},
   unresolved:c.actions.some(a=>a.type==='PLAN_AUDIO')
  })),
  assets:p.assets.map(a=>({id:a.id,name:a.name,available:assetAvailable(a.id)})),
  lines:(selectedLines??lines.slice(first,first+maxScriptLines)).map(l=>({id:l.id,text:l.text.slice(0,350)}))
 };
}
export function auditAgentProject(project,{assetAvailable=()=>null}={}){
 const p=normalizeShowProject(project),issues=[];
 const add=(code,severity,cueId=null,detail='')=>issues.push({code,severity,cueId,detail});
 const speechMap=new Map();
 for(const c of p.cues){
  if(c.actions.some(a=>a.type==='PLAN_AUDIO'))add('UNRESOLVED_AUDIO','warning',c.id);
  if(!(c.trigger??'').trim())add('NO_VOICE_TRIGGER','info',c.id);
  const key=normalizeSpeech(c.trigger??'');
  if(key){
   const collisions=speechMap.get(key)??[];
   collisions.push(c.id);speechMap.set(key,collisions);
  }
  for(const a of c.actions.filter(x=>x.type==='PLAY')){
   if(assetAvailable(a.assetId)===false)add('MISSING_AUDIO','warning',c.id,a.assetId);
  }
  for(const tr of c.audioTracks??[]){
   if(assetAvailable(tr.assetId)===false)add('MISSING_AUDIO','warning',c.id,tr.assetId);
  }
 }
 for(const [phrase,ids] of speechMap)if(ids.length>1){
  for(const id of ids)add('DUPLICATE_VOICE_TRIGGER','warning',id,phrase.slice(0,100));
 }
 if(!p.cues.length)add('EMPTY_SHOW','warning');
 return {projectId:p.id,cueCount:p.cues.length,issues,
  summary:{warnings:issues.filter(i=>i.severity==='warning').length,
   informational:issues.filter(i=>i.severity==='info').length}};
}
/** Strict tool registry: model output is NEVER executable code. */
export function validateAgentOperations(operations){
 if(!Array.isArray(operations)||operations.length<1||
    operations.length>AGENT_MAX_OPERATIONS)fail('INVALID_OPERATION_COUNT');
 return operations.map((raw,index)=>{
  if(!isRecord(raw)||!EDITABLE.has(raw.op))fail('UNSUPPORTED_AGENT_OPERATION');
  const allowed={
   UPDATE_CUE:['op','cueId','changes'],
   DELETE_CUE:['op','cueId'],
   CREATE_CUE:['op','afterCueId','label'],
   CREATE_CONFIGURED_CUE:['op','afterCueId','label','assetId','sourceLineId','trigger'],
   REORDER_CUE:['op','cueId','targetCueId','position'],
   SET_CUE_STOP:['op','cueId','targetCueId','fadeMs'],
   REMOVE_CUE_STOP:['op','cueId','targetCueId'],
   ASSIGN_AUDIO:['op','cueId','assetId'],
   ADD_AUDIO_TRACK:['op','cueId','assetId','changes'],
   UPDATE_AUDIO_TRACK:['op','cueId','trackId','assetId','changes'],
   REMOVE_AUDIO_TRACK:['op','cueId','trackId'],
   SET_ENTRY_POLICY:['op','cueId','mode','fadeMs'],
  }[raw.op];
  if(Object.keys(raw).some(k=>!allowed.includes(k)))fail('UNEXPECTED_OPERATION_FIELD');
  if(raw.op==='CREATE_CUE'||raw.op==='CREATE_CONFIGURED_CUE'){
   if(raw.afterCueId!==undefined&&raw.afterCueId!==null&&!validId(raw.afterCueId))
    fail('INVALID_CUE_ID');
   if(typeof raw.label!=='string'||!raw.label.trim()||raw.label.length>200)
    fail('INVALID_NEW_CUE_LABEL');
   const created={op:raw.op,afterCueId:raw.afterCueId??null,label:raw.label.trim()};
   if(raw.op==='CREATE_CONFIGURED_CUE'){
    if(!validId(raw.assetId)||typeof raw.sourceLineId!=='string'||
       !/^L[1-9]\d{0,3}$/.test(raw.sourceLineId)||
       typeof raw.trigger!=='string'||!raw.trigger.trim()||raw.trigger.length>300)
     fail('INVALID_HERO_FIELDS');
    return {...created,assetId:raw.assetId,sourceLineId:raw.sourceLineId,trigger:raw.trigger};
   }
   return created;
  }
  if(!validId(raw.cueId))fail('INVALID_CUE_ID');
  if(raw.op==='UPDATE_CUE'){
   const changes=validateCueChatChanges(raw.changes);
   return {op:raw.op,cueId:raw.cueId,changes};
  }
  if(raw.op==='REORDER_CUE'){
   if(!validId(raw.targetCueId)||!['before','after'].includes(raw.position))
    fail('INVALID_REORDER_TARGET');
   return {op:raw.op,cueId:raw.cueId,targetCueId:raw.targetCueId,position:raw.position};
  }
  if(['SET_CUE_STOP','REMOVE_CUE_STOP'].includes(raw.op)){
   if(!validId(raw.targetCueId)||raw.targetCueId===raw.cueId)fail('INVALID_STOP_TARGET');
   if(raw.op==='REMOVE_CUE_STOP')return {op:raw.op,cueId:raw.cueId,targetCueId:raw.targetCueId};
   if(!Number.isSafeInteger(raw.fadeMs)||raw.fadeMs<0||raw.fadeMs>10000)fail('INVALID_STOP_FADE');
   return {op:raw.op,cueId:raw.cueId,targetCueId:raw.targetCueId,fadeMs:raw.fadeMs};
  }
  if(['ASSIGN_AUDIO','ADD_AUDIO_TRACK'].includes(raw.op)){
   if(!validId(raw.assetId))fail('INVALID_AUDIO_ASSET');
   let changes;
   if(raw.op==='ADD_AUDIO_TRACK'&&raw.changes!==undefined){
    changes=validateCueChatChanges(raw.changes);
    if(Object.keys(changes).some(k=>!Object.hasOwn(normalizeCuePlayback(),k)))fail('INVALID_AUDIO_TRACK');
   }
   return {op:raw.op,cueId:raw.cueId,assetId:raw.assetId,...(changes?{changes}:{})};
  }
  if(['UPDATE_AUDIO_TRACK','REMOVE_AUDIO_TRACK'].includes(raw.op)){
   if(!validId(raw.trackId))fail('INVALID_AUDIO_TRACK');
   if(raw.op==='REMOVE_AUDIO_TRACK')return {op:raw.op,cueId:raw.cueId,trackId:raw.trackId};
   if(raw.assetId!==undefined&&!validId(raw.assetId))fail('INVALID_AUDIO_ASSET');
   const changes=raw.changes===undefined&&raw.assetId?{}:validateCueChatChanges(raw.changes);
   if(Object.keys(changes).some(k=>!Object.hasOwn(normalizeCuePlayback(),k)))fail('INVALID_AUDIO_TRACK');
   return {op:raw.op,cueId:raw.cueId,trackId:raw.trackId,
    ...(Object.keys(changes).length?{changes}:{}),...(raw.assetId?{assetId:raw.assetId}:{})};
  }
  if(raw.op==='SET_ENTRY_POLICY'){
   if(!['OVERLAP','STOP_PREVIOUS'].includes(raw.mode)||!Number.isSafeInteger(raw.fadeMs)||
      raw.fadeMs<0||raw.fadeMs>10000)fail('INVALID_ENTRY_POLICY');
   return {op:raw.op,cueId:raw.cueId,mode:raw.mode,fadeMs:raw.fadeMs};
  }
  return {op:raw.op,cueId:raw.cueId};
 });
}
function diffCues(before,after){
 const left=new Map(before.cues.map(c=>[c.id,c]));
 const right=new Map(after.cues.map(c=>[c.id,c]));
 const ids=new Set([...left.keys(),...right.keys()]);
 return [...ids].flatMap(id=>{
  const a=left.get(id),b=right.get(id);
  if(!a)return [{kind:'CREATED',cueId:id,after:{number:b.number,label:b.label,
   trigger:b.trigger??'',sourceLineIds:[...b.sourceLineIds],actions:b.actions.map(action=>({...action}))}}];
  if(!b)return [{kind:'DELETED',cueId:id,before:{number:a.number,label:a.label}}];
  const changes=[];
  // The operator must see ALL changed persisted fields, including indirect
  // automation edits when deleting a target cue. A partial preview is unsafe.
  for(const key of ['number','label','trigger','notes','playback',
   'sourceLineIds','actions','automation','stopFadeOverrides','audioTracks',
   'entryPolicy','sourceProposalId','origin']){
   if(JSON.stringify(a[key]??null)!==JSON.stringify(b[key]??null))
    changes.push({field:key,from:a[key]??null,to:b[key]??null});
  }
  return changes.length?[{kind:'UPDATED',cueId:id,changes}]:[];
 });
}
/** Simulate a bounded batch on independent show copies. Any failure aborts ALL. */
export function prepareAgentPlan(project,operations,{assetAvailable=()=>false}={}){
 const base=normalizeShowProject(project),checked=validateAgentOperations(operations);
 let next=base;
 for(const [index,op] of checked.entries()){
  try{
   if(op.op==='UPDATE_CUE')next=stageCueConversationChange(next,op.cueId,op.changes).project;
   else if(op.op==='DELETE_CUE')next=deleteOperatorCue(next,op.cueId);
   else if(op.op==='CREATE_CUE')
    next=insertManualCue(next,{afterCueId:op.afterCueId,label:op.label}).project;
   else if(op.op==='CREATE_CONFIGURED_CUE'){
    validateHeroCueOperation(next,op,{assetAvailable});
    const added=insertManualCue(next,{afterCueId:op.afterCueId,label:op.label});
    next=assignAudioToCue(added.project,added.cueId,op.assetId);
    next=normalizeShowProject({...next,cues:next.cues.map(cue=>cue.id===added.cueId
     ?{...cue,sourceLineIds:[op.sourceLineId],trigger:op.trigger}:cue)});
   }
   else if(op.op==='REORDER_CUE')
    next=reorderOperatorCue(next,op.cueId,op.targetCueId,op.position);
   else if(['SET_CUE_STOP','REMOVE_CUE_STOP'].includes(op.op)){
    const cue=next.cues.find(c=>c.id===op.cueId),target=next.cues.find(c=>c.id===op.targetCueId);
    if(!cue||!target)fail('INVALID_STOP_TARGET');
    const transitions=(cue.automation?.stopCueIds??[]).filter(id=>id!==op.targetCueId).map(id=>({
     targetCueId:id,fadeMs:cue.stopFadeOverrides?.[id]??next.cues.find(c=>c.id===id)?.playback?.fadeOutMs??0,
    }));
    if(op.op==='SET_CUE_STOP')transitions.push({targetCueId:op.targetCueId,fadeMs:op.fadeMs});
    next=normalizeShowProject(stageCueStopTransitions(next,op.cueId,transitions));
   }
   else if(['ASSIGN_AUDIO','ADD_AUDIO_TRACK'].includes(op.op)){
    if(!next.assets.some(a=>a.id===op.assetId)||assetAvailable(op.assetId)!==true)fail('AUDIO_ASSET_UNAVAILABLE');
    const cue=next.cues.find(c=>c.id===op.cueId);
    if(op.op==='ADD_AUDIO_TRACK'){
     next=stageAddCueTrack(next,op.cueId,op.assetId);
     const added=next.cues.find(c=>c.id===op.cueId).audioTracks.at(-1);
     if(op.changes)next=stageChangeCueTrack(next,op.cueId,added.id,{
      playback:normalizeConversationalPlayback(added.playback,op.changes),
     });
     next=normalizeShowProject(next);
    }
    else next=cue?.actions[0]?.type==='PLAN_AUDIO'?assignAudioToCue(next,op.cueId,op.assetId):
     replaceCueAudioAsset(next,op.cueId,op.assetId);
   }
   else if(op.op==='UPDATE_AUDIO_TRACK'){
    const track=next.cues.find(c=>c.id===op.cueId)?.audioTracks?.find(t=>t.id===op.trackId);
    if(!track)fail('INVALID_AUDIO_TRACK');
    if(op.assetId&&(!next.assets.some(a=>a.id===op.assetId)||assetAvailable(op.assetId)!==true))
     fail('AUDIO_ASSET_UNAVAILABLE');
    next=normalizeShowProject(stageChangeCueTrack(next,op.cueId,op.trackId,{
     ...(op.assetId?{assetId:op.assetId}:{}),
     playback:normalizeConversationalPlayback(track.playback,op.changes),
    }));
   }
   else if(op.op==='REMOVE_AUDIO_TRACK')
    next=normalizeShowProject(stageRemoveCueTrack(next,op.cueId,op.trackId));
   else if(op.op==='SET_ENTRY_POLICY')
    next=setCueEntryPolicy(next,op.cueId,{mode:op.mode,fadeOutMs:op.fadeMs});
  }catch(error){
   const err=new TypeError('AGENT_PLAN_FAILED_AT_'+index);
   err.code=['LOOP_NEEDS_TARGETED_STOP','AUDIO_ASSET_UNAVAILABLE','INVALID_STOP_TARGET','INVALID_AUDIO_TRACK'].includes(error.code??error.message)
    ?error.code??error.message:'AGENT_PLAN_FAILED';
   err.cause=error;throw err;
  }
 }
 const changes=diffCues(base,next);
 if(!changes.length)fail('AGENT_PLAN_NO_CHANGES');
 return {projectId:base.id,baseSnapshot:fingerprint(base),afterSnapshot:fingerprint(next),
  operations:checked,changes,proposedProject:next,
  structural:checked.some(o=>['DELETE_CUE','CREATE_CUE','CREATE_CONFIGURED_CUE','REORDER_CUE'].includes(o.op))};
}
/** Caller owns mode/audio guards; no hidden bypass for Stage/operation. */
export function commitAgentPlan(current,plan,{editable=false,assetAvailable=()=>false}={}){
 if(!editable)fail('AGENT_EDIT_NOT_ALLOWED');
 if(!isRecord(plan)||typeof plan.baseSnapshot!=='string'||
    typeof plan.afterSnapshot!=='string'||!Array.isArray(plan.operations))fail('INVALID_AGENT_PLAN');
 if(fingerprint(current)!==plan.baseSnapshot)fail('STALE_AGENT_PLAN');
 // Re-run all validators on the CURRENT document; never trust a cached proposedProject.
 const freshlyPrepared=prepareAgentPlan(current,plan.operations,{assetAvailable});
 if(freshlyPrepared.afterSnapshot!==plan.afterSnapshot)fail('AGENT_PLAN_CHANGED');
 return {project:freshlyPrepared.proposedProject,
  undo:{before:normalizeShowProject(current),afterSnapshot:freshlyPrepared.afterSnapshot},
  changes:freshlyPrepared.changes,structural:freshlyPrepared.structural};
}
export function undoAgentPlan(current,undo,{editable=false}={}){
 if(!editable)fail('AGENT_EDIT_NOT_ALLOWED');
 if(!undo||!isRecord(undo.before)||typeof undo.afterSnapshot!=='string')fail('INVALID_UNDO');
 if(fingerprint(current)!==undo.afterSnapshot)fail('STALE_AGENT_UNDO');
 return normalizeShowProject(undo.before);
}
