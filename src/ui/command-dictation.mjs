/**
 * Shared, explicit 10-second command capture. Transcription only fills an
 * editor; cancellation invalidates permission, capture and late results.
 */
export function createCommandDictation({owner,contextKey,onTranscript,onStatus,onChange}){
 let epoch=0,phase='idle',capture=null,take=null,request=null,reservation=null;
 const host=()=>document.body;
 const publish=()=>onChange();
 const current=(token,key)=>token===epoch&&key!==null&&contextKey()===key;
 function release(resources){
  if(!resources)return;
  clearTimeout(resources.timer);
  for(const name of ['processor','source','gain']){
   const node=resources[name];resources[name]=null;
   if(node){
    if(name==='processor')node.onaudioprocess=null;
    try{node.disconnect();}catch{onStatus('cleanup_failed',true);}
   }
  }
  resources.stream?.getTracks().forEach(track=>track.stop());resources.stream=null;
  const ctx=resources.ctx;resources.ctx=null;
  if(ctx&&ctx.state!=='closed')void ctx.close().catch(()=>onStatus('cleanup_failed',true));
  if(reservation===resources.token){
   if(host()?.dataset.runqVoiceCapture===owner)delete host().dataset.runqVoiceCapture;
   reservation=null;
  }
 }
 function cancel(reason='cancelled'){
  if(phase==='idle'&&!take)return;
  epoch++;request?.abort();request=null;
  release(capture);capture=null;take=null;phase='idle';
  onStatus(reason,false);publish();
 }
 function finish(){
  const live=capture;if(!live)return;
  if(!current(live.token,live.key)){cancel('context_changed');return;}
  capture=null;release(live);
  if(live.size>=live.rate*.2){
   const samples=new Float32Array(live.size);let offset=0;
   for(const frame of live.frames){samples.set(frame,offset);offset+=frame.length;}
   take={audio:wave(samples,live.rate),key:live.key};phase='ready';
   onStatus('ready',false);
  }else{take=null;phase='idle';onStatus('insufficient_audio',true);}
  publish();
 }
 async function record(){
  if(phase==='recording'){finish();return;}
  if(phase==='acquiring'||phase==='transcribing')return;
  const key=contextKey();
  if(key===null){onStatus('unavailable_context',true);return;}
  if(host()?.dataset.runqVoiceCapture){onStatus('microphone_busy',true);return;}
  if(!navigator.mediaDevices?.getUserMedia){onStatus('microphone_unavailable',true);return;}
  const token=++epoch;
  take=null;phase='acquiring';
  host().dataset.runqVoiceCapture=owner;reservation=token;
  const resources={key,token,frames:[],size:0};capture=resources;publish();
  onStatus('acquiring',false);
  try{
   const deviceId=document.getElementById('rqLiveDevice')?.value??'';
   resources.stream=await navigator.mediaDevices.getUserMedia({
    audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,
     ...(deviceId?{deviceId:{exact:deviceId}}:{})},video:false,
   });
   if(!current(token,key)){release(resources);if(token===epoch)cancel('context_changed');return;}
   const Ctx=window.AudioContext||window.webkitAudioContext;
   resources.ctx=new Ctx({sampleRate:48000});await resources.ctx.resume();
   if(!current(token,key)){release(resources);if(token===epoch)cancel('context_changed');return;}
   const ctx=resources.ctx;resources.rate=ctx.sampleRate;
   resources.source=ctx.createMediaStreamSource(resources.stream);
   resources.processor=ctx.createScriptProcessor(2048,1,1);
   resources.gain=ctx.createGain();resources.gain.gain.value=0;
   resources.source.connect(resources.processor);
   resources.processor.connect(resources.gain);resources.gain.connect(ctx.destination);
   resources.processor.onaudioprocess=event=>{
    if(capture!==resources||!current(token,key))return;
    const remaining=Math.max(0,Math.floor(resources.rate*10)-resources.size);
    const input=event.inputBuffer.getChannelData(0).subarray(0,remaining);
    resources.frames.push(new Float32Array(input));resources.size+=input.length;
    if(resources.size>=resources.rate*10)finish();
   };
   resources.timer=setTimeout(finish,10000);phase='recording';
   onStatus('recording',false);publish();
  }catch{
   release(resources);
   if(token!==epoch)return;
   capture=null;phase='idle';onStatus('microphone_unavailable',true);publish();
  }
 }
 async function transcribe(consent,language){
  if(phase!=='ready'||!take){onStatus('no_recording',true);return;}
  if(!consent){onStatus('consent_required',true);return;}
  const saved=take;
  if(contextKey()!==saved.key){cancel('context_changed');return;}
  const token=++epoch,controller=new AbortController();
  request=controller;take=null;phase='transcribing';publish();
  onStatus('transcribing',false);
  const timeout=setTimeout(()=>controller.abort(),20000);
  try{
   const response=await fetch('/api/voice/transcribe',{
    method:'POST',headers:{'Content-Type':'audio/wav','X-RunQ-Voice-Consent':'yes',
     'X-RunQ-Voice-Language':language},body:saved.audio,signal:controller.signal,
   });
   const data=await response.json();
   if(!current(token,saved.key)){
    if(token===epoch)onStatus('context_changed',false);return;
   }
   if(response.status===403&&data?.error==='VOICE_CAMPAIGN_PROHIBITED'){
    request=null;phase='idle';publish();onStatus('voice_campaign_prohibited',true);return;
   }
   if(!response.ok||typeof data.transcript!=='string'||!data.transcript.trim())
    throw new Error('INVALID_TRANSCRIPTION');
   request=null;phase='idle';publish();
   if(!current(token,saved.key))return;
   onTranscript(data.transcript.trim().slice(0,1600));onStatus('recognized',false);
  }catch{
   if(token===epoch)onStatus('transcription_failed',true);
  }finally{
   clearTimeout(timeout);
   if(token===epoch){request=null;phase='idle';publish();}
  }
 }
 return {record,transcribe,cancel,
  get phase(){return phase;},get busy(){return ['acquiring','recording','transcribing'].includes(phase);},
  get hasWork(){return phase!=='idle'||take!==null;},
  get canTranscribe(){return phase==='ready'&&take!==null;},
 };
}
function wave(samples,rate){
 const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);
 const ascii=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
 ascii(0,'RIFF');view.setUint32(4,36+samples.length*2,true);ascii(8,'WAVEfmt ');
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
 view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);
 view.setUint16(32,2,true);view.setUint16(34,16,true);
 ascii(36,'data');view.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){
  const sample=Math.min(1,Math.max(-1,samples[i]));
  view.setInt16(44+i*2,Math.round(sample<0?sample*32768:sample*32767),true);
 }
 return new Blob([buffer],{type:'audio/wav'});
}
export function commandDictationMessage(code,language){
 const messages={
  cleanup_failed:['No se pudo cerrar completamente la captura. Revisa el micrófono.','Capture cleanup failed. Check the microphone.'],
  cancelled:['Dictado cancelado. Sin aplicar cambios; un envío iniciado puede tener coste.','Dictation cancelled. No changes applied; an upload already started may incur a charge.'],
  context_changed:['El contexto cambió. Grabación y resultados pendientes descartados.','Context changed. Recording and pending results discarded.'],
  ready:['Grabación lista. Autoriza y pulsa Transcribir.','Recording ready. Consent and press Transcribe.'],
  insufficient_audio:['No se capturó suficiente voz.','Not enough speech was captured.'],
  unavailable_context:['Detén el audio y selecciona un contexto de diseño editable.','Stop audio and select an editable design context.'],
  microphone_busy:['Otro micrófono está activo. Deténlo primero.','Another microphone is active. Stop it first.'],
  microphone_unavailable:['No se pudo acceder al micrófono.','Microphone unavailable.'],
  acquiring:['Esperando permiso del micrófono…','Waiting for microphone permission…'],
  recording:['Grabando hasta 10 s. Pulsa de nuevo para detener.','Recording up to 10 s. Press again to stop.'],
  no_recording:['Graba primero una instrucción.','Record an instruction first.'],
  consent_required:['Autoriza este envío individual para transcribir.','Authorize this individual transcription upload.'],
  transcribing:['Transcribiendo…','Transcribing…'],
  recognized:['Texto reconocido; revísalo antes de proponer cambios.','Speech recognized; review before proposing changes.'],
  transcription_failed:['No se pudo transcribir. No se reintentará automáticamente.','Transcription failed. No automatic retry.'],
  voice_campaign_prohibited:['La transcripción por voz está desactivada por la política de gasto (voz: 0 USD). No se ha enviado audio al proveedor; escribe la instrucción.','Voice transcription is disabled by the spend policy (voice: USD 0). No audio was sent to the provider; type the instruction instead.'],
 };
 if(!Object.hasOwn(messages,code))throw new TypeError('Unknown dictation status');
 return messages[code][language==='es'?0:1];
}
