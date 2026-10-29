/**
 * V15 practical dialogue policy. Plans are proposals only. There is no
 * execution, audio synthesis, network access or persistence in this module.
 * A reversible creative request gets a *labeled hypothesis* rather than a
 * clarification unless key quantities or targets are genuinely unknown.
 */
import {interpretLocalAgentRequest} from './agentIntent.mjs';
import {normalizeShowProject} from './projectPersistence.mjs';

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
export function resolveAgentDialogue(project,prompt,{history=[],assetAvailable=()=>null}={}){
 const show=normalizeShowProject(project);
 if(typeof prompt!=='string'||!prompt.trim()||prompt.length>1600)
  throw new TypeError('INVALID_AGENT_PROMPT');
 const request=prompt.trim(),prior=boundedHistory(history);
 // Voice triggers are a separate guarded tool, never new empty closing cues.
 if(/(?:pies\s+(?:de\s+)?voz|spoken\s+triggers?|voice\s+triggers?)/i.test(request))
  return interpretLocalAgentRequest(show,request,{assetAvailable});
 const locale=/\b(?:add|create|append|insert|end|closing|whatever|appropriate)\b/i.test(request)?'en':'es';
 const spanish=locale==='es';
 const previous=prior.filter(x=>x.role==='user').slice(-3).reverse()
  .find(x=>ADD.test(x.text)&&(CUES.test(x.text)||END.test(x.text)));
 const askedForCreative=DELEGATE.test(request);
 const directAdd=ADD.test(request)&&CUES.test(request);
 const correction=/\b(?:mejor|en\s+vez\s+de|rather|instead|make\s+it|pon|que\s+sean)\b/i.test(request);
 const countFromFollowup=numberOfCues(request);
 const followUp=!!previous&&(askedForCreative||(correction&&countFromFollowup!==null));
 if(STOP.test(request)||/^(?:no|don't|do not|sin)\b/i.test(request)){
  return {status:'CLARIFY',operations:[],message:spanish?
   'La instrucción está negada. No se han preparado cambios.':
   'The instruction is negated. No changes were prepared.'};
 }
 if(directAdd||followUp){
  const source=directAdd?request:previous.text;
  const requested=countFromFollowup??numberOfCues(source);
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
  const empty=/\b(?:vac[ií]os?|sin\s+(?:configurar|audio|sonido)|empty|blank|unconfigured)\b/i.test(source+' '+request);
  const direction=END.test(source)||END.test(request);
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
 return interpretLocalAgentRequest(show,request,{assetAvailable});
}
/** Only bounded, sanitized conversation turns may leave the browser after consent. */
export function boundedAgentConversation(history){
 return boundedHistory(history).map(turn=>({role:turn.role,text:turn.text.slice(0,400)}));
}
