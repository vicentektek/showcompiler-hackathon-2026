/**
 * RUNQ Agent: read-only context, stable cue identity and atomic proposals.
 * NO transport, model calls, file I/O, or automatic application.
 * The existing show schema remains unchanged.
 */
import {parseScript} from './script.mjs';
import {normalizeShowProject} from './projectPersistence.mjs';
import {stageCueConversationChange,validateCueChatChanges} from './cueConversation.mjs';
import {insertManualCue,deleteOperatorCue,reorderOperatorCue} from './manualCues.mjs';
import {normalizeSpeech} from './voiceFollow.mjs';

export const AGENT_MAX_OPERATIONS=30;
const EDITABLE=new Set(['UPDATE_CUE','DELETE_CUE','CREATE_CUE','REORDER_CUE']);
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
 cueIds=null,maxCues=80,maxScriptLines=120,focusLineId=null,assetAvailable=()=>null
}={}){
 const p=normalizeShowProject(project);
 if(!Number.isSafeInteger(maxCues)||maxCues<1||maxCues>200||
    !Number.isSafeInteger(maxScriptLines)||maxScriptLines<1||maxScriptLines>200)
  fail('INVALID_CONTEXT_LIMIT');
 const cues=cueIds===null?p.cues:p.cues.filter(c=>cueIds.includes(c.id));
 const lines=parseScript(p.scriptText);
 const focus=Number(/^L([1-9]\d*)$/.exec(focusLineId??'')?.[1])||1;
 const first=Math.max(0,Math.min(focus-1-Math.floor(maxScriptLines/2),Math.max(0,lines.length-maxScriptLines)));
 return {
  projectId:p.id,projectName:p.name,
  counts:{cues:p.cues.length,assets:p.assets.length,scriptLines:lines.length},
  truncated:{cues:cues.length>maxCues,script:lines.length>maxScriptLines},
  cues:cues.slice(0,maxCues).map(c=>({
   id:c.id,number:c.number,label:c.label,trigger:c.trigger??'',
   notes:c.notes??'',sourceLineIds:[...c.sourceLineIds],
   playback:c.playback??{},assetIds:[
    ...c.actions.filter(a=>a.type==='PLAY').map(a=>a.assetId),
    ...(c.audioTracks??[]).map(t=>t.assetId)
   ],unresolved:c.actions.some(a=>a.type==='PLAN_AUDIO')
  })),
  assets:p.assets.map(a=>({id:a.id,name:a.name,available:assetAvailable(a.id)})),
  lines:lines.slice(first,first+maxScriptLines).map(l=>({id:l.id,text:l.text.slice(0,350)}))
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
   REORDER_CUE:['op','cueId','targetCueId','position'],
  }[raw.op];
  if(Object.keys(raw).some(k=>!allowed.includes(k)))fail('UNEXPECTED_OPERATION_FIELD');
  if(raw.op==='CREATE_CUE'){
   if(raw.afterCueId!==undefined&&raw.afterCueId!==null&&!validId(raw.afterCueId))
    fail('INVALID_CUE_ID');
   if(typeof raw.label!=='string'||!raw.label.trim()||raw.label.length>200)
    fail('INVALID_NEW_CUE_LABEL');
   return {op:raw.op,afterCueId:raw.afterCueId??null,label:raw.label.trim()};
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
  return {op:raw.op,cueId:raw.cueId};
 });
}
function diffCues(before,after){
 const left=new Map(before.cues.map(c=>[c.id,c]));
 const right=new Map(after.cues.map(c=>[c.id,c]));
 const ids=new Set([...left.keys(),...right.keys()]);
 return [...ids].flatMap(id=>{
  const a=left.get(id),b=right.get(id);
  if(!a)return [{kind:'CREATED',cueId:id,after:{number:b.number,label:b.label}}];
  if(!b)return [{kind:'DELETED',cueId:id,before:{number:a.number,label:a.label}}];
  const changes=[];
  for(const key of ['number','label','trigger','notes','playback']){
   if(JSON.stringify(a[key]??null)!==JSON.stringify(b[key]??null))
    changes.push({field:key,from:a[key]??null,to:b[key]??null});
  }
  return changes.length?[{kind:'UPDATED',cueId:id,changes}]:[];
 });
}
/** Simulate a bounded batch on independent show copies. Any failure aborts ALL. */
export function prepareAgentPlan(project,operations){
 const base=normalizeShowProject(project),checked=validateAgentOperations(operations);
 let next=base;
 for(const [index,op] of checked.entries()){
  try{
   if(op.op==='UPDATE_CUE')next=stageCueConversationChange(next,op.cueId,op.changes).project;
   else if(op.op==='DELETE_CUE')next=deleteOperatorCue(next,op.cueId);
   else if(op.op==='CREATE_CUE')
    next=insertManualCue(next,{afterCueId:op.afterCueId,label:op.label}).project;
   else if(op.op==='REORDER_CUE')
    next=reorderOperatorCue(next,op.cueId,op.targetCueId,op.position);
  }catch(error){
   const err=new TypeError('AGENT_PLAN_FAILED_AT_'+index);
   err.code='AGENT_PLAN_FAILED';err.cause=error;throw err;
  }
 }
 const changes=diffCues(base,next);
 if(!changes.length)fail('AGENT_PLAN_NO_CHANGES');
 return {projectId:base.id,baseSnapshot:fingerprint(base),afterSnapshot:fingerprint(next),
  operations:checked,changes,proposedProject:next,
  structural:checked.some(o=>o.op!=='UPDATE_CUE')};
}
/** Caller owns mode/audio guards; no hidden bypass for Stage/operation. */
export function commitAgentPlan(current,plan,{editable=false}={}){
 if(!editable)fail('AGENT_EDIT_NOT_ALLOWED');
 if(!isRecord(plan)||typeof plan.baseSnapshot!=='string'||
    typeof plan.afterSnapshot!=='string'||!Array.isArray(plan.operations))fail('INVALID_AGENT_PLAN');
 if(fingerprint(current)!==plan.baseSnapshot)fail('STALE_AGENT_PLAN');
 // Re-run all validators on the CURRENT document; never trust a cached proposedProject.
 const freshlyPrepared=prepareAgentPlan(current,plan.operations);
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
