/**
 * RunQ show event journal: bounded in-memory operational facts only.
 * Never records raw microphone transcripts, model prompts, API keys or PCM.
 * Callers report *acknowledged* changes (not intended actions).
 */
export const SHOW_EVENT_TYPES=Object.freeze([
  'CUE_STARTED','CUE_FINISHED','CUE_STOPPED','CUE_FADE',
  'NEXT_PREPARED','NEXT_SKIPPED','QUEUE_RESET',
  'STOP_ALL','AUTO_ARMED','AUTO_DISARMED','GO_REJECTED','AUDIO_ERROR',
  'SHOW_OPENED','SHOW_CREATED',
]);
const TYPES=new Set(SHOW_EVENT_TYPES);
const SOURCES=new Set(['operator','rehearsal','engine','project','system']);
export function createShowEventLog({limit=120,clock=()=>Date.now(),onChange=()=>{}}={}){
 if(!Number.isInteger(limit)||limit<1||limit>1000)throw new RangeError('Invalid event history limit');
 if(typeof clock!=='function'||typeof onChange!=='function')throw new TypeError('Invalid logger dependencies');
 let entries=[],id=0;
 function append(type,{cueId=null,label='',source='system',detail=''}={}){
  if(!TYPES.has(type)||!SOURCES.has(source))throw new TypeError('Invalid event type or source');
  if(cueId!==null&&(typeof cueId!=='string'||cueId.length>120))throw new TypeError('Invalid cue ID');
  if(typeof label!=='string'||label.length>200||typeof detail!=='string'||detail.length>160)
   throw new TypeError('Invalid event metadata');
  const at=clock();
  if(!Number.isFinite(at))throw new TypeError('Invalid clock');
  const item=Object.freeze({id:++id,at,type,cueId,label,source,detail});
  entries=[item,...entries].slice(0,limit);
  try{onChange(item);}catch{/* log failures must never interrupt STOP/GO */}
  return item;
 }
 return Object.freeze({
  append,
  snapshot:()=>Object.freeze([...entries]),
  clear:()=>{entries=[];},
 });
}

/** Event journaling must never alter acknowledged transport outcomes. */
export function appendShowEventSafely(log,...args){
 try{return log.append(...args)}catch{return null}
}
