/**
 * Deterministic case builder + judge for the REAL agent evaluation (2026-10-31).
 * Gold is "author preregistered, NOT human validated". Criteria are fixed
 * BEFORE any paid call; cases.lock.json stores sha256 of this file and of the
 * scene corpus so criteria cannot drift after responses are seen.
 */
import {createNewShow,addAudioReference,assignAudioToCue} from '../src/core/workspace.mjs';
import {insertManualCue} from '../src/core/manualCues.mjs';
import {normalizeShowProject} from '../src/core/projectPersistence.mjs';
import {normalizeCuePlayback} from '../src/core/cuePlayback.mjs';
import {SCENES} from '../fixtures/qa/theatre-real/scenes.mjs';

export const FUNCTIONS=['delete-number','delete-description','move','update-gain','update-fade','rename',
 'create-named','create-multiple','voice-trigger','notes-actor','query','negation','transport','nonexistent-cue',
 'ambiguity','artistic','followup'];
const SPEAKER=/^([^:：()[\]{}]{1,48})[:：]\s*(.+)$/;
const norm=s=>String(s??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();

export function buildSceneProject(scene){
 let p=createNewShow({id:'real-'+scene.id.toLowerCase(),name:scene.title,scriptText:scene.lines.join('\n')});
 const wanted=[...new Set(scene.cues.map(c=>c[2]))];
 for(const name of wanted)p=addAudioReference(p,name);
 for(const [label] of scene.cues)p=insertManualCue(p,{label}).project;
 scene.cues.forEach(([,line,asset],i)=>{
  const assetId=p.assets.find(a=>a.name===asset).id;
  p=assignAudioToCue(p,p.cues[i].id,assetId);
 });
 p=normalizeShowProject({...p,cues:p.cues.map((c,i)=>({...c,sourceLineIds:['L'+scene.cues[i][1]]}))});
 return p;
}

const L=(lang,es,en)=>lang==='es'?es:en;

function specsFor(scene){
 const {lang,cues}=scene,n=cues.length;
 const twin=new Set(scene.twin?.cues??[]);
 const free=cues.map((_,i)=>i+1).filter(i=>!twin.has(i));
 const rot=Array.from(scene.id).reduce((a,ch)=>a+ch.charCodeAt(0),0);
 const at=k=>free[(rot+k)%free.length];
 const label=k=>cues[k-1][0];
 const out=[];
 const add=(fn,prompt,expect,extra={})=>out.push({fn,prompt,expect,...extra});
 let k=at(0);
 add('delete-number',L(lang,`Elimina el cue ${k}`,`Delete cue ${k}`),{kind:'DELETE',n:k,statuses:['PLAN']});
 k=at(1);
 add('delete-description',L(lang,`Borra el cue «${label(k)}»`,`Remove the cue "${label(k)}"`),{kind:'DELETE',n:k,statuses:['PLAN']});
 k=at(2);
 const m=n;const mv=k===m?1:k;
 add('move',L(lang,`Mueve el cue ${mv} después del cue ${m===mv?2:m}`,`Move cue ${mv} after cue ${m===mv?2:m}`),
  {kind:'MOVE',n:mv,m:m===mv?2:m,after:true,statuses:['PLAN']});
 k=at(3);
 add('update-gain',L(lang,`Baja el volumen del cue «${label(k)}» a -12 dB`,`Lower the volume of the cue "${label(k)}" to -12 dB`),
  {kind:'UPDATE',n:k,playback:{gainDb:-12},statuses:['PLAN']});
 k=at(4);
 add('update-fade',L(lang,`Pon un fade in de 3 segundos en el cue ${k}`,`Give cue ${k} a 3 second fade in`),
  {kind:'UPDATE',n:k,playback:{fadeInMs:3000},statuses:['PLAN']});
 k=at(5);
 const nn=L(lang,'Ambiente nocturno','Night ambience');
 add('rename',L(lang,`Renombra el cue ${k} como «${nn}»`,`Rename cue ${k} to "${nn}"`),{kind:'RENAME',n:k,label:nn,statuses:['PLAN']});
 const cn=L(lang,'Aplausos finales','Curtain applause');
 add('create-named',L(lang,`Crea un cue llamado «${cn}» al final`,`Create a cue called "${cn}" at the end`),
  {kind:'CREATE_NAMED',label:cn,statuses:['PLAN']});
 add('create-multiple',L(lang,'Añade dos cues vacíos al final del show','Add two empty cues at the end of the show'),
  {kind:'CREATE_COUNT',count:2,statuses:['PLAN']});
 k=at(6);
 add('voice-trigger',L(lang,`Pon como pie de voz del cue ${k} la frase que dice el actor justo antes de ese efecto`,
  `Set the voice trigger of cue ${k} to the line the actor says right before that effect`),
  {kind:'TRIGGER',n:k,statuses:['PLAN','CLARIFY']});
 k=at(7);
 add('notes-actor',L(lang,`Anota en el cue ${k} qué actor habla justo antes`,`Add a note on cue ${k} saying which actor speaks right before it`),
  {kind:'NOTES',n:k,statuses:['PLAN']});
 k=at(8);
 add('query',L(lang,`¿Qué hace el cue ${k}?`,`What does cue ${k} do?`),{kind:'ANSWER',n:k,statuses:['ANSWER']});
 k=at(9);
 add('negation',L(lang,`No borres el cue ${k}`,`Do not delete cue ${k}`),{kind:'NOOP',statuses:['ANSWER','CLARIFY']});
 k=at(10);
 add('transport',L(lang,`Dale GO al cue ${k} ahora`,`Fire cue ${k} now with GO`),{kind:'NOOP',statuses:['ANSWER','CLARIFY']});
 add('nonexistent-cue',L(lang,`Elimina el cue ${n+40}`,`Delete cue ${n+40}`),{kind:'NOOP',statuses:['ANSWER','CLARIFY']});
 if(scene.twin){
  const w=scene.twin.keyword;
  add('ambiguity',L(lang,`Borra el cue de la ${w}`,`Delete the ${w} cue`),{kind:'NOOP',statuses:['CLARIFY']});
 }
 add('artistic',L(lang,'Propón hasta tres cues de cierre para esta escena','Propose up to three closing cues for this scene'),
  {kind:'ART',statuses:['PLAN','ANSWER']});
 k=at(11);
 add('followup',L(lang,'A -9 dB','At -9 dB'),{kind:'UPDATE',n:k,playback:{gainDb:-9},statuses:['PLAN']},
  {conversation:[{role:'user',text:L(lang,`Quiero bajar el volumen del cue ${k}`,`I want to lower the volume of cue ${k}`)},
   {role:'assistant',text:L(lang,'Claro, ¿a cuántos dB lo dejo?','Sure, to how many dB?')}]});
 return out;
}

export function buildCases(){
 const cases=[];
 for(const scene of SCENES){
  const project=buildSceneProject(scene);
  for(const s of specsFor(scene)){
   cases.push({id:`${scene.id}-${s.fn}`,scene:scene.id,split:scene.split,language:scene.lang,fn:s.fn,
    prompt:s.prompt,conversation:s.conversation??[],expect:s.expect,projectId:project.id});
  }
 }
 return cases;
}

const snap=p=>JSON.stringify(p.cues);
const SAFE_OPS=new Set(['UPDATE_CUE','DELETE_CUE','CREATE_CUE','REORDER_CUE']);

function targetIds(original,expect){
 const ids=[expect.n,expect.m].filter(Number.isInteger).map(i=>original.cues[i-1]?.id).filter(Boolean);
 return new Set(ids);
}

/** Pure project-level judge: null = exact modification correct. */
export function judgeProject(original,final,expect){
 const ids=original.cues.map(c=>c.id),fids=final.cues.map(c=>c.id);
 const target=expect.n?original.cues[expect.n-1]:null;
 const othersIntact=skip=>original.cues.every((c,i)=>c.id===skip||JSON.stringify(c)===JSON.stringify(final.cues.find(f=>f.id===c.id)));
 switch(expect.kind){
  case 'NOOP':case 'ANSWER':return snap(original)===snap(final)?null:'PROJECT_CHANGED_UNEXPECTEDLY';
  case 'DELETE':return JSON.stringify(ids.filter(i=>i!==target.id))===JSON.stringify(fids)?null:'WRONG_CUES_AFTER_DELETE';
  case 'MOVE':{
   const a=target.id,b=original.cues[expect.m-1].id,rest=ids.filter(i=>i!==a);
   rest.splice(rest.indexOf(b)+(expect.after?1:0),0,a);
   return JSON.stringify(rest)===JSON.stringify(fids)?null:'WRONG_ORDER_AFTER_MOVE';
  }
  case 'CREATE_NAMED':
   return fids.length===ids.length+1&&JSON.stringify(fids.slice(0,ids.length))===JSON.stringify(ids)&&
    norm(final.cues.at(-1).label)===norm(expect.label)?null:'WRONG_CREATE';
  case 'CREATE_COUNT':
   return fids.length===ids.length+expect.count&&JSON.stringify(fids.slice(0,ids.length))===JSON.stringify(ids)?null:'WRONG_CREATE_COUNT';
  case 'UPDATE':{
   if(JSON.stringify(ids)!==JSON.stringify(fids))return 'ORDER_CHANGED';
   const after=final.cues.find(c=>c.id===target.id),pb=normalizeCuePlayback(after.playback);
   for(const [key,value] of Object.entries(expect.playback))if(pb[key]!==value)return 'FIELD_'+key+'_NOT_APPLIED';
   return othersIntact(target.id)?null:'OTHER_CUES_CHANGED';
  }
  case 'RENAME':{
   const after=final.cues.find(c=>c.id===target.id);
   if(norm(after?.label)!==norm(expect.label))return 'LABEL_NOT_APPLIED';
   return othersIntact(target.id)&&JSON.stringify(ids)===JSON.stringify(fids)?null:'OTHER_CUES_CHANGED';
  }
  case 'TRIGGER':{
   const after=final.cues.find(c=>c.id===target.id),trig=norm(after?.trigger);
   const lines=original.scriptText.split(/\r?\n/);
   const anchor=Number(/^L(\d+)$/.exec(target.sourceLineIds[0]??'')?.[1])||0;
   let speech=null;
   for(let i=anchor-1;i>=Math.max(1,anchor-12);i--){const m=SPEAKER.exec(lines[i-1]??'');if(m){speech={speaker:m[1],text:m[2]};break;}}
   if(!speech)return 'NO_GOLD_DIALOGUE';
   if(trig.split(' ').filter(Boolean).length<3)return 'TRIGGER_TOO_SHORT_OR_EMPTY';
   if(!norm(speech.text).includes(trig))return 'TRIGGER_NOT_VERBATIM_DIALOGUE';
   if(trig.includes(norm(speech.speaker)))return 'TRIGGER_CONTAINS_ACTOR_NAME';
   return othersIntact(target.id)?null:'OTHER_CUES_CHANGED';
  }
  case 'NOTES':{
   const after=final.cues.find(c=>c.id===target.id);
   const lines=original.scriptText.split(/\r?\n/);
   const anchor=Number(/^L(\d+)$/.exec(target.sourceLineIds[0]??'')?.[1])||0;
   let speaker=null;
   for(let i=anchor-1;i>=Math.max(1,anchor-12);i--){const m=SPEAKER.exec(lines[i-1]??'');if(m){speaker=m[1];break;}}
   if(!speaker)return 'NO_GOLD_DIALOGUE';
   if(!norm(after?.notes).includes(norm(speaker)))return 'NOTES_MISSING_ACTOR';
   if(String(after?.trigger??'')!==String(target.trigger??''))return 'TRIGGER_WRONGLY_CHANGED';
   return othersIntact(target.id)?null:'OTHER_CUES_CHANGED';
  }
  case 'ART':return 'PENDING_HUMAN_REVIEW';
  default:return 'UNKNOWN_EXPECTATION';
 }
}

/**
 * Separate metrics. Each is true/false/null (null = not applicable).
 * interpretation: status allowed AND operation kinds consistent with intent.
 * selection: operations touch exactly the intended cue ids (or none when none expected).
 * modification: resulting project is exactly the gold project change.
 * unauthorized: any operation outside the intended scope or in a no-change case.
 */
export function judgeCase(c,original,response){
 const ops=response?.operations??[];
 const m={interpretation:null,selection:null,modification:null,unauthorized:false,art:null,failure:''};
 if(!response||response.httpStatus!==200){m.failure='NO_VALID_RESPONSE';m.interpretation=false;m.modification=false;return m;}
 const expect=c.expect,noChange=['NOOP','ANSWER'].includes(expect.kind);
 const opSet=new Set(ops.map(o=>o.op));
 if([...opSet].some(o=>!SAFE_OPS.has(o))){m.unauthorized=true;m.failure='FORBIDDEN_OPERATION';}
 const statusOk=expect.statuses.includes(response.status);
 const kindOps={DELETE:['DELETE_CUE'],MOVE:['REORDER_CUE'],UPDATE:['UPDATE_CUE'],RENAME:['UPDATE_CUE'],TRIGGER:['UPDATE_CUE'],
  NOTES:['UPDATE_CUE'],CREATE_NAMED:['CREATE_CUE'],CREATE_COUNT:['CREATE_CUE'],ART:['CREATE_CUE']}[expect.kind]??[];
 const opsOk=noChange?ops.length===0:expect.kind==='ART'?ops.every(o=>o.op==='CREATE_CUE')&&ops.length<=3
  :(ops.length>0?[...opSet].every(o=>kindOps.includes(o)):expect.kind==='TRIGGER'&&response.status==='CLARIFY');
 m.interpretation=statusOk&&opsOk;
 if(noChange&&ops.length)m.unauthorized=true;
 const want=targetIds(original,expect),touched=new Set(ops.flatMap(o=>[o.cueId].filter(Boolean)));
 if(expect.kind==='ANSWER'){
  const t=original.cues[expect.n-1];
  m.selection=norm(response.message).includes(norm(t.label))||new RegExp('\\b'+expect.n+'\\b').test(response.message??'');
 }else if(noChange)m.selection=ops.length===0;
 else if(['CREATE_NAMED','CREATE_COUNT','ART'].includes(expect.kind))m.selection=null;
 else if(expect.kind==='TRIGGER'&&!ops.length)m.selection=response.status==='CLARIFY'?null:false;
 else{
  m.selection=touched.size>0&&[...touched].every(id=>want.has(id))&&[...want].some(id=>touched.has(id));
  if([...touched].some(id=>!want.has(id)))m.unauthorized=true;
 }
 return m;
}
