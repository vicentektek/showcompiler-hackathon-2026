/** Offline, deliberately narrow ES/EN commands. Other requests use opt-in AI. */
import {resolveAgentCue,buildAgentContext,auditAgentProject} from './agentCore.mjs';
import {proposeAgentVoiceTriggers} from './agentVoice.mjs';
import {parseLocalCueChat} from './cueConversation.mjs';
import {inspectShowReadiness} from './showPreflight.mjs';
const normalize=t=>t.trim().replace(/\s+/g,' ');
const cueRef=String.raw`(?:cue|q)\s*[#º°.:_-]?\s*(\d{1,5})`;
const isSpanishRequest=text=>/[¿¡áéíóúñ]/i.test(text)||
 /\b(?:qu[eé]|cu[aá]l|c[oó]mo|d[oó]nde|por\s+qu[eé]|falta|ensayar|todav[ií]a|autorizaci[oó]n|proyecto|audio\s+pendiente)\b/i.test(text);
function localAudioState(project,assetAvailable){
 const unresolved=[],missing=[],unknown=[];
 const availability=new Map();
 const available=id=>{
  if(!availability.has(id))availability.set(id,assetAvailable(id));
  return availability.get(id);
 };
 const report=inspectShowReadiness(project,id=>available(id)===true);
 for(const cue of project.cues){
  if(cue.actions.some(action=>action.type==='PLAN_AUDIO'))
   unresolved.push({cueId:cue.id,number:cue.number,label:cue.label,reason:'UNRESOLVED_AUDIO'});
  const unavailable=[
   ...cue.actions.filter(action=>action.type==='PLAY').map(action=>action.assetId),
   ...(cue.audioTracks??[]).map(track=>track.assetId)
  ];
  const unchecked=unavailable.filter(assetId=>available(assetId)!==true&&available(assetId)!==false);
  if(unchecked.length)unknown.push({cueId:cue.id,number:cue.number,label:cue.label,
   reason:'AUDIO_NOT_VERIFIED',assetIds:[...new Set(unchecked)]});
  const absent=unavailable.filter(assetId=>available(assetId)===false);
  if(absent.length)missing.push({cueId:cue.id,number:cue.number,label:cue.label,
   reason:'MISSING_AUDIO',assetIds:[...new Set(absent)]});
 }
 return {unresolved,missing,unknown,report};
}
function readinessAnswer(project,text,audioState,selectedCueId,spanish){
 const say=(es,en)=>spanish?es:en;
 const refs=[...text.matchAll(new RegExp(cueRef,'ig'))];
 const selected=/\b(?:cue\s+seleccionado|selected\s+cue|this\s+cue|este\s+cue)\b/i.test(text);
 const ambiguous=refs.length>1||/\b(?:cues|qs)\s*[#º°.:_-]?\s*\d/i.test(text)||
  new RegExp(cueRef+'\\s*(?:,|and|y|&|to|a|-)\\s*\\d','i').test(text);
 if(ambiguous||selected&&refs.length||
  /\b(?:cue|q)\b/i.test(text)&&!selected&&!refs.length)return {status:'CLARIFY',operations:[],message:say(
  'Indica un cue por su número visible, el seleccionado o todo el espectáculo.',
  'Choose one cue by visible number, the selected cue, or the whole show.')};
 const target=selected?project.cues.find(c=>c.id===selectedCueId):
  refs.length?resolveAgentCue(project,Number(refs[0][1])):null;
 if((selected||refs.length)&&!target)return {status:'CLARIFY',operations:[],message:say(
  'Selecciona un cue existente o comprueba su número visible.',
  'Select an existing cue or check its visible number.')};
 const cues=target?[target]:project.cues;
 const ids=new Set(cues.map(c=>c.id));
 const scoped=items=>items.filter(item=>ids.has(item.cueId));
 const unresolved=scoped(audioState.unresolved),missing=scoped(audioState.missing),
  unknown=scoped(audioState.unknown);
 const issues=audioState.report.issues.filter(issue=>issue.cueId?ids.has(issue.cueId):!target);
 const blocked=new Set(issues.filter(i=>i.severity==='BLOCKER').map(i=>i.cueId));
 const readyCues=cues.filter(cue=>!blocked.has(cue.id)).length;
 const locallyPrepared=cues.length>0&&readyCues===cues.length;
 const live=/ready\s+to\s+go\s+live/i.test(text);
 const readiness={...audioState.report,issues,ready:locallyPrepared&&!live,
  readyCues,totalCues:cues.length,locallyPrepared,liveReady:false,cueCount:cues.length,
  blockerCount:issues.filter(i=>i.severity==='BLOCKER').length,
  warningCount:issues.filter(i=>i.severity==='WARNING').length,
  unresolvedAudio:unresolved.length,missingAudio:missing.length,unknownAudio:unknown.length};
 const lines=[say('Cues sin bloqueos locales de audio: ','Cues passing local audio checks: ')+readyCues+'/'+cues.length+'.'];
 if(!cues.length)lines.push(say('Crea y revisa los cues del guion antes del ensayo.',
  'Create and review script-linked cues before rehearsal.'));
 const audioQuery=/(?:unresolved|pending|pendiente|sin\s+resolver)/i.test(text);
 const listed=audioQuery?cues.filter(cue=>[...unresolved,...missing,...unknown].some(i=>i.cueId===cue.id)):cues;
 for(const cue of listed.slice(0,8)){
  const reasons=[];
  if(unresolved.some(i=>i.cueId===cue.id))reasons.push(say(
   'Asigna un sonido al audio pendiente y preescúchalo.',
   'Assign a sound to unresolved audio and preview it.'));
  if(missing.some(i=>i.cueId===cue.id))reasons.push(say(
   'Carga o vuelve a vincular el archivo; espera a que se decodifique.',
   'Load or relink the file; wait for decoding.'));
  if(unknown.some(i=>i.cueId===cue.id))reasons.push(say(
   'Disponibilidad no verificada: comprueba la carga y decodificación del archivo.',
   'Audio availability is not verified: check file loading and decoding.'));
  const hasAudio=cue.actions.some(a=>a.type==='PLAY')||Boolean(cue.audioTracks?.length);
  lines.push('Cue '+cue.number+' · '+cue.label+': '+(reasons.length?reasons.join(' '):
   hasAudio?say('Audio decodificado; preescucha y revisa manualmente.',
    'Decoded audio still needs manual audition and review.'):
   say('Sin acciones de audio que verificar; revisa el cue manualmente.',
    'No audio actions to verify; review the cue manually.')));
 }
 if(listed.length>8)lines.push(say('Otros cues no mostrados: ','Other cues not shown: ')+(listed.length-8)+'.');
 if(readiness.warningCount)lines.push(say('Propuestas pendientes de revisión humana: ',
  'Proposals pending human review: ')+readiness.warningCount+'.');
 lines.push(say('No puedo certificar que esté listo para directo. Verifica la salida real, los niveles y STOP ALL en un ensayo; esta consulta no reproduce ni modifica nada.',
  'I cannot certify live readiness. Verify actual output, levels and STOP ALL in rehearsal; this query plays and changes nothing.'));
 return {status:'ANSWER',operations:[],readiness,message:lines.join('\n'),
  unresolvedAudio:[...unresolved,...missing,...unknown].filter((item,index,all)=>
   all.findIndex(other=>other.cueId===item.cueId)===index)};
}
export function interpretLocalAgentRequest(project,prompt,{assetAvailable=()=>null,selectedCueId=null}={}){
 if(typeof prompt!=='string'||!prompt.trim()||prompt.length>1600)
  throw new TypeError('INVALID_AGENT_PROMPT');
 let text=normalize(prompt);
 const spanish=isSpanishRequest(text)||/\b(?:prop[oó]n|pon|asigna|genera|renombra|seleccionado|este|prepara|quiero|necesito|ay[uú]dame|guion)\b/i.test(text);
 const scopeMessage=(es,en)=>spanish?es:en;
 const selectedRef=/\b(?:cue\s+seleccionado|selected\s+cue|this\s+cue|este\s+cue)\b/gi;
 const audioState=localAudioState(project,assetAvailable);
 if(/^¿?(?:which|what|qu[eé]|cu[aá]l).*(?:audio|sonido).*(?:unresolved|pending|pendiente|sin\s+resolver)/i.test(text)||
   /^¿?qu[eé]\s+(?:falta|queda\s+listo).*ensay/i.test(text)||
   /^(?:are|is)\b.*\bready\b/i.test(text)&&/\b(?:we|cues?|qs?|show|rehearsal|live)\b/i.test(text)||
   /^¿?est[aá](?:n)?\s.*\blist[oa]s?\b/i.test(text)&&/\b(?:cues?|qs?|show|ensayo|espect[aá]culo)\b/i.test(text)||
   /^(?:can\s+you\s+review\s+the\s+audio\s+without\s+playing\s+it|revisa\s+el\s+audio\s+sin\s+reproducirlo)\s*[?.!]?$/i.test(text))
  return readinessAnswer(project,text.replace(/^¿/,''),audioState,selectedCueId,spanish);
 if(/(?:dime|tell\s+me|resume|summary).*(?:qu[eé]\s+)?(?:qued[oó]\s+)?(?:pendiente|pending)/i.test(text)||
    /(?:estado|state).*(?:complet|omitid|pending|pendiente|bloquead|blocked)/i.test(text)){
  const pending=audioState.unresolved;
  const blocked=audioState.missing;
  const unknown=audioState.unknown;
  const affected=new Set([...pending,...blocked,...unknown].map(item=>item.cueId));
  const locallyResolved=project.cues.filter(cue=>!affected.has(cue.id))
   .map(cue=>({cueId:cue.id,number:cue.number,label:cue.label}));
  const full=/(?:complet|omitid|bloquead|blocked)/i.test(text);
  const pendingList=pending.map(item=>'cue '+item.number+' · '+item.label).join('; ');
  const blockedList=blocked.map(item=>'cue '+item.number+' · '+item.label).join('; ');
  const unknownList=unknown.map(item=>'cue '+item.number+' · '+item.label).join('; ');
  const message=scopeMessage(
   (pending.length?'Pendiente de audio: '+pendingList+'. ':'No hay audio marcado como pendiente. ')+
    (blocked.length?'Bloqueado por archivo no disponible: '+blockedList+'. ':'No hay cues bloqueados por archivos confirmados como ausentes. ')+
    (unknown.length?'Carga y decodificación sin verificar: '+unknownList+'. ':'')+
    (full?'«Omitido» no está representado en el proyecto; no lo inferiré. «Completo» no equivale a tener audio resuelto y requiere revisión humana.':''),
   (pending.length?'Pending audio: '+pendingList+'. ':'No audio is marked pending. ')+
    (blocked.length?'Blocked by unavailable file: '+blockedList+'. ':'No cues are blocked by files confirmed unavailable. ')+
    (unknown.length?'Loading and decoding not verified: '+unknownList+'. ':'')+
    (full?'“Omitted” is not represented in the project, so I will not infer it. “Complete” is not the same as locally resolved audio and requires human review.':''));
  return {status:'ANSWER',operations:[],message,projectState:{pending,blocked,unknown,locallyResolved,
   omitted:'NOT_REPRESENTED',complete:'REQUIRES_HUMAN_REVIEW'}};
 }
 if(/(?:por\s+qu[eé].*cue.*(?:reproduc|play)|why.*(?:this|selected).*cue.*(?:play|reproduc))/i.test(text)){
  const selected=project.cues.find(cue=>cue.id===selectedCueId)??null;
  const targetUnresolved=selected?audioState.unresolved.filter(item=>item.cueId===selected.id):audioState.unresolved;
  const targetMissing=selected?audioState.missing.filter(item=>item.cueId===selected.id):audioState.missing;
  const targetUnknown=selected?audioState.unknown.filter(item=>item.cueId===selected.id):audioState.unknown;
  const blockers=[...targetUnresolved,...targetMissing,...targetUnknown];
  const message=selected
   ? blockers.length
    ? scopeMessage('El cue '+selected.number+' no tiene el audio verificado: '+(targetUnresolved.length?'asigna el sonido pendiente y preescúchalo.':targetMissing.length?'carga o vuelve a vincular el archivo.':'comprueba su carga y decodificación.'),
      'Cue '+selected.number+' does not have verified audio: '+(targetUnresolved.length?'assign and preview the unresolved sound.':targetMissing.length?'load or relink the file.':'check its loading and decoding.'))
    : scopeMessage('No veo un bloqueo de audio local en el cue '+selected.number+'. Aun así, debe decodificarse y probarse manualmente antes del ensayo.',
      'I found no local audio blocker for cue '+selected.number+'. It still needs manual decoding and audition before rehearsal.')
   : scopeMessage('No hay un cue seleccionado. Selecciona uno para diagnosticarlo; en el proyecto hay '+blockers.length+' cue(s) sin audio resuelto o disponible.',
     'No cue is selected. Select one for diagnosis; the project has '+blockers.length+' cue(s) with unresolved or unavailable audio.');
  return {status:'ANSWER',operations:[],message,playability:{selectedCueId:selected?.id??null,
   unresolvedAudio:targetUnresolved.length,missingAudio:targetMissing.length,unknownAudio:targetUnknown.length}};
 }
 if(/(?:qu[eé]\s+sucede|what\s+happens).*(?:cambia|changes?).*(?:proyecto|project).*(?:plan|propuesta)/i.test(text))
  return {status:'ANSWER',operations:[],message:scopeMessage(
   'El plan queda obsoleto: conserva una instantánea del proyecto base y el commit debe rechazarlo con STALE_AGENT_PLAN. Hay que preparar y revisar un plan nuevo.',
   'The plan becomes stale: it keeps a base-project snapshot and commit must reject it with STALE_AGENT_PLAN. Prepare and review a new plan.')};
 if(/(?:has|he|have).*(?:aplicad|applied).*(?:sin\s+autorizaci[oó]n|without\s+authorization)/i.test(text))
  return {status:'ANSWER',operations:[],message:scopeMessage(
   'Esta respuesta no aplica cambios: el asistente solo devuelve propuestas hasta que el operador las confirma. Sin un historial de commits no puedo confirmar acciones ocurridas fuera de esta conversación.',
   'This response applies no changes: the assistant only returns proposals until the operator confirms them. Without commit history I cannot confirm actions outside this conversation.')};
 if(selectedRef.test(text)){
  const selected=project.cues.find(cue=>cue.id===selectedCueId);
  if(!selected)return {status:'CLARIFY',operations:[],message:scopeMessage(
   'Selecciona un cue existente antes de solicitar cambios.',
   'Select an existing cue before requesting selected-cue changes.')};
  text=text.replace(selectedRef,'cue '+selected.number);
 }
 const lower=text.toLocaleLowerCase();
 const reply=(status,message,operations=[])=>({status,message,operations});
 if(/^(?:no|don't|do not|sin)\s/i.test(text))
  return reply('CLARIFY','Negative instructions require clarification; no changes were prepared.');
 if(/^(?:prepara(?:r)?|organiza(?:r)?|prepare|organize)\s+(?:(?:los|mis|the|my)\s+)?cues(?:\s+(?:del\s+(?:guion|espect[aá]culo)|para\s+(?:el\s+)?show|for\s+(?:the\s+)?show|from\s+(?:the\s+)?script))?\s*[.!]?$/i.test(text)){
  const hasScript=Boolean(project.scriptText?.trim());
  return {...reply('ANSWER',scopeMessage(
   'Vamos a preparar los cues sin cambiar el espectáculo todavía.\n'+
   '1. '+(hasScript?'Abre el guion original y selecciona las líneas L# que necesitan sonido.':'Importa el guion original; conservaremos sus referencias L#.')+'\n'+
   '2. Crea cues desde esas líneas o pide sugerencias para el guion con tu autorización de IA. Revisa las propuestas antes de aprobarlas.\n'+
   '3. Asigna un sonido, escúchalo y configura el pie y los fundidos. Los cues sin audio seguirán pendientes.\n'+
   'Abre «Preparar cues desde el guion» para empezar. Este botón no genera, aprueba ni reproduce nada.',
   'Let’s prepare cues without changing the show yet.\n'+
   '1. '+(hasScript?'Open the original script and select the L# lines that need sound.':'Import the original script; its L# references will be preserved.')+'\n'+
   '2. Create cues from those lines or request script suggestions with your AI consent. Review proposals before approving them.\n'+
   '3. Assign a sound, preview it, and set the trigger and fades. Cues without audio remain unresolved.\n'+
   'Open “Prepare cues from script” to begin. This button does not generate, approve or play anything.')),workflow:'PREPARE_CUES'};
 }
 const remove=new RegExp('^(?:elimina|borra|quita|delete|remove)\\s+(?:(?:el|the)\\s+)?'+cueRef+'\\s*[.!]?$', 'i').exec(text);
 if(remove){
  const cue=resolveAgentCue(project,Number(remove[1]));
  return cue?reply('PLAN','Delete cue '+cue.number+' · '+cue.label+'? The media file stays in the library.',
   [{op:'DELETE_CUE',cueId:cue.id}]):reply('CLARIFY','Cue not found.');
 }
 const rename=new RegExp('^(?:renombra|rename)\\s+(?:(?:el|the)\\s+)?'+cueRef+
  '\\s+(?:como|to|as)\\s+(.+)$','i').exec(text);
 if(rename){
  const cue=resolveAgentCue(project,Number(rename[1]));
  if(!cue)return reply('CLARIFY','Cue not found.');
  let label=rename[2].trim();
  if(/^["'].*["']$/.test(label)&&label[0]===label.at(-1))label=label.slice(1,-1).trim();
  if(!label||label.length>200)
   return reply('CLARIFY',scopeMessage('Indica un nombre de 1 a 200 caracteres.',
    'Provide a name between 1 and 200 characters.'));
  if(/(?:[;\n]|\b(?:and|y|then|luego)\s+(?:delete|remove|move|rename|elimina|borra|mueve|renombra)\b)/i.test(label))
   return reply('CLARIFY',scopeMessage('Renombra un cue por propuesta, sin mezclar otras operaciones.',
    'Rename one cue per proposal without combining other operations.'));
  return reply('PLAN',scopeMessage('Propongo renombrar el cue ','I propose renaming cue ')+cue.number+'.',
   [{op:'UPDATE_CUE',cueId:cue.id,changes:{label}}]);
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
  const refs=[...text.matchAll(new RegExp(cueRef,'ig'))];
  const scopeText=text.replace(/\b(?:all|every|each|todos?(?:\s+los)?|cada)\s+(?:cues?|qs?)\b/gi,'');
  if(refs.length>1||(!refs.length&&/\b(?:cues?|qs?)\b/i.test(scopeText))||
    /\b(?:cues|qs)\s*[#º°.:_-]?\s*\d/i.test(text)||
    new RegExp(cueRef+'\\s*(?:,|and|y|&|to|a|-)\\s*\\S','i').test(text))
   return reply('CLARIFY',scopeMessage('Indica un cue por su número visible, usa el cue seleccionado o solicita todo el espectáculo.',
    'Choose one cue by visible number, use the selected cue, or explicitly request the whole show.'));
  const target=refs.length?resolveAgentCue(project,Number(refs[0][1])):null;
  if(refs.length&&!target)return reply('CLARIFY',scopeMessage('Cue no encontrado.','Cue not found.'));
  const r=proposeAgentVoiceTriggers(project,{cueIds:target?[target.id]:null});
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
 return reply('NEEDS_AI',scopeMessage(
  'Esta petición necesita interpretación con IA; todavía no he preparado cambios.\n'+
  '1. Indica la escena, los cues o las referencias L# que quieres trabajar.\n'+
  '2. Abre «Preparar consulta con IA», revisa el proveedor y autoriza una consulta (puede tener coste).\n'+
  '3. Pulsa «Consultar IA». Revisa los cambios propuestos y aplica solo los que quieras.\n'+
  'No se ejecuta sonido ni se modifica el espectáculo automáticamente.',
  'This request needs AI interpretation; no changes are prepared yet.\n'+
  '1. Specify the scene, cues or L# references you want to work on.\n'+
  '2. Open “Prepare AI consultation”, review the provider and authorize one request (may incur a charge).\n'+
  '3. Choose “Ask AI”. Review the proposed changes and apply only those you want.\n'+
  'Nothing plays or changes in the show automatically.'));
}
