/**
 * RunQ conversational edit contracts. All changes are pure, explicitly staged
 * and passed through the same strict cue validators used by the manual editor.
 * Neither the model nor this module may operate GO or audio transport.
 */
import {normalizeShowProject} from './projectPersistence.mjs';
import {normalizeCuePlayback} from './cuePlayback.mjs';
import {updateCuePlayback,updateCueOperatorDetails} from './workspace.mjs';

export const CUE_CHAT_FIELDS=Object.freeze([
 'gainDb','fadeInMs','fadeOutMs','startDelayMs','startAtMs','endAtMs',
 'playbackRate','pan','loop','repeatCount','label','trigger','notes',
]);
const FIELDS=new Set(CUE_CHAT_FIELDS);
const TIME_FIELDS=new Set(['fadeInMs','fadeOutMs','startDelayMs','startAtMs','endAtMs']);
const BOOLEAN_FIELDS=new Set(['loop']);
const TEXT_FIELDS=new Set(['label','trigger','notes']);
const VAL_FIELDS=new Set(['gainDb','playbackRate','pan','repeatCount']);
const whole=value=>typeof value==='number'&&Number.isSafeInteger(value);
export function validateCueChatChanges(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('INVALID_CHANGES');
 const keys=Object.keys(input);
 if(!keys.length||keys.length>8||keys.some(key=>!FIELDS.has(key)))throw new TypeError('INVALID_CHANGES');
 const value={};
 for(const key of keys){
  const item=input[key];
  if(TEXT_FIELDS.has(key)){
   const max=key==='notes'?1500:key==='label'?200:300;
   if(typeof item!=='string'||item.length>max||(key==='label'&&!item.trim()))
    throw new TypeError('INVALID_TEXT_'+key);
   value[key]=item.trim();
  }else if(key==='endAtMs'){
   if(item!==null&&(!whole(item)||item<1||item>600000))throw new TypeError('INVALID_END');
   value[key]=item;
  }else if(TIME_FIELDS.has(key)){
   if(!whole(item)||item<0||item>(key==='startAtMs'?600000:10000))throw new TypeError('INVALID_TIME_'+key);
   value[key]=item;
  }else if(BOOLEAN_FIELDS.has(key)){
   if(typeof item!=='boolean')throw new TypeError('INVALID_LOOP');
   value[key]=item;
  }else if(VAL_FIELDS.has(key)){
   if(typeof item!=='number'||!Number.isFinite(item))throw new TypeError('INVALID_VALUE_'+key);
   value[key]=item;
  }
 }
 return Object.freeze(value);
}
function currentCue(project,id){
 const cue=project.cues.find(x=>x.id===id);
 if(!cue||cue.status!=='DRAFT')throw new TypeError('CUE_NOT_EDITABLE');
 return cue;
}
export function stageCueConversationChange(project,cueId,changes){
 const base=normalizeShowProject(project),before=currentCue(base,cueId),edit=validateCueChatChanges(changes);
 const playback={};const details={};
 for(const [key,val] of Object.entries(edit))(TEXT_FIELDS.has(key)?details:playback)[key]=val;
 let next=base;
 if(Object.keys(playback).length){
  next=updateCuePlayback(next,cueId,playback);
 }
 if(Object.keys(details).length){
  const from=next.cues.find(x=>x.id===cueId);
  next=updateCueOperatorDetails(next,cueId,{
   label:details.label??from.label,
   trigger:details.trigger??from.trigger??'',
   notes:details.notes??from.notes??'',
  });
 }
 const after=currentCue(next,cueId),oldPlayback=normalizeCuePlayback(before.playback),
  newPlayback=normalizeCuePlayback(after.playback);
 const diff=[];
 for(const key of Object.keys(edit)){
  const original=TEXT_FIELDS.has(key)?before[key]??'':oldPlayback[key];
  const updated=TEXT_FIELDS.has(key)?after[key]??'':newPlayback[key];
  if(!Object.is(original,updated))diff.push({field:key,from:original,to:updated});
 }
 return Object.freeze({project:next,cueId,diff,changes:edit});
}
export function applyCueConversationDraft(original,draft){
 // No model or partial patch may edit a changed project behind the operator.
 const current=normalizeShowProject(original);
 if(!draft||typeof draft!=='object'||draft.cueId==null||!draft.changes)
  throw new TypeError('INVALID_DRAFT');
 return stageCueConversationChange(current,draft.cueId,draft.changes);
}

