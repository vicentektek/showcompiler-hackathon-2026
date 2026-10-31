/**
 * Human, non-alarming replies when the agent cannot (or may not) act.
 * Pure text policy: no network, no project mutation, never a plan.
 * A failed or unsafe model reply is explained, never shown as a raw error code.
 */
const TOPICS=[
 ['trigger',/(?:trigger|pie(?:s)?(?:\s+de\s+voz)?|operator|actor|actriz|personaje|speaker|dice|says)/i],
 ['audio',/(?:audio|sonido|sound|archivo|file|m[uú]sica|music|volumen|volume|fade|loop)/i],
 ['order',/(?:orden|mueve|mover|antes|despu[eé]s|order|move|before|after)/i],
 ['create',/(?:crea|a[nñ]ade|agrega|nuevo|create|add|new)/i],
 ['review',/(?:revisa|audita|errores|review|audit|check|problem)/i],
];
export function detectAgentTopic(text){
 const value=String(text??'');
 return TOPICS.find(([,pattern])=>pattern.test(value))?.[0]??'general';
}
const HINTS={
 es:{
  trigger:['«Pon pies de voz coherentes a todos los cues» (solo con evidencia del guion)',
   'Dime el número de cue y el texto exacto del pie: «cue 5 pie: …»',
   'Los nombres de actor no forman parte del pie hablado; puedo dejarlos en las notas del cue.'],
  audio:['«cue 3 volumen -6 dB», «cue 3 fade in 2 segundos» o «cue 3 en bucle»',
   'Para un sonido nuevo: «mejora el sonido del cue 3» (lo preparo en Sound Lab).'],
  order:['«mueve el cue 4 después del 7»','«elimina el cue 2»'],
  create:['«crea un cue llamado Truenos»','«añade tres cues para rematar el show»'],
  review:['«revisa el show»','«resumen del proyecto»'],
  general:['«revisa el show» o «resumen del proyecto»','«cue 3 volumen -6 dB»',
   '«crea un cue llamado …» o «mueve el cue 4 después del 7»'],
 },
 en:{
  trigger:['"Assign spoken triggers to all cues" (only with script evidence)',
   'Tell me the cue number and the exact trigger text: "cue 5 trigger: …"',
   'Actor names are not part of the spoken trigger; I can keep them in the cue notes.'],
  audio:['"cue 3 volume -6 dB", "cue 3 fade in 2 seconds" or "cue 3 loop"',
   'For a new sound: "improve the sound of cue 3" (I prepare it in Sound Lab).'],
  order:['"move cue 4 after 7"','"delete cue 2"'],
  create:['"create a cue named Thunder"','"add three cues to finish the show"'],
  review:['"audit the show"','"show summary"'],
  general:['"audit the show" or "show summary"','"cue 3 volume -6 dB"',
   '"create a cue named …" or "move cue 4 after 7"'],
 },
};
const OPENERS={
 es:{
  NEEDS_AI:'Esto es más complejo de lo que puedo resolver sin consultar a la IA.',
  MODEL_TIMEOUT:'La IA tardó demasiado en responder y no quise dejarte esperando.',
  PROVIDER_DOWN:'No he podido contactar con la IA en este momento.',
  MODEL_UNSAFE:'Pensé una propuesta, pero no puedo garantizar que sea fiel al guion, así que la he descartado.',
  MODEL_BAD_REPLY:'La IA me respondió con algo que no he podido interpretar con seguridad.',
  NO_KEY:'La consulta a la IA no está configurada en este equipo.',
  BUSY:'Estoy terminando otra consulta; dame un momento.',
  TOO_BIG:'El contexto del show es demasiado grande para una sola consulta.',
  OFFLINE:'No he podido completar la consulta.',
 },
 en:{
  NEEDS_AI:'This is more complex than I can solve without consulting the AI.',
  MODEL_TIMEOUT:'The AI took too long to answer, so I stopped waiting.',
  PROVIDER_DOWN:'I could not reach the AI right now.',
  MODEL_UNSAFE:'I drafted a proposal but cannot guarantee it matches your script, so I discarded it.',
  MODEL_BAD_REPLY:'The AI replied with something I could not interpret safely.',
  NO_KEY:'AI consultation is not configured on this machine.',
  BUSY:'I am finishing another request; give me a moment.',
  TOO_BIG:'The show context is too large for a single request.',
  OFFLINE:'I could not complete the request.',
 },
};
/** Map server reason/error codes to a stable, human category. */
export function classifyAgentFailure({reason=null,error=null,status=null}={}){
 const code=String(reason??error??'');
 if(/TIMEOUT|ABORT/i.test(code))return 'MODEL_TIMEOUT';
 if(code==='MODEL_NOT_CONFIGURED'||code==='MODEL_API_KEY_NOT_CONFIGURED'||status===503)return 'NO_KEY';
 if(code==='AGENT_BUSY'||status===429)return 'BUSY';
 if(/NOT_IN_CONTEXT|TRIGGER|EVIDENCE|UNSUPPORTED|UNEXPECTED|INVALID_(?:CUE|NEW|OPERATION)|BAD_(?:OPERATION|EDITS)/i.test(code))
  return 'MODEL_UNSAFE';
 if(/BAD_MODEL_REPLY|REPLY_TOO_LARGE/i.test(code))return 'MODEL_BAD_REPLY';
 if(/PROVIDER_UNAVAILABLE/i.test(code))return 'PROVIDER_DOWN';
 if(/EXCEEDS|TOO_BIG|BODY_TOO_LARGE|INVALID_AGENT_INPUT/i.test(code))return 'TOO_BIG';
 return 'OFFLINE';
}
/**
 * @returns {{kind:string,message:string,suggestions:string[]}}
 * Always conversational: what happened, that nothing changed, what to try.
 */
export function humanAgentReply({kind,language='es',instruction=''}){
 const lang=language==='en'?'en':'es';
 const opener=OPENERS[lang][kind]??OPENERS[lang].OFFLINE;
 const topic=detectAgentTopic(instruction);
 const none=lang==='es'?'No he cambiado nada en tu show.':'I have not changed anything in your show.';
 const tryLine=lang==='es'?'Puedes probar, por ejemplo:':'You could try, for example:';
 const retry=lang==='es'
  ?(['MODEL_TIMEOUT','PROVIDER_DOWN','BUSY','OFFLINE'].includes(kind)?' Si quieres, reintenta en unos segundos.':'')
  :(['MODEL_TIMEOUT','PROVIDER_DOWN','BUSY','OFFLINE'].includes(kind)?' You can retry in a few seconds.':'');
 const suggestions=HINTS[lang][topic].slice(0,3);
 return {kind,message:`${opener} ${none}${retry}\n${tryLine}`,suggestions};
}
export function humanizeAgentError(failure,{language='es',instruction=''}={}){
 return humanAgentReply({kind:classifyAgentFailure(failure),language,instruction});
}
/** Local NEEDS_AI replies become guidance instead of a dead end. */
export function humanNeedsAiReply({language='es',instruction=''}={}){
 const reply=humanAgentReply({kind:'NEEDS_AI',language,instruction});
 const ask=language==='en'
  ?'Press "Ask AI" (it needs your authorization) and I will draft a plan for you to review.'
  :'Pulsa «Consultar IA» (requiere tu autorización) y te preparo una propuesta para revisar.';
 return {...reply,suggestions:[ask,...reply.suggestions.slice(0,2)]};
}
export function formatHumanReply(reply){
 return reply.message+'\n'+reply.suggestions.map(x=>'• '+x).join('\n');
}
