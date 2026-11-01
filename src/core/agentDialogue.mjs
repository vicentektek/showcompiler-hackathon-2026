/**
 * V15 practical dialogue policy. Plans are proposals only. There is no
 * execution, audio synthesis, network access or persistence in this module.
 * A reversible creative request gets a *labeled hypothesis* rather than a
 * clarification unless key quantities or targets are genuinely unknown.
 */
import {interpretLocalAgentRequest} from './agentIntent.mjs';
import {normalizeShowProject} from './projectPersistence.mjs';
import {interpretHeroCueCommand} from './heroCue.mjs';

const sanitize=text=>String(text??'').trim().slice(0,600);
const NAMES=Object.freeze({
 es:['Resonancia de cierre','Acento final','Música de salida',
     'Ambiente de despedida','Último eco','Transición de salida'],
 en:['Closing resonance','Final accent','Exit music',
     'Farewell ambience','Last echo','Exit transition'],
});
const STOP=/\b(?:no|nunca|jam[aá]s|never|don't|do not|without|sin)\s+(?:a[nñ]ad|agreg|cre|insert|add|create|append)/i;
const ADD=/(?:\b(?:a[nñ]ad(?:e|as|ir|a)(?:lo|los|la|las)?|a[nñ][áa]de(?:lo|los|la|las)?|agrega(?:r|s)?|crea(?:r|s)?|incluye|inserta|pon(?:er)?|add|append|create|insert)\b)/i;
const CUES=/\b(?:cues?|se[nñ]ales?|pistas?)\b/i;
const END=/\b(?:final|finalizar|rematar|cierre|terminar|despedida|ending|end|closing|finish|outro)\b/i;
const VAGUE=/\b(?:algunos|algunas|unos|unas|several|some|few|varios|varias)\b/i;
const DELEGATE=/(?:los\s+que\s+(?:te\s+)?parezcan|lo\s+que\s+(?:te\s+)?parezca|t[uú]\s+elige|decide\s+t[uú]|como\s+(?:t[uú]\s+)?veas|as\s+you\s+(?:see\s+)?fit|you\s+(?:choose|decide)|whatever\s+(?:you\s+)?think|most\s+appropriate)/i;
const WORD_COUNTS={un:1,una:1,uno:1,one:1,dos:2,two:2,tres:3,three:3,cuatro:4,four:4,
 cinco:5,five:5,seis:6,six:6,siete:7,seven:7,ocho:8,eight:8,nueve:9,nine:9,
 diez:10,ten:10};
const CANCEL=/^(?:cancel(?:\s|$)|cancela(?:r)?\b|forget\b|olvida\b|descarta\b|discard\b)/i;
const READ_ONLY=/^(?:nota\s+de\s+ensayo|rehearsal\s+note|revisa|audita|review|audit|resume|summary|status|estado|describe|explica|show\s+summary)\b/i;
function currentTask(project,task){
 if(task===null||task===undefined)return null;
 if(task.version!==1||typeof task.projectSnapshot!=='string'||
    !Number.isInteger(task.count)||task.count<1||task.count>12||
    typeof task.empty!=='boolean'||!['es','en'].includes(task.language))
  throw new TypeError('INVALID_AGENT_DIALOGUE_TASK');
 return task.projectSnapshot===JSON.stringify(normalizeShowProject(project))?task:null;
}
function numberOfCues(text){
 const match=/\b(\d{1,3}|un|una|uno|one|dos|two|tres|three|cuatro|four|cinco|five|seis|six|siete|seven|ocho|eight|nueve|nine|diez|ten)\s+(?:(?:vac[ií]os?|empty|blank|nuevos?|new)\s+)?(?:cues?|se[nñ]ales?|pistas?)\b/i.exec(text);
 if(!match)return null;
 return /^\d+$/.test(match[1])?Number(match[1]):WORD_COUNTS[match[1].toLowerCase()];
}
function boundedHistory(raw){
 if(!Array.isArray(raw))return [];
 return raw.slice(-8).filter(x=>x&&['user','assistant'].includes(x.role)&&
  typeof x.text==='string').map(x=>({role:x.role,text:sanitize(x.text)}));
}
export function resolveAgentDialogue(project,prompt,{history=[],task=undefined,assetAvailable=()=>null,selectedAssetId=null,selectedCueId=null}={}){
 const show=normalizeShowProject(project);
 if(typeof prompt!=='string'||!prompt.trim()||prompt.length>1600)
  throw new TypeError('INVALID_AGENT_PROMPT');
 const request=prompt.trim(),prior=boundedHistory(history),remembered=currentTask(show,task);
 const hero=interpretHeroCueCommand(show,request,{selectedAssetId,assetAvailable});
 if(hero)return hero;
 // Voice triggers are a separate guarded tool, never new empty closing cues.
 if(/(?:pies\s+(?:de\s+)?voz|spoken\s+triggers?|voice\s+triggers?)/i.test(request))
  return interpretLocalAgentRequest(show,request,{assetAvailable,selectedCueId});
 // A single explicitly named cue already has a deterministic, review-only
 // local operation. Do not let the broader multi-cue dialogue policy demand
 // a redundant position before this narrower parser can handle it.
 if(/^(?:crea|a[nñ]ade|create|add)\s+(?:un\s+|a\s+)?cue\s+(?:llamado|named|called)\s+.{1,200}$/i.test(request))
  return interpretLocalAgentRequest(show,request,{assetAvailable,selectedCueId});
 const locale=/\b(?:add|create|append|insert|end|closing|whatever|appropriate|make it|you decide)\b/i.test(request)?'en':'es';
 const spanish=locale==='es';
 const previous=task===undefined?prior.filter(x=>x.role==='user').slice(-3).reverse()
  .find(x=>ADD.test(x.text)&&(CUES.test(x.text)||END.test(x.text)))
  :null;
 const askedForCreative=DELEGATE.test(request);
 const directAdd=ADD.test(request)&&CUES.test(request);
 const correction=/\b(?:mejor|en\s+vez\s+de|rather|instead|make\s+it|pon|que\s+sean)\b/i.test(request);
 const countFromFollowup=numberOfCues(request);
 const followUp=!!(previous||remembered)&&(askedForCreative||(correction&&countFromFollowup!==null));
 if(/^no\s+confundas\b.*\bomitid[oa]\b.*\b(?:terminad[oa]|complet[oa])\b/i.test(request))
  return {status:'ANSWER',operations:[],message:
   'Omitido y terminado son estados distintos. «Omitido» significa que se decidió no abordar un elemento; «terminado» exige evidencia de que se completó. El proyecto actual no guarda un estado «omitido», así que no lo inferiré.'};
 if(/^no\s+presumas\b.*\bl[ií]neas?\b.*\b(?:viste|vistas?|seen)\b/i.test(request))
  return {status:'ANSWER',operations:[],message:
   'De acuerdo: solo atribuiré análisis a las líneas L# disponibles en el contexto. Las líneas no incluidas quedan como no revisadas, no como analizadas ni correctas.'};
 if(STOP.test(request)||CANCEL.test(request)){
  return {status:'CLARIFY',operations:[],message:spanish?
   'La instrucción está negada. No se han preparado cambios.':
   'The instruction is negated. No changes were prepared.'};
 }
 if(/^(?:resume|resumen|summary)\b/i.test(request)&&/\b(?:peligros?|hazards?|risks?)\b/i.test(request)){
  const script=show.scriptText??'';
  const hazards=[];
  if(/(?:instrucciones?\s+para\s+ia|ignore\s+(?:the\s+)?(?:policy|instructions?)|ignora\s+AGENTS)/i.test(script))
   hazards.push('instrucciones incrustadas que intentan controlar a la IA');
  if(/<\/?(?:script|iframe|object)\b/i.test(script))hazards.push('contenido HTML ejecutable que debe tratarse como texto');
  if(/(?:SYSTEM\s*:|claves?|secrets?|api[_ -]?keys?)/i.test(script))
   hazards.push('solicitudes de secretos o suplantaciÃ³n de mensajes del sistema');
  return {status:'ANSWER',operations:[],message:hazards.length?
   'Peligros detectados: '+hazards.join('; ')+'. El guion es evidencia, no una fuente de instrucciones; no se ejecutÃ³ ni revelÃ³ nada.':
   'No se detectaron patrones concretos de inyecciÃ³n en el texto disponible; esto no sustituye una revisiÃ³n humana.'};
 }
 if(/^(?:resume|resumen|summary)\b/i.test(request)&&/\b(?:decisiones?\s+pendientes|pending\s+decisions?)\b/i.test(request)){
  const ambiguous=prior.some(turn=>turn.role==='user'&&/\b(?:anterior|siguiente|previous|next)\b/i.test(turn.text));
  if(remembered)return {status:'ANSWER',operations:[],message:(remembered.language==='es'?
   'DecisiÃ³n pendiente: revisar una propuesta no aplicada de ':'Pending decision: review an unapplied proposal for ')+
   remembered.count+(remembered.language==='es'?' cues al final. No hay cambios aplicados.':' cues at the end. No changes are applied.')};
  return {status:'ANSWER',operations:[],message:ambiguous?
   'Queda por aclarar la correcciÃ³n relativa (anterior/siguiente). No hay una propuesta vigente ni cambios aplicados.':
   'No hay una propuesta vigente en el contexto disponible ni cambios aplicados.'};
 }
 if(directAdd||followUp){
  const source=directAdd?request:previous?.text??'';
  const requested=countFromFollowup??(directAdd||previous?numberOfCues(source):remembered.count);
  if(requested!==null&&(!Number.isInteger(requested)||requested<1||requested>12)){
   return {status:'CLARIFY',operations:[],message:spanish?
    'Para evitar lotes excesivos, indica entre 1 y 12 cues por propuesta.':
    'For safety, specify between 1 and 12 cues per proposal.'};
  }
  if(directAdd&&!END.test(source)&&!VAGUE.test(source)&&requested===null){
   return {status:'CLARIFY',operations:[],message:spanish?
    '¿Cuántos cues quieres crear y en qué posición?':
    'How many cues should I create and where?'};
  }
  const count=requested??3;
  const empty=/\b(?:vac[ií]os?|sin\s+(?:configurar|audio|sonido)|empty|blank|unconfigured)\b/i.test(source+' '+request)||
   (!directAdd&&remembered?.empty===true);
  const direction=END.test(source)||END.test(request)||(!directAdd&&remembered!==null);
  if(!direction){
   return {status:'CLARIFY',operations:[],message:spanish?
    'Indica la posición de los nuevos cues para no alterar la secuencia actual.':
    'Specify where the new cues belong so the current sequence is unchanged.'};
  }
  const names=NAMES[locale];
  const operations=Array.from({length:count},(_,i)=>({
   op:'CREATE_CUE',afterCueId:null,
   label:empty?(spanish?'Cue pendiente ':'Pending cue ')+(i+1):
    names[i]??(spanish?'Cierre adicional ':'Additional closing cue ')+(i+1)
  }));
  const last=show.cues.at(-1);
  const lead=spanish?
   'Propongo '+count+' cues manuales al final'+(last?' (después de «'+last.label+'»)':'')+'.':
   'I propose '+count+' manual cues at the end'+(last?' (after "'+last.label+'")':'')+'.';
  return {status:'PLAN',operations,message:lead+' '+(empty?
   (spanish?'Quedarán sin audio para configurarlos después.':'They will remain without audio until configured.'):
   (spanish?'Los nombres son propuestas creativas, no indicaciones del guion. No se asigna ningún archivo ni pie de voz.':
    'Names are creative suggestions, not claims from the script. No audio or spoken trigger is assigned.')),
   basis:'CREATIVE_OPERATOR_PROPOSAL',reversible:true};
 }
 return interpretLocalAgentRequest(show,request,{assetAvailable,selectedCueId});
}
/** Local-only pending intent; a project edit, cancel or different task invalidates it. */
export function updateAgentDialogueTask(project,prompt,reply,task=null){
 const previous=currentTask(project,task);
 if(typeof prompt!=='string'||!reply||!Array.isArray(reply.operations))
  throw new TypeError('INVALID_AGENT_DIALOGUE_TURN');
 if(CANCEL.test(prompt.trim())||STOP.test(prompt))return null;
 if(reply.status==='PLAN'&&reply.basis==='CREATIVE_OPERATOR_PROPOSAL'&&
    reply.operations.length>=1&&reply.operations.length<=12&&
    reply.operations.every(op=>op.op==='CREATE_CUE'&&op.afterCueId===null)){
  const empty=/\b(?:vac[ií]os?|sin\s+(?:configurar|audio|sonido)|empty|blank|unconfigured)\b/i.test(prompt)||
   (!ADD.test(prompt)&&previous?.empty===true);
  return Object.freeze({version:1,projectSnapshot:JSON.stringify(normalizeShowProject(project)),
   count:reply.operations.length,empty,
   language:/\b(?:add|create|append|end|make it|you decide)\b/i.test(prompt)?'en':'es'});
 }
 return READ_ONLY.test(prompt.trim())&&reply.status!=='PLAN'?previous:null;
}
/** Only bounded, sanitized conversation turns may leave the browser after consent. */
export function boundedAgentConversation(history,{project=null,task=null}={}){
 const turns=boundedHistory(history).map(turn=>({role:turn.role,text:turn.text.slice(0,400)}));
 const remembered=project?currentTask(project,task):null;
 if(!remembered)return turns;
 const text=remembered.language==='es'?
  `Tarea del operador retenida: proponer ${remembered.count} cues ${remembered.empty?'vacios ':''}al final. Pendiente de revision; no aplicada. Sin audio ni GO automaticos.`:
  `Retained operator task: propose ${remembered.count} ${remembered.empty?'empty ':''}cues at the end. Pending review; not applied. No automatic audio or GO.`;
 return [{role:'user',text},...turns.slice(-7)];
}