/** Accept only structured local/AI responses, never instructions or executable code. */
export function validateCueChatModelReply(reply){
 if(!reply||typeof reply!=='object'||Array.isArray(reply)||
  Object.keys(reply).some(x=>!['status','message','changes'].includes(x))||
  !['PATCH','CLARIFY','UNSUPPORTED'].includes(reply.status)||
  typeof reply.message!=='string'||reply.message.length>500)
  throw new TypeError('INVALID_MODEL_REPLY');
 if(reply.status==='PATCH'){
  return {status:'PATCH',message:reply.message,changes:validateCueChatChanges(reply.changes)};
 }
 if(reply.changes!==null&&reply.changes!==undefined&&Object.keys(reply.changes).length)
  throw new TypeError('INVALID_MODEL_REPLY');
 return {status:reply.status,message:reply.message,changes:null};
}
const words={cero:0,uno:1,una:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,
 one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
function amount(input){
 const s=input.toLowerCase().replace(',','.');
 if(Object.hasOwn(words,s))return words[s];
 const val=Number(s);return Number.isFinite(val)?val:null;
}
/** Free offline parser for precise, low-risk commands. Returns null for complex language: Meta handles it. */
export function parseLocalCueChat(text,{lastField=null}={}){
 if(typeof text!=='string'||text.length>1200||!text.trim())return null;
 const t=text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const changes={};
 const db=/(?:^|[\s,;])(-?\d{1,2}(?:[.,]\d+)?)\s*d\s*b\b/i.exec(t);
 if(db&&(t.includes('volumen')||t.includes('gain')||t.includes('db')||lastField==='gainDb')){
  changes.gainDb=Number(db[1].replace(',','.'));
 }
 const specs=[
  ['fadeInMs',/(?:fade\s*in|fundido\s*de\s*entrada|entrada\s*gradual|entrada\s*suave)/],
  ['fadeOutMs',/(?:fade\s*out|fundido\s*de\s*salida|salida\s*gradual|salida\s*suave)/],
  ['startDelayMs',/(?:retardo|delay|espera)/],
 ];
 for(const [field,matcher] of specs){
  const m=matcher.exec(t);
  if(!m)continue;
  const after=t.slice(m.index+m[0].length, m.index+m[0].length+65);
  const time=/(?:de|a|en|of|for|to)?\s*(\d+(?:[.,]\d+)?|cero|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|one|two|three|four|five|six|seven|eight|nine|ten)\s*(segundos?|seconds?|s\b|ms\b|milisegundos?)?/i.exec(after);
  if(!time||!time[2])continue;
  const value=amount(time[1]);if(value!==null)changes[field]=Math.round(value*(/ms|milisegundo/.test(time[2])?1:1000));
 }
 if(/\b(sin\s+loop|quitar\s+loop|desactivar\s+(?:el\s+)?bucle|no\s+(?:hacer|poner)\s+loop|disable\s+loop|no\s+loop)\b/.test(t))
  changes.loop=false;
 else if(/\b(en\s+bucle|en\s+loop|activar\s+(?:el\s+)?bucle|loop\s+infinito|loop\s+on|enable\s+loop)\b/.test(t))
  changes.loop=true;
 const correction=/^(?:mejor|cambialo|cambia eso|actually|instead|make it|no,? mejor|ponlo)\s+(?:que\s+(?:sean|sea)\s+|a\s+|en\s+)?(\d+(?:[.,]\d+)?|cero|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|one|two|three|four|five|six|seven|eight|nine|ten)\s*(segundos?|seconds?|ms|milisegundos?)?/i.exec(t);
 if(!Object.keys(changes).length&&correction&&lastField){
  const val=amount(correction[1]);
  if(val!==null){
   if(TIME_FIELDS.has(lastField)&&lastField!=='endAtMs'&&correction[2])
    changes[lastField]=Math.round(val*(/ms|milisegundo/.test(correction[2])?1:1000));
   else if(lastField==='gainDb'&&/(db|decibel|a -?\d)/.test(t))changes.gainDb=val;
  }
 }
 if(!Object.keys(changes).length)return null;
 try{return validateCueChatChanges(changes);}catch{return null;}
}
