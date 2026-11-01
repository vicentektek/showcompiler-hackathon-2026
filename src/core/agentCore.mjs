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
import {validateHeroCueOperation} from './heroCue.mjs';
import {assignAudioToCue} from './workspace.mjs';

export const AGENT_MAX_OPERATIONS=30;
export const AGENT_DESIGN_WORKSPACES=Object.freeze([
 'home','script','ai','cues','audio','soundlab','setup','preflight',
]);
const EDITABLE=new Set(['UPDATE_CUE','DELETE_CUE','CREATE_CUE','CREATE_CONFIGURED_CUE','REORDER_CUE']);
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
/** Same JSON size limit that tools/agentRoutes.mjs enforces on the consented context. */
export const AGENT_CONTEXT_MAX_CHARS=15000;
const CONTEXT_STOPWORDS=new Set(('para cuando como este esta esto estos estas pero porque donde desde hasta sobre entre '+
 'todo toda todos todas otro otra otros otras cual cuales quien algo hace hacer puedes podrias quiero necesito favor '+
 'sonido sonidos propon propone proponer pondrias pondria mejora mejorar revisa revisar linea lineas guion '+
 'que los las del una uno unos unas por con sus mis tus muy mas ese esa eso hay fue era son ser han has hoy ahi aqui '+
 'tiene tienen ella ellos usted tambien entonces ahora despues antes siempre nunca mientras efecto usarias '+
 'with that this these those what when where which would could should there their about from into please '+
 'the and for you but not are was were his her she him our out all any can had its one who why how did get got '+
 'let use may new now see way have does will just like some they them then than your more most only also over '+
 'such very here been being cue cues sound sounds make give improve review suggest propose line lines script effect').split(' '));
const STEM_SUFFIXES=['iendo','ando','adas','ados','idas','idos','ing','ada','ado','ida','ido','es','ed','as','os','an','en','s','a','o','e'];
const foldText=text=>String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
function stemWord(word){
 const suffix=STEM_SUFFIXES.find(end=>word.length-end.length>=3&&word.endsWith(end));
 return (suffix?word.slice(0,-suffix.length):word).slice(0,7);
}
function contextTerms(text){
 return new Set((foldText(text).match(/[a-z]{3,}/g)??[])
  .filter(word=>!CONTEXT_STOPWORDS.has(word)).map(stemWord));
}
const termIn=(term,stems)=>stems.has(term)||(term.length>=4&&
 [...stems].some(stem=>stem.length>=4&&(stem.startsWith(term)||term.startsWith(stem))));
/**
 * Script lines the instruction explicitly points at (L#, cue numbers, the selected
 * cue and distinctive keywords), in priority order. Only existing line indexes.
 */
