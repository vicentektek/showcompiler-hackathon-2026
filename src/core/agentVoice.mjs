/**
 * Conservative voice-foot suggestions from ORIGINAL dialogue lines.
 * No ASR, auto arm, GO or external AI inference. Ambiguous/unanchored cues abstain.
 */
import {normalizeShowProject} from './projectPersistence.mjs';
import {parseScript} from './script.mjs';
import {compareSpeech,normalizeSpeech} from './voiceFollow.mjs';
export const MAX_VOICE_BATCH=24;
function sourceIndex(id){return Number(/^L([1-9]\d*)$/.exec(id??'')?.[1])||0;}
function dialogue(text){
 const match=/^\s*([^:：]{1,48})\s*[:：]\s*(.{8,})$/.exec(text);
 if(!match)return null;
 const speaker=match[1].trim(),speech=match[2].trim();
 if(/^(?:ESCENA|SCENE|ACT|ACTO|ACOTACI[ÓO]N|STAGE|SFX|FX|SONIDO|SOUND|LIGHT|LX|CUE)\b/i.test(speaker))
  return null;
 if(/[()[\]{}]/.test(speaker)||/^[[(]/.test(speech))return null;
 const words=speech.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)??[];
 if(words.length<4)return null;
 return {speaker,words,speech};
}
/** Pure, explainable alternatives. Verbatim words, never fabricated source anchors. */
export function proposeAgentVoiceTriggers(project,{onlyMissing=true,max=MAX_VOICE_BATCH,cueIds=null}={}){
 const p=normalizeShowProject(project),lines=parseScript(p.scriptText);
 if(!Number.isInteger(max)||max<1||max>MAX_VOICE_BATCH)
  throw new TypeError('INVALID_VOICE_BATCH');
 if(cueIds!==null&&(!Array.isArray(cueIds)||!cueIds.length||
   new Set(cueIds).size!==cueIds.length||cueIds.some(id=>!p.cues.some(cue=>cue.id===id))))
  throw new TypeError('INVALID_VOICE_SCOPE');
 const used=p.cues.filter(c=>c.trigger?.trim()).map(c=>({id:c.id,text:c.trigger}));
 const selected=[],skipped=[];
 for(const cue of p.cues){
  if(cueIds!==null&&!cueIds.includes(cue.id))continue;
  if(onlyMissing&&cue.trigger?.trim())continue;
  if(selected.length>=max){skipped.push({cueId:cue.id,reason:'BATCH_LIMIT'});continue;}
  const anchors=cue.sourceLineIds.map(sourceIndex).filter(Boolean);
  if(!anchors.length){skipped.push({cueId:cue.id,reason:'NO_SOURCE_LINE'});continue;}
  const anchor=Math.min(...anchors);
  let found=null;
  // Never treat cues after the spoken line as a new speech source. Last 12 preceding lines only.
  for(let index=anchor-2;index>=Math.max(0,anchor-13);index--){
   const item=lines[index],parsed=dialogue(item?.text??'');
   if(parsed){found={lineId:item.id,...parsed};break;}
  }
  if(!found){skipped.push({cueId:cue.id,reason:'NO_RELIABLE_DIALOGUE'});continue;}
  const phrase=found.words.slice(-Math.min(8,found.words.length)).join(' ');
  const normalized=normalizeSpeech(phrase);
  if(normalized.split(' ').filter(Boolean).length<4){
   skipped.push({cueId:cue.id,reason:'SHORT_PHRASE'});continue;
  }
  const collision=[...used,...selected.map(s=>({id:s.cueId,text:s.trigger}))].find(
   entry=>entry.id!==cue.id&&
    (normalizeSpeech(entry.text)===normalized||
      compareSpeech(phrase,entry.text)>=0.88||
      compareSpeech(entry.text,phrase)>=0.88)
  );
  if(collision){
   skipped.push({cueId:cue.id,reason:'AMBIGUOUS_TRIGGER',conflictsWith:collision.id});continue;
  }
  selected.push({cueId:cue.id,cueNumber:cue.number,
   trigger:phrase,evidenceLineId:found.lineId,
   sourceLineId:cue.sourceLineIds[0],speaker:found.speaker});
 }
 return {suggestions:selected,skipped,
  operations:selected.map(s=>({op:'UPDATE_CUE',cueId:s.cueId,changes:{trigger:s.trigger}}))};
}
