import { suggestVoiceCue } from '../core/voiceFollow.mjs';
import { makeProjectVoiceScenario } from '../core/voiceScenario.mjs';
import { readOperatorPreferences } from '../core/operatorPreferences.mjs';
/**
 * Optional rehearsal phrase recorder: local capture, plus separately authorized transcription.
 * Never prepares or fires a cue.
 */
const $=id=>document.getElementById(id);
let stream=null,ctx=null,source=null,processor=null,mutedGain=null,timer=null;
let recording=false,frames=[],samples=0,started=0;
let lastTake=null,requestInFlight=false;
const MAX_MS=10000;
let operatorPreferences=readOperatorPreferences();
const t=(en,es)=>$('uiLocaleSelect')?.value==='es'?es:en;
function status(en,es){$('rqMicStatus').textContent=t(en,es)}
function update(){
 const busy=Boolean(stream);
 $('rqMicStart').disabled=busy;
 $('rqMicStop').disabled=!busy;
 $('rqMicMeter').value=0;
 if(!busy)$('rqMicMeter').value=0;
}
function wav(pcm,sampleRate){
 const buffer=new ArrayBuffer(44+pcm.length*2),view=new DataView(buffer);
 const ascii=(offset,s)=>{for(let i=0;i<s.length;i++)view.setUint8(offset+i,s.charCodeAt(i));};
 ascii(0,'RIFF');view.setUint32(4,36+pcm.length*2,true);ascii(8,'WAVE');
 ascii(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);
 view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);
 view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
 ascii(36,'data');view.setUint32(40,pcm.length*2,true);
 for(let i=0;i<pcm.length;i++){
   const v=Math.max(-1,Math.min(1,pcm[i]));
   view.setInt16(44+i*2,Math.round(v<0?v*32768:v*32767),true);
 }
 return new Blob([buffer],{type:'audio/wav'});
}
function shutdown(){
 if(document.body?.dataset.runqVoiceCapture==='recording')delete document.body.dataset.runqVoiceCapture;
 if(timer!==null){clearTimeout(timer);timer=null;}
 processor?.disconnect();source?.disconnect();mutedGain?.disconnect();
 processor=null;source=null;mutedGain=null;
 stream?.getTracks().forEach(track=>track.stop());stream=null;
 if(ctx){const closing=ctx;ctx=null;void closing.close().catch(()=>{});}
 recording=false;update();
}
function complete(){
 if(!stream)return;
 const rate=ctx?.sampleRate??48000;
 const result=new Float32Array(samples);
 let pos=0;
 for(const frame of frames){result.set(frame,pos);pos+=frame.length;}
 shutdown();frames=[];samples=0;
 if(result.length<rate/5){status('No useful audio captured.','No se ha capturado audio suficiente.');return;}
 const blob=wav(result,rate);
 lastTake=blob;
 $('rqMicConsent').checked=false;
 $('rqMicTranscribe').disabled=false;
 $('rqMicTranscript').textContent='';
 $('rqMicCueMatch').textContent='';
 if(window.__runqMicTakeUrl)URL.revokeObjectURL(window.__runqMicTakeUrl);
 window.__runqMicTakeUrl=URL.createObjectURL(blob);
 $('rqMicListen').src=window.__runqMicTakeUrl;
 $('rqMicListen').hidden=false;
 $('rqMicDownload').hidden=false;
 $('rqMicDownload').href=window.__runqMicTakeUrl;
 $('rqMicDownload').download='runq-microphone-'+operatorPreferences.voiceLanguage+'.wav';
 status('Recording saved locally. Listen to verify both languages. No audio uploaded.',
        'Grabación local lista. Escúchala para comprobar ambos idiomas. No se ha enviado audio.');
}
async function begin(){
 if(stream||requestInFlight)return;
 if(document.body?.dataset.runqVoiceCapture){
  status('Another microphone session is in progress. Stop it first.',
    'Hay otra sesión de micrófono activa. Detenla antes.');return;
 }
 document.body.dataset.runqVoiceCapture='recording';
 lastTake=null;
 $('rqMicConsent').checked=false;
 $('rqMicTranscribe').disabled=true;
 $('rqMicTranscript').textContent='';
 try{
   if(!navigator.mediaDevices?.getUserMedia)throw Error('unsupported');
   const audio={channelCount:1,echoCancellation:false,noiseSuppression:false};
   if(operatorPreferences.microphoneDeviceId)audio.deviceId={exact:operatorPreferences.microphoneDeviceId};
   stream=await navigator.mediaDevices.getUserMedia({audio,video:false});
   const AudioContextCtor=window.AudioContext||window.webkitAudioContext;
   ctx=new AudioContextCtor();
   await ctx.resume();
   source=ctx.createMediaStreamSource(stream);
   processor=ctx.createScriptProcessor(2048,1,1);
   mutedGain=ctx.createGain();mutedGain.gain.value=0;
   source.connect(processor);processor.connect(mutedGain);mutedGain.connect(ctx.destination);
   frames=[];samples=0;started=performance.now();recording=true;
   processor.onaudioprocess=event=>{
     if(!recording)return;
     const input=event.inputBuffer.getChannelData(0);
     const frame=new Float32Array(input);
     if(samples+frame.length<=ctx.sampleRate*11){frames.push(frame);samples+=frame.length;}
     let total=0;for(let i=0;i<input.length;i++)total+=input[i]*input[i];
     $('rqMicMeter').value=Math.min(100,Math.round(Math.sqrt(total/input.length)*350));
     if(performance.now()-started>=MAX_MS)complete();
   };
   timer=setTimeout(complete,MAX_MS);
   update();
   status('Recording locally. Speak now; maximum 10 seconds.',
     'Grabando localmente. Habla ahora; máximo 10 segundos.');
 }catch(error){
   shutdown();
   status('Microphone unavailable or permission denied: '+(error?.name||'Unknown'),
     'Micrófono no disponible o permiso denegado: '+(error?.name||'Desconocido'));
 }
}
async function transcribe(){
 if(requestInFlight||stream||!lastTake)return;
 if(!$('rqMicConsent').checked){
  $('rqMicTranscribeStatus').textContent=t('Authorize this individual upload first.','Autoriza primero este envío concreto.');
  return;
 }
 requestInFlight=true;
 $('rqMicTranscribe').disabled=true;
 $('rqMicConsent').disabled=true;
 $('rqMicTranscribeStatus').textContent=t('Sending one recording securely to Meta Muse...', 'Enviando una grabación a Meta Muse...');
 const startedAt=performance.now();
 try{
  const response=await fetch('/api/voice/transcribe',{
   method:'POST',headers:{
    'Content-Type':'audio/wav',
    'X-RunQ-Voice-Consent':'yes',
    'X-RunQ-Voice-Language':operatorPreferences.voiceLanguage,
   },body:lastTake,
  });
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'HTTP_'+response.status);
  $('rqMicTranscript').textContent=data.transcript||t('(No speech found)','(No se detectó voz)');
  // Only show a candidate; this is never an operator queue instruction.
  let currentShow=null;
  document.dispatchEvent(new CustomEvent('runq:voice-follow-read-project',{
    detail:{respond:show=>{currentShow=show;}}
  }));
  const scenario=makeProjectVoiceScenario(currentShow);
  if(scenario && data.transcript){
    const result=suggestVoiceCue({
      cues:scenario.cues,transcript:{text:data.transcript,final:true,endMs:0},
      focusLine:scenario.initialFocusLine,nowMs:0,
    });
    const cue=scenario.cues.find(item=>item.id===result.cueId);
    $('rqMicCueMatch').textContent=result.status==='SUGGEST_PREPARE'
      ? t('Suggested cue (manual GO only): ','Cue sugerido (GO solo manual): ')+
        (cue?.label||result.cueId)+' · '+result.lineId+' · '+Math.round(result.score*100)+'%'
      : t('No confident cue match in the current show.','Sin coincidencia fiable con los cues del espectáculo.');
  }else{
    $('rqMicCueMatch').textContent=t('Configure voice triggers in Cue Editor to test cue matching.',
      'Configura los pies hablados en el editor para probar la coincidencia de cues.');
  }
  $('rqMicTranscribeStatus').textContent=t('Muse transcription received in ','Transcripción recibida en ')+
    ((performance.now()-startedAt)/1000).toFixed(2)+' s';
  // Transcript is displayed for operator review; it never changes the prepared queue or triggers GO.
 }catch(error){
  $('rqMicTranscript').textContent='';
  $('rqMicTranscribeStatus').textContent=t('Transcription unavailable: ','Transcripción no disponible: ')+String(error.message);
 }finally{
  requestInFlight=false;
  $('rqMicConsent').checked=false;
  $('rqMicConsent').disabled=false;
  $('rqMicTranscribe').disabled=!lastTake;
 }
}
function localize(){
 $('rqMicTitle').textContent=t('MICROPHONE TEST · LOCAL','PRUEBA DE MICRÓFONO · LOCAL');
 $('rqMicStart').textContent=t('Record 10s','Grabar 10 s');
 $('rqMicStop').textContent=t('Stop','Detener');
 $('rqMicPrivacy').textContent=t('Local recording and playback only. No automatic GO. Nothing sent to Meta.',
 'Grabación y escucha locales. Sin GO automático. No se envía nada a Meta.');
 $('rqMicDownload').textContent=t('Save WAV','Guardar WAV');
 $('rqMicTranscribe').textContent=t('Transcribe with Muse','Transcribir con Muse');
 $('rqMicConsentLabel').textContent=t('I authorize this one recording to be sent to Meta Muse for transcription.', 'Autorizo enviar esta grabación concreta a Meta Muse para transcribirla.');
 if(!stream&&!$('rqMicListen').src)status('Ready. Record a short phrase using the microphone configured in Setup.',
 'Preparado. Graba una frase con el micrófono configurado en Setup.');
}
function mount(){
 if(!$('rqMicStart'))return;
 $('rqMicStart').addEventListener('click',()=>void begin());
 $('rqMicStop').addEventListener('click',complete);
 $('rqMicTranscribe').addEventListener('click',()=>void transcribe());
 $('uiLocaleSelect')?.addEventListener('change',localize);
 document.addEventListener('runq:locale-ready',localize);
 document.addEventListener('runq:operator-preferences-changed',event=>{
  if(event.detail?.preferences)operatorPreferences=event.detail.preferences;
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&stream)complete();});
 window.addEventListener('pagehide',shutdown,{once:true});
 const shell=document.querySelector('.shell');
 if(shell)new MutationObserver(()=>{if(shell.dataset.activeWorkspace!=='rehearsal'&&stream)complete();})
   .observe(shell,{attributes:true,attributeFilter:['data-active-workspace']});
 localize();update();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