function instructionEvidence(lines,cues,instruction,selectedCue){
 const order=[],index=new Map(lines.map((line,i)=>[line.id,i]));
 const push=(...items)=>{for(const i of items)if(i>=0&&i<lines.length)order.push(i);};
 const text=instruction??'';
 for(const match of text.matchAll(/\bL([1-9]\d{0,5})\b/g)){
  const i=index.get('L'+match[1]);
  if(i!==undefined)push(i,i-1,i+1,i-2,i+2);
 }
 const anchors=[];
 for(const match of text.matchAll(/\b(?:cue|q)\s*[#nº°.]*\s*0*([1-9]\d{0,4})\b/gi)){
  const cue=cues.find(c=>c.number===Number(match[1]));
  if(cue)anchors.push(cue);
 }
 if(selectedCue)anchors.push(selectedCue);
 for(const cue of anchors)for(const id of cue.sourceLineIds.slice(0,3)){
  const i=index.get(id);
  if(i!==undefined)push(i,i-1,i-2,i-3,i-4,i+1);
 }
 const terms=[...contextTerms(text)];
 if(terms.length){
  const lineTerms=lines.map(line=>contextTerms(line.text));
  const common=Math.max(3,Math.ceil(lines.length*0.15));
  const weight=new Map();
  for(const term of terms){
   const df=lineTerms.reduce((n,set)=>n+(termIn(term,set)?1:0),0);
   if(df>0&&df<=common)weight.set(term,Math.log(1+lines.length/df));
  }
  if(weight.size){
   lineTerms.map((set,i)=>[i,[...weight].reduce((sum,[term,w])=>sum+(termIn(term,set)?w:0),0)])
    .filter(([,score])=>score>0).sort((x,y)=>y[1]-x[1]||x[0]-y[0]).slice(0,6)
    .forEach(([i])=>push(i,i-1,i+1));
  }
 }
 return order;
}
function compactAgentCue(c){
 const assetIds=[...c.actions.filter(a=>a.type==='PLAY').map(a=>a.assetId),
  ...(c.audioTracks??[]).map(t=>t.assetId)];
 const playback=c.playback??{};
 return {id:c.id,number:c.number,label:c.label,sourceLineIds:[...c.sourceLineIds],
  ...(c.trigger?{trigger:c.trigger}:{}),...(c.notes?{notes:String(c.notes).slice(0,240)}:{}),
  ...(Object.keys(playback).length?{playback}:{}),...(assetIds.length?{assetIds}:{}),
  unresolved:c.actions.some(a=>a.type==='PLAN_AUDIO')};
}
/** Identity and placement only; the model is told the details exist but were omitted. */
function minimalAgentCue(c){
 const full=compactAgentCue(c);
 return {id:full.id,number:full.number,label:String(full.label).slice(0,120),sourceLineIds:full.sourceLineIds,
  ...(full.assetIds?{assetIds:full.assetIds}:{}),unresolved:full.unresolved,detailsOmitted:true};
}
export function buildAgentContext(project,{
 cueIds=null,maxCues=80,maxScriptLines=120,focusLineId=null,assetAvailable=()=>null,
 workspace='ai',mode='design-manual',selectedCueId=null,selectedLineIds=null,
 instruction=null,maxContextChars=AGENT_CONTEXT_MAX_CHARS,
}={}){
 const p=normalizeShowProject(project);
 if(!Number.isSafeInteger(maxCues)||maxCues<1||maxCues>200||
    !Number.isSafeInteger(maxScriptLines)||maxScriptLines<1||maxScriptLines>200||
    !Number.isSafeInteger(maxContextChars)||maxContextChars<2000||maxContextChars>AGENT_CONTEXT_MAX_CHARS||
    (instruction!==null&&(typeof instruction!=='string'||instruction.length>1600))||
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
 const index=new Map(lines.map((line,i)=>[line.id,i]));
 const center=Math.min(Math.max(0,(Number(/^L([1-9]\d*)$/.exec(focusLineId??'')?.[1])||1)-1),Math.max(0,lines.length-1));
 let order;
 if(selectedLines!==null)order=selectedLines.map(line=>index.get(line.id));
 else order=instructionEvidence(lines,p.cues,instruction,selectedCue);
 const evidence=new Set(order);
 if(selectedLines===null){
  for(let step=0;step<lines.length*2;step++){
   const i=step%2===0?center+step/2:center-(step+1)/2;
   if(i>=0&&i<lines.length)order.push(i);
  }
 }
 const context={
  projectId:p.id,projectName:p.name,workspace,mode,selectedCueId,
  counts:{cues:p.cues.length,assets:p.assets.length,scriptLines:lines.length},
  truncated:{cues:cues.length>maxCues,script:false},
  cues:boundedCues.map(compactAgentCue),
  assets:p.assets.map(a=>({id:a.id,name:a.name,available:assetAvailable(a.id)})),
  lines:[]
 };
 // The server rejects larger contexts. Keep a third of the budget for script lines by
 // omitting unreferenced assets, then the details (not the identity) of cues far from
 // the focus/evidence. Whole cues are dropped only as a last resort, never the selected one.
 const size=()=>JSON.stringify(context).length;
 const detailBudget=maxContextChars-Math.floor(maxContextChars/3);
 const dropBudget=maxContextChars-Math.min(1500,Math.floor(maxContextChars/4));
 if(size()>detailBudget){
  const referenced=new Set(context.cues.flatMap(c=>c.assetIds??[]));
  const kept=context.assets.filter(a=>referenced.has(a.id));
  if(kept.length<context.assets.length){context.assets=kept;context.truncated.assets=true;}
 }
 const rank=cue=>{
  if(cue.id===selectedCueId)return -1;
  const at=cue.sourceLineIds.map(id=>index.get(id)).filter(i=>i!==undefined);
  if(at.some(i=>evidence.has(i)))return -1;
  return at.length?Math.min(...at.map(i=>Math.abs(i-center))):Number.MAX_SAFE_INTEGER;
 };
 const farthest=()=>context.cues.map((cue,k)=>[k,rank(cue)]).sort((x,y)=>y[1]-x[1]||y[0]-x[0]);
 for(const [k,r] of farthest()){
  if(size()<=detailBudget||r<0)break;
  context.cues[k]=minimalAgentCue(boundedCues[k]);context.truncated.cueDetails=true;
 }
 while(context.cues.length>1&&size()>dropBudget){
  const [k]=farthest().find(([j])=>context.cues[j].id!==selectedCueId);
  context.cues.splice(k,1);boundedCues.splice(k,1);context.truncated.cues=true;
 }
 const byIndex=new Map(lines.map((line,i)=>[i,{id:line.id,text:line.text.slice(0,350)}]));
 let used=JSON.stringify(context).length;
 const chosen=new Set();
 for(const i of order){
  if(chosen.size>=maxScriptLines)break;
  if(chosen.has(i))continue;
  const cost=JSON.stringify(byIndex.get(i)).length+1;
  if(used+cost>maxContextChars)continue;
  chosen.add(i);used+=cost;
 }
 const picked=selectedLines!==null?order.filter(i=>chosen.has(i)):[...chosen].sort((x,y)=>x-y);
 context.lines=picked.map(i=>byIndex.get(i));
 context.truncated.script=selectedLines===null?context.lines.length<lines.length:
  context.lines.length<selectedLines.length;
 return context;
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
