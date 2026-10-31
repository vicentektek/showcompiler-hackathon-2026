/**
 * Conversational cue editing by voice. Pure module: no microphone, network,
 * audio transport or persistence. A transcript is only ever turned into a
 * *proposal* through the same engine as typed instructions; applying it is a
 * separate, human-confirmed step owned by the host UI. Editing speech is kept
 * strictly apart from GO/STOP, foot-cue following and Autopilot.
 */
import {resolveAgentDialogue} from './agentDialogue.mjs';
import {prepareAgentPlan} from './agentCore.mjs';

export const VOICE_EDIT_MAX_CHARS=1600;
export const VOICE_EDIT_HISTORY_LIMIT=20;

const WORDS={cero:0,un:1,uno:1,una:1,primero:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,
 ocho:8,nueve:9,diez:10,once:11,doce:12,trece:13,catorce:14,quince:15,
 zero:0,one:1,first:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
 eleven:11,twelve:12};
const WORD_RE=Object.keys(WORDS).sort((a,b)=>b.length-a.length).join('|');
const FILLER_START=/^(?:(?:eh+|em+|um+|uh+|mm+|vale|bueno|bien|ok|okay|oye|hey|hola|so|well)[,.\s]+)+/i;
const ADDRESS=/^(?:(?:oye|hey|ok|vale)?[,\s]*)?(?:runq|run\s*q|run\s*queue|agente)[,.\s]+/i;
const POLITE_END=/[,.\s]*(?:por\s+favor|please|gracias|thanks)[.!\s]*$/i;
const POLITE_START=/^(?:(?:por\s+favor|please|quiero\s+que|i\s+want\s+you\s+to|puedes|can\s+you|could\s+you)[,.\s]+)+/i;
const NOISE_TAG=/^\s*[\[(<*]?\s*(?:inaudible|unintelligible|ruido|noise|silencio|silence|m[uú]sica|music)\s*[\])>*]?\s*$/i;
const INJECTION=/(?:ignor(?:a|e)\s+(?:todas?\s+)?(?:las\s+)?(?:instrucciones|reglas)|ignore\s+(?:all\s+|the\s+|previous\s+|prior\s+)*(?:instructions|rules)|system\s+prompt|prompt\s+del\s+sistema|api\s*key|clave\s+(?:de\s+)?api|model_api_key|reveal\s+(?:the\s+)?(?:secret|key)|revela\s+(?:la\s+)?(?:clave|secreto))/i;
const TRANSPORT_WHOLE=/^(?:dale\s+)?(?:go|stop|stop\s+all|next|siguiente|vamos|adelante|para|parar|det[eé]n|detener|play|reproduce|reproducir|lanza|lanzar|dispara|disparar|ejecuta|ejecutar|arranca|arrancar|inicia|iniciar|start|p[aá]nico|panic|arma|armar|arm)(?:\s+(?:todo|all|cue|ya|now|ahora|el\s+siguiente|el\s+cue|the\s+cue|the\s+next\s+cue|next\s+cue))?$/i;
const TRANSPORT_MIXED=/(?:\b(?:go|stop|panic|p[aá]nico)\b|\bdale\s+(?:a\s+)?(?:go|play)\b|\bpara\s+todo\b|\bdet[eé]n\s+todo\b|\b(?:ejecuta|lanza|dispara|reproduce|arranca)\s+(?:el\s+)?(?:siguiente\s+)?cue\b|\b(?:play|fire|trigger|run)\s+(?:the\s+)?(?:next\s+)?cue\b)/i;

