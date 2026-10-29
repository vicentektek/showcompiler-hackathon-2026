/** Offline, deliberately narrow ES/EN commands. Other requests use opt-in AI. */
import {resolveAgentCue,buildAgentContext,auditAgentProject} from './agentCore.mjs';
import {proposeAgentVoiceTriggers} from './agentVoice.mjs';
import {parseLocalCueChat} from './cueConversation.mjs';
const normalize=t=>t.trim().replace(/\s+/g,' ');
const cueRef=String.raw`(?:cue|q)\s*[#º°.:_-]?\s*(\d{1,5})`;
export function interpretLocalAgentRequest(project,prompt,{assetAvailable=()=>null}={}){
 if(typeof prompt!=='string'||!prompt.trim()||prompt.length>1600)
  throw new TypeError('INVALID_AGENT_PROMPT');
 const text=normalize(prompt),lower=text.toLocaleLowerCase();
 const reply=(status,message,operations=[])=>({status,message,operations});
 if(/^(?:no|don't|do not|sin)\s/i.test(text))
  return reply('CLARIFY','Negative instructions require clarification; no changes were prepared.');
 const remove=new RegExp('^(?:elimina|borra|quita|delete|remove)\\s+(?:(?:el|the)\\s+)?'+cueRef+'\\s*[.!]?$', 'i').exec(text);
 if(remove){
  const cue=resolveAgentCue(project,Number(remove[1]));
  return cue?reply('PLAN','Delete cue '+cue.number+' · '+cue.label+'? The media file stays in the library.',
   [{op:'DELETE_CUE',cueId:cue.id}]):reply('CLARIFY','Cue not found.');
 }
 const reorder=new RegExp('^(?:mueve|move)\\s+(?:(?:el|the)\\s+)?'+cueRef+
  '\\s+(antes\\s+de|antes\\s+del|despu[eé]s\\s+de|despu[eé]s\\s+del|before|after)\\s+(?:(?:el|the)\\s+)?(?:cue\\s*)?(\\d{1,5})\\s*[.!]?$','i').exec(text);
 if(reorder){
  const source=resolveAgentCue(project,Number(reorder[1])),
   target=resolveAgentCue(project,Number(reorder[3]));
  if(!source||!target)return reply('CLARIFY','Cue not found.');
  const position=/antes|before/i.test(reorder[2])?'before':'after';
  return reply('PLAN','Move '+source.label+' '+position+' '+target.label+'.',
   [{op:'REORDER_CUE',cueId:source.id,targetCueId:target.id,position}]);
 }
 if(/^(?:pon|asigna|genera|prop[oó]n|assign|generate|propose)\b/i.test(text)&&
    /(?:pies(?:\s+de\s+voz)?|triggers?|spoken\s+cues?|voice\s+triggers?)/i.test(text)){
  const r=proposeAgentVoiceTriggers(project);
  return r.operations.length?{...reply('PLAN',
   r.operations.length+' script-grounded spoken triggers proposed; '+r.skipped.length+' cues need manual review.',
   r.operations),evidence:r.suggestions,skipped:r.skipped}:
   {...reply('ANSWER','No safe spoken triggers found. Add script references and nearby dialogue before generating.'),skipped:r.skipped};
 }
 const create=/^(?:crea|a[nñ]ade|create|add)\s+(?:un\s+|a\s+)?cue\s+(?:llamado|named|called)\s+(.{1,200})$/i.exec(text);
 if(create)return reply('PLAN','Create cue "'+create[1]+'" at end of show.',
  [{op:'CREATE_CUE',label:create[1].trim(),afterCueId:null}]);
 const cueMatch=new RegExp(cueRef,'i').exec(text);
 if(cueMatch){
  const cue=resolveAgentCue(project,Number(cueMatch[1]));
  if(!cue)return reply('CLARIFY','Cue not found. Check the visible cue number.');
  const patched=text.replace(cueMatch[0],' ');
  const changes=parseLocalCueChat(patched);
  if(changes)return reply('PLAN','Edit cue '+cue.number+' · '+cue.label+'.',
   [{op:'UPDATE_CUE',cueId:cue.id,changes}]);
  if(/(?:mejora|sonido|better|improve|sound|audio)/i.test(text))
   return {...reply('SOUND_ADVICE','Cue '+cue.number+' · '+cue.label+': prepare a new sound alternative in Sound Lab. Review and audition it before replacing the original.'),
    sound:{cueId:cue.id,lineId:cue.sourceLineIds[0]??null,
     prompt:'Alternative theatrical sound for cue: '+cue.label+'. '+
      'More natural acoustic detail, cinematic depth and smooth transitions; '+
      'preserve spoken-dialogue intelligibility. Review the result before use.'}};
  if(/^(?:describe|explica|what|qu[eé]|cu[aá]l|show|dime)\b/i.test(text)){
   const context=buildAgentContext(project,{cueIds:[cue.id],maxScriptLines:20,
      focusLineId:cue.sourceLineIds[0]??null,assetAvailable});
   return {...reply('ANSWER','Cue '+cue.number+' · '+cue.label+'. Trigger: '+(cue.trigger||'not assigned')+'. Sources: '+(cue.sourceLineIds.join(', ')||'none')+'. Audio: '+cue.actions.map(a=>a.type).join(', ')+'.'),context};
  }
 }
 if(/^(?:revisa|audita|analiza|comprueba|review|audit|analyze|check)\b/i.test(text)){
  const report=auditAgentProject(project,{assetAvailable});
  return {...reply('ANSWER','Audit: '+report.cueCount+' cues, '+report.summary.warnings+' warnings and '+report.summary.informational+' informational items.'),report};
 }
 if(/^(?:cu[aá]ntos|how many|resume|summary|resumen|estado|status)\b/i.test(lower)){
  const c=buildAgentContext(project,{maxScriptLines:1,assetAvailable});
  return reply('ANSWER',c.projectName+': '+c.counts.cues+' cues, '+c.counts.assets+' media references and '+c.counts.scriptLines+' script lines.');
 }
 return reply('NEEDS_AI','Complex request. Enable the explicit AI consultation to prepare a structured plan; no changes have been made.');
}