export function normalizeVoiceTranscript(raw){
 if(typeof raw!=='string')return '';
 let t=raw.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
 for(let i=0;i<3;i++){
  const before=t;
  t=t.replace(FILLER_START,'').replace(ADDRESS,'').replace(POLITE_START,'').replace(POLITE_END,'').trim();
  if(t===before)break;
 }
 // Spoken cue references: "cue dos", "cue número tres", "q 4", "cue number five".
 t=t.replace(new RegExp('\\b(cue|q)\\s*(?:n[uú]mero|number|n[ºo°.]|num\\.?|#)?\\s*('+WORD_RE+')\\b','gi'),
  (_,head,word)=>'cue '+WORDS[word.toLowerCase()]);
 t=t.replace(/\b(cue|q)\s*(?:n[uú]mero|number|n[ºo°.]|num\.?|#)\s*(\d{1,5})\b/gi,'cue $2');
 t=t.replace(/\bq\s*(\d{1,5})\b/gi,'cue $1');
 // Spoken target numbers directly after a position word ("antes del dos").
 t=t.replace(new RegExp('\\b(antes\\s+del?|despu[eé]s\\s+del?|before|after)\\s+(?:cue\\s+)?('+WORD_RE+')\\b','gi'),
  (_,pos,word)=>pos+' cue '+WORDS[word.toLowerCase()]);
 return t.replace(/\s+/g,' ').replace(/[.!?¡¿\s]+$/,'').trim();
}

export function classifyVoiceEditText(raw,{source='voice'}={}){
 const text=normalizeVoiceTranscript(raw);
 if(text.length>VOICE_EDIT_MAX_CHARS)return {ok:false,code:'VOICE_TOO_LONG',text:''};
 if(INJECTION.test(text))return {ok:false,code:'VOICE_INJECTION_REJECTED',text};
 if(TRANSPORT_WHOLE.test(text))return {ok:false,code:'VOICE_TRANSPORT_REJECTED',text};
 if(text.length<3||NOISE_TAG.test(raw??''))return {ok:false,code:'VOICE_UNINTELLIGIBLE',text};
 if(source==='voice'&&TRANSPORT_MIXED.test(text))return {ok:false,code:'VOICE_TRANSPORT_REJECTED',text};
 return {ok:true,text};
}

/**
 * Builds a reviewable proposal from a transcript or typed text. Never applies it.
 * `NEEDS_AI` is returned unchanged so the host can ask for explicit AI consent.
 */
export function prepareVoiceEditRequest(project,raw,{source='voice',history=[],assetAvailable=()=>null}={}){
 const verdict=classifyVoiceEditText(raw,{source});
 const base={source,transcript:typeof raw==='string'?raw.replace(/\s+/g,' ').trim().slice(0,VOICE_EDIT_MAX_CHARS):'',
  normalized:verdict.text,requiresConfirmation:true,operations:[],plan:null};
 if(!verdict.ok)return {...base,status:'REJECTED',code:verdict.code,message:rejectionMessage(verdict.code)};
 let reply;
 try{reply=resolveAgentDialogue(project,verdict.text,{history,assetAvailable});}
 catch(error){return {...base,status:'ERROR',code:String(error.message).slice(0,80),message:'Instruction could not be interpreted.'};}
 if(reply.status!=='PLAN')return {...base,status:reply.status,code:null,message:reply.message,reply};
 try{
  const plan=prepareAgentPlan(project,reply.operations);
  return {...base,status:'PLAN',code:null,message:reply.message,operations:reply.operations,plan,reply};
 }catch(error){
  return {...base,status:'ERROR',code:String(error.code??error.message).slice(0,80),
   message:'The proposed operations failed validation. Nothing was prepared.',reply};
 }
}

export function rejectionMessage(code){
 switch(code){
  case 'VOICE_TRANSPORT_REJECTED':return 'Voice editing cannot run GO, STOP or playback. Use the operator controls.';
  case 'VOICE_INJECTION_REJECTED':return 'That request tries to change the assistant rules or reveal secrets and was rejected.';
  case 'VOICE_UNINTELLIGIBLE':return 'No clear instruction was heard. Edit the text or record again.';
  case 'VOICE_TOO_LONG':return 'The instruction is too long. Split it into smaller requests.';
  default:return 'Instruction rejected.';
 }
}

// Push-to-talk session states. Only the listed transitions exist; anything else is ignored.
const TRANSITIONS=Object.freeze({
 idle:{record:'recording'},
 recording:{stop:'recorded',fail:'idle',cancel:'idle'},
 recorded:{transcribe:'transcribing',discard:'idle',record:'recording'},
 transcribing:{transcribed:'review',fail:'recorded',cancel:'recorded'},
 review:{propose:'preview',discard:'idle',record:'recording'},
 preview:{apply:'idle',cancel:'idle',edit:'review'},
});
export function nextVoiceEditState(state,event){
 return TRANSITIONS[state]?.[event]??state;
}

/** Bounded, sanitized history: no audio, no model output, no secrets. */
export function appendVoiceEditHistory(history,entry){
 const item={
  at:Number.isFinite(entry?.at)?entry.at:0,
  source:entry?.source==='text'?'text':'voice',
  transcript:String(entry?.transcript??'').replace(/\s+/g,' ').slice(0,300),
  status:String(entry?.status??'UNKNOWN').slice(0,24),
  code:entry?.code?String(entry.code).slice(0,48):null,
  operations:Math.max(0,Math.min(99,Number(entry?.operations)||0)),
  outcome:['PROPOSED','APPLIED','CANCELLED','REJECTED','UNDONE'].includes(entry?.outcome)?entry.outcome:'PROPOSED',
 };
 return [...(Array.isArray(history)?history:[]),item].slice(-VOICE_EDIT_HISTORY_LIMIT);
}
