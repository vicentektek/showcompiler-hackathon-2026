import {
  DEFAULT_OPERATOR_PREFERENCES,
  normalizeOperatorPreferences,
  readOperatorPreferences,
  saveOperatorPreferences,
} from '../core/operatorPreferences.mjs';

const $=id=>document.getElementById(id);
const local=(en,es)=>$('uiLocaleSelect')?.value==='es'?es:en;
const shell=()=>document.querySelector('.shell');
const recentIssues=[];
let preferences=readOperatorPreferences();
let microphoneStream=null,microphoneContext=null,microphoneFrame=0,microphoneStarting=false,microphoneStartToken=0;
let activePage='audio';
let permissionState='unknown';
const densityKey='runq.interface.cueDensity';

function storage(){
 try{return window.localStorage;}catch{return null;}
}
function setStatus(id,en,es){
 const output=$(id);
 if(output)output.textContent=local(en,es);
}
function rememberIssue(message){
 recentIssues.unshift(message);
 recentIssues.splice(5);
 renderDiagnostics();
}
function applyPreferences(next,{persist=true}={}){
 preferences=normalizeOperatorPreferences(next);
 next=preferences;
 $('setupMasterVolume').value=String(Math.round(next.masterVolume*100));
 $('setupMasterVolumeValue').value=Math.round(next.masterVolume*100)+'%';
 $('rqLiveDevice').value=next.microphoneDeviceId;
 $('rqLiveLang').value=next.voiceLanguage;
 $('rqLiveMode').value=next.voiceMode;
 if(persist){
  try{
   preferences=saveOperatorPreferences(storage(),next);
  }catch(error){
   dispatchPreferences();
   return {saved:false,error};
  }
 }
 dispatchPreferences();
 return {saved:true};
}
function dispatchPreferences(){
 document.dispatchEvent(new CustomEvent('runq:operator-preferences-changed',{
  detail:{preferences},
 }));
}
function audioControl(action,value){
 return new Promise(resolve=>{
  document.dispatchEvent(new CustomEvent('runq:audio-control',{
   detail:{action,value,respond:resolve},
  }));
 });
}
function showAudioError(id,error,en,es){
 const message=String(error?.error??error?.message??'');
 const safe=message.includes('Stop playback')||message.includes('Stop audition')
  ?local('Stop playback and audition before changing this setting.','Detén la reproducción y la audición antes de cambiar este ajuste.')
  :message.includes('does not support')
   ?local('This browser does not support this output action.','Este navegador no admite esta acción de salida.')
   :message.includes('suspended')
    ?local('Browser audio is suspended. Interact with the page and try again.','El audio del navegador está suspendido. Interactúa con la página y vuelve a intentarlo.')
    :local(en,es);
 setStatus(id,safe,safe);
 rememberIssue(local('Audio settings action failed.','Falló una acción de configuración de audio.'));
}
function setOutputLabel(){
 $('setupOutputValue').textContent=preferences.outputDeviceId
  ?local('Custom output selected','Salida personalizada seleccionada')
  :local('System default','Salida predeterminada del sistema');
}
async function updateAudioControls(){
 const response=await audioControl('diagnostics');
 if(!response?.ok){
  $('setupDiagnosticEngine').textContent=local('Diagnostics unavailable','Diagnóstico no disponible');
  $('setupChooseOutput').disabled=true;
  $('setupDefaultOutput').disabled=true;
  $('setupTestOutput').disabled=true;
  $('setupMasterVolume').disabled=true;
  return;
 }
 const state=response.result;
 const busy=state.activeCueCount>0||state.pendingGoCount>0||state.auditionActive;
 $('setupChooseOutput').disabled=busy;
 $('setupDefaultOutput').disabled=busy;
 $('setupTestOutput').disabled=busy;
 $('setupResetAudio').disabled=busy;
 $('setupMasterVolume').disabled=busy;
 $('setupDiagnosticEngine').textContent=state.contextState;
 $('setupDiagnosticOutput').textContent=state.outputError
  ?local('Output unavailable','Salida no disponible')
  :!state.selectedOutputDeviceId
   ?local('System default output','Salida predeterminada del sistema')
   :state.outputSelectionSupported
    ?local('Custom output selected','Salida personalizada seleccionada')
    :local('Custom output configured; routing not verified','Salida personalizada configurada; ruta sin verificar');
 $('setupDiagnosticErrors').textContent=recentIssues.join(' · ')||local('No recent setup errors','Sin errores recientes de configuración');
}
function renderDiagnostics(){
 $('setupDiagnosticErrors').textContent=recentIssues.join(' · ')||local('No recent setup errors','Sin errores recientes de configuración');
}
async function chooseOutput(){
 const media=navigator.mediaDevices;
 if(typeof media?.selectAudioOutput!=='function'){
  setStatus('setupAudioStatus','This browser cannot open an output-device chooser. System default remains available.','Este navegador no puede abrir el selector de salida. La salida predeterminada sigue disponible.');
  rememberIssue(local('Output device selection is unsupported.','La selección de salida no es compatible.'));
  return;
 }
 try{
  const selected=await media.selectAudioOutput(
   preferences.outputDeviceId?{deviceId:preferences.outputDeviceId}:{},
  );
  if(!selected?.deviceId)throw new Error('OUTPUT_SELECTION_CANCELLED');
  const result=await audioControl('setOutputDevice',selected.deviceId);
  if(!result?.ok)throw new Error(result?.error||'OUTPUT_UNAVAILABLE');
  const saved=applyPreferences({...preferences,outputDeviceId:selected.deviceId});
  setOutputLabel();
  setStatus('setupAudioStatus',
   saved.saved?'Output device selected and saved locally.':'Output selected for this session; local storage is unavailable.',
   saved.saved?'Salida seleccionada y guardada localmente.':'Salida seleccionada para esta sesión; el almacenamiento local no está disponible.');
  if(!saved.saved)rememberIssue(local('Could not save local audio preferences.','No se pudieron guardar las preferencias de audio locales.'));
 }catch(error){
  if(error?.name==='NotAllowedError'||error?.message==='OUTPUT_SELECTION_CANCELLED'){
   setStatus('setupAudioStatus','Output selection was cancelled or not authorized.','Se canceló o no se autorizó la selección de salida.');
   return;
  }
  showAudioError('setupAudioStatus',error,
   'Could not select the audio output.','No se pudo seleccionar la salida de audio.');
 }finally{void updateAudioControls();}
}
async function setDefaultOutput(){
 try{
  const result=await audioControl('setOutputDevice','');
  if(!result?.ok)throw new Error(result?.error||'OUTPUT_UNAVAILABLE');
  const saved=applyPreferences({...preferences,outputDeviceId:''});
  setOutputLabel();
  setStatus('setupAudioStatus',
   saved.saved?'Using the system default output.':'Using the system default for this session; local storage is unavailable.',
   saved.saved?'Se usa la salida predeterminada del sistema.':'Se usa la salida predeterminada en esta sesión; el almacenamiento local no está disponible.');
  if(!saved.saved)rememberIssue(local('Could not save local audio preferences.','No se pudieron guardar las preferencias de audio locales.'));
 }catch(error){showAudioError('setupAudioStatus',error,'Could not restore the system output.','No se pudo restaurar la salida del sistema.');}
 finally{setOutputLabel();void updateAudioControls();}
}
async function testOutput(){
 try{
  const result=await audioControl('testOutput');
  if(!result?.ok)throw new Error(result?.error||'OUTPUT_TEST_FAILED');
  setStatus('setupAudioStatus','Playing a short test tone through the cue output.','Reproduciendo un tono breve por la salida de los cues.');
 }catch(error){showAudioError('setupAudioStatus',error,'Could not play the output test tone.','No se pudo reproducir el tono de prueba.');}
 finally{void updateAudioControls();}
}
async function setMasterVolume(){
 const value=Number($('setupMasterVolume').value)/100;
 try{
  const result=await audioControl('setMasterVolume',value);
  if(!result?.ok)throw new Error(result?.error||'MASTER_VOLUME_FAILED');
  const saved=applyPreferences({...preferences,masterVolume:value});
  $('setupMasterVolumeValue').value=Math.round(value*100)+'%';
  setStatus('setupAudioStatus',
   saved.saved?'Master volume updated and saved locally.':'Master volume updated for this session; local storage is unavailable.',
   saved.saved?'Volumen maestro actualizado y guardado localmente.':'Volumen maestro actualizado para esta sesión; el almacenamiento local no está disponible.');
  if(!saved.saved)rememberIssue(local('Could not save local audio preferences.','No se pudieron guardar las preferencias de audio locales.'));
 }catch(error){
  $('setupMasterVolume').value=String(Math.round(preferences.masterVolume*100));
  $('setupMasterVolumeValue').value=Math.round(preferences.masterVolume*100)+'%';
  showAudioError('setupAudioStatus',error,'Could not change master volume.','No se pudo cambiar el volumen maestro.');
 }
 void updateAudioControls();
}
async function refreshMicrophones(){
 const media=navigator.mediaDevices;
 if(typeof media?.enumerateDevices!=='function'){
  setStatus('setupMicrophoneStatus','This browser cannot list microphone inputs. The system default may still work.','Este navegador no puede enumerar entradas de micrófono. La entrada predeterminada podría funcionar.');
  return;
 }
 try{
  const devices=(await media.enumerateDevices()).filter(item=>item.kind==='audioinput');
  const selected=preferences.microphoneDeviceId;
  const options=[new Option(local('System default microphone','Micrófono predeterminado del sistema'),'')];
  devices.forEach((device,index)=>{
   options.push(new Option(device.label||local('Microphone ','Micrófono ')+(index+1),device.deviceId));
  });
  if(selected&&!devices.some(device=>device.deviceId===selected))
   options.push(new Option(local('Saved microphone (not currently listed)','Micrófono guardado (no aparece ahora)'),selected));
  const select=$('rqLiveDevice');
  select.replaceChildren(...options);
  select.value=selected;
  select.disabled=microphoneStarting||Boolean(microphoneStream);
  $('rqLiveRefresh').disabled=microphoneStarting||Boolean(microphoneStream);
  setStatus('setupMicrophoneStatus',
   devices.length?'Microphone list refreshed.':'No microphone inputs are currently visible.',
   devices.length?'Lista de micrófonos actualizada.':'No hay entradas de micrófono visibles ahora.');
 }catch{
  setStatus('setupMicrophoneStatus','Could not refresh microphone inputs.','No se pudieron actualizar las entradas de micrófono.');
  rememberIssue(local('Microphone device enumeration failed.','Falló la enumeración de micrófonos.'));
 }
}
function stopMicrophoneTest(){
 const wasActive=microphoneStarting||Boolean(microphoneStream);
 microphoneStartToken++;
 microphoneStarting=false;
 if(microphoneFrame)cancelAnimationFrame(microphoneFrame);
 microphoneFrame=0;
 microphoneStream?.getTracks().forEach(track=>track.stop());
 microphoneStream=null;
 if(microphoneContext){
  const closing=microphoneContext;
  microphoneContext=null;
  void closing.close().catch(()=>setStatus('setupMicStatus','Microphone test audio context could not close cleanly.','No se pudo cerrar correctamente el contexto de audio de la prueba.'));
 }
 $('setupMicMeter').value=0;
 $('setupMicStart').disabled=false;
 $('setupMicStop').disabled=true;
 $('rqLiveDevice').disabled=false;
 $('rqLiveRefresh').disabled=false;
 $('setupResetMicrophone').disabled=false;
 if(wasActive)setStatus('setupMicStatus','Microphone test stopped.','Prueba de micrófono detenida.');
}
async function startMicrophoneTest(){
 if(microphoneStream||microphoneStarting)return;
 if(!navigator.mediaDevices?.getUserMedia){
  setStatus('setupMicStatus','This browser does not provide microphone capture.','Este navegador no permite capturar micrófono.');
  rememberIssue(local('Microphone capture is unsupported.','La captura de micrófono no es compatible.'));
  return;
 }
 microphoneStarting=true;
 const token=++microphoneStartToken;
 $('setupMicStart').disabled=true;
 $('rqLiveDevice').disabled=true;
 $('rqLiveRefresh').disabled=true;
 $('setupResetMicrophone').disabled=true;
 $('setupMicStop').disabled=false;
 setStatus('setupMicStatus','Waiting for browser microphone permission.','Esperando el permiso de micrófono del navegador.');
 try{
  const audio={channelCount:1};
  if(preferences.microphoneDeviceId)audio.deviceId={exact:preferences.microphoneDeviceId};
  const stream=await navigator.mediaDevices.getUserMedia({audio,video:false});
  const activeWorkspace=shell()?.dataset.activeWorkspace;
  if(token!==microphoneStartToken||document.hidden||activeWorkspace!=='setup'||activePage!=='microphone'){
   stream.getTracks().forEach(track=>track.stop());
   return;
  }
  microphoneStream=stream;
  microphoneStarting=false;
  const AudioContextCtor=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextCtor)throw new Error('AudioContext is unavailable');
  const context=new AudioContextCtor();
  microphoneContext=context;
  await context.resume();
  if(token!==microphoneStartToken)return;
  const source=context.createMediaStreamSource(stream);
  const analyser=context.createAnalyser();
  analyser.fftSize=1024;
  source.connect(analyser);
  const samples=new Uint8Array(analyser.fftSize);
  const update=()=>{
   if(!microphoneStream||!microphoneContext)return;
   analyser.getByteTimeDomainData(samples);
   let power=0;
   for(const sample of samples){
    const value=(sample-128)/128;
    power+=value*value;
   }
   $('setupMicMeter').value=Math.min(100,Math.round(Math.sqrt(power/samples.length)*350));
   microphoneFrame=requestAnimationFrame(update);
  };
  $('setupMicStop').disabled=false;
  $('setupMicStart').disabled=true;
  setStatus('setupMicStatus','Listening locally. No recording is saved or uploaded.','Escucha local activa. No se guarda ni se envía la grabación.');
  update();
 }catch(error){
  if(token!==microphoneStartToken)return;
  stopMicrophoneTest();
  const denied=error?.name==='NotAllowedError'||error?.name==='SecurityError';
  setStatus('setupMicStatus',
   denied?'Microphone permission was denied. Allow it in the browser settings and retry.':'Microphone test could not start. Check the selected input.',
   denied?'Se denegó el permiso del micrófono. Autorízalo en el navegador y vuelve a intentarlo.':'No se pudo iniciar la prueba. Comprueba la entrada seleccionada.');
  rememberIssue(local('Microphone test failed.','Falló la prueba del micrófono.'));
 }
}
function setPage(page,focus=false){
 const tab=document.querySelector(`[data-setup-page-nav="${page}"]`);
 if(!tab)return;
 activePage=page;
 for(const button of document.querySelectorAll('[data-setup-page-nav]')){
  const selected=button.dataset.setupPageNav===page;
  button.setAttribute('aria-selected',String(selected));
  button.tabIndex=selected?0:-1;
 }
 for(const panel of document.querySelectorAll('[data-setup-page]'))
  panel.hidden=panel.dataset.setupPage!==page;
 if(focus)tab.focus();
 if(page!=='microphone')stopMicrophoneTest();
 if(page==='microphone')void refreshMicrophones();
 if(page==='diagnostics')void refreshDiagnostics();
}
async function refreshDiagnostics(){
 await updateAudioControls();
 try{
  if(!navigator.permissions?.query){
   permissionState='unknown';
  }else{
   const permission=await navigator.permissions.query({name:'microphone'});
   permissionState=permission.state;
  }
 }catch{permissionState='unknown';}
 $('setupDiagnosticMic').textContent=permissionState==='granted'
  ?local('Permission granted','Permiso concedido')
  :permissionState==='denied'?local('Permission denied','Permiso denegado')
   :permissionState==='prompt'?local('Not requested','Aún no solicitado')
    :local('Status unavailable','Estado no disponible');
 renderDiagnostics();
}
function updateShowData(){
 $('setupDataShowName').textContent=$('activeShowTitle')?.textContent||'';
 $('setupDataSaveState').textContent=$('saveState')?.textContent||'';
}
function setDensity(value){
 const valid=['compact','standard','comfortable'].includes(value)?value:'standard';
 document.querySelector('.shell').dataset.cueDensity=valid;
 $('setupCueDensity').value=valid;
 try{
  const target=storage();
  if(!target)throw new Error('Storage unavailable');
  target.setItem(densityKey,valid);
  setStatus('setupInterfaceStatus','Interface preference saved locally.','Preferencia de interfaz guardada localmente.');
 }catch{
  setStatus('setupInterfaceStatus','Interface changed for this session; local storage is unavailable.','Interfaz cambiada para esta sesión; el almacenamiento local no está disponible.');
 }
}
function readDensity(){
 try{return storage()?.getItem(densityKey)||'standard';}catch{return 'standard';}
}
function resetPreferences(group){
 const patch=group==='audio'
  ?{outputDeviceId:DEFAULT_OPERATOR_PREFERENCES.outputDeviceId,masterVolume:DEFAULT_OPERATOR_PREFERENCES.masterVolume}
  :group==='microphone'?{microphoneDeviceId:DEFAULT_OPERATOR_PREFERENCES.microphoneDeviceId}
   :{voiceLanguage:DEFAULT_OPERATOR_PREFERENCES.voiceLanguage,voiceMode:DEFAULT_OPERATOR_PREFERENCES.voiceMode};
 if(group==='audio'){
  void (async()=>{
   try{
    const output=await audioControl('setOutputDevice','');
    if(!output?.ok)throw new Error(output.error);
    const volume=await audioControl('setMasterVolume',DEFAULT_OPERATOR_PREFERENCES.masterVolume);
    if(!volume?.ok)throw new Error(volume.error);
    const saved=applyPreferences({...preferences,...patch});
    if(!saved.saved)rememberIssue(local('Could not save restored preferences.','No se pudieron guardar las preferencias restauradas.'));
    setStatus('setupAudioStatus',saved.saved?'Audio preferences restored.':'Audio defaults restored for this session only.',
     saved.saved?'Preferencias de audio restauradas.':'Valores de audio restaurados solo para esta sesión.');
   }catch(error){showAudioError('setupAudioStatus',error,'Could not restore all audio defaults.','No se pudieron restaurar todos los valores de audio.');}
   setOutputLabel();void updateAudioControls();
  })();
 }else if(group==='microphone'){
  const saved=applyPreferences({...preferences,...patch});
  if(!saved.saved)rememberIssue(local('Could not save restored preferences.','No se pudieron guardar las preferencias restauradas.'));
  $('rqLiveDevice').value='';
  setStatus('setupMicrophoneStatus',saved.saved?'Microphone defaults restored.':'Microphone default restored for this session only.',
   saved.saved?'Preferencia predeterminada del micrófono restaurada.':'Micrófono predeterminado restaurado solo para esta sesión.');
 }else{
  const saved=applyPreferences({...preferences,...patch});
  if(!saved.saved)rememberIssue(local('Could not save restored preferences.','No se pudieron guardar las preferencias restauradas.'));
  setStatus('setupRehearsalStatus',saved.saved?'Rehearsal preferences restored.':'Rehearsal defaults restored for this session only.',
   saved.saved?'Preferencias de ensayo restauradas.':'Valores de ensayo restaurados solo para esta sesión.');
 }
}
function mount(){
 if(!$('setupPageNav'))return;
 for(const tab of document.querySelectorAll('[data-setup-page-nav]')){
  tab.addEventListener('click',()=>setPage(tab.dataset.setupPageNav));
  tab.addEventListener('keydown',event=>{
   const tabs=[...document.querySelectorAll('[data-setup-page-nav]')];
   const index=tabs.indexOf(tab);
   const next=event.key==='ArrowDown'||event.key==='ArrowRight'
    ?(index+1)%tabs.length
    :event.key==='ArrowUp'||event.key==='ArrowLeft'?(index-1+tabs.length)%tabs.length:-1;
   if(next<0)return;
   event.preventDefault();
   setPage(tabs[next].dataset.setupPageNav,true);
  });
 }
 $('setupChooseOutput').addEventListener('click',()=>void chooseOutput());
 $('setupDefaultOutput').addEventListener('click',()=>void setDefaultOutput());
 $('setupTestOutput').addEventListener('click',()=>void testOutput());
 $('setupMasterVolume').addEventListener('input',()=>{
  $('setupMasterVolumeValue').value=$('setupMasterVolume').value+'%';
 });
 $('setupMasterVolume').addEventListener('change',()=>void setMasterVolume());
 $('setupResetAudio').addEventListener('click',()=>resetPreferences('audio'));
 $('rqLiveDevice').addEventListener('change',()=>{
  const saved=applyPreferences({...preferences,microphoneDeviceId:$('rqLiveDevice').value});
  setStatus('setupMicrophoneStatus',
   saved.saved?'Microphone preference saved locally.':'Microphone selected for this session; local storage is unavailable.',
   saved.saved?'Preferencia de micrófono guardada localmente.':'Micrófono seleccionado para esta sesión; el almacenamiento local no está disponible.');
 });
 $('rqLiveRefresh').addEventListener('click',()=>void refreshMicrophones());
 $('setupMicStart').addEventListener('click',()=>void startMicrophoneTest());
 $('setupMicStop').addEventListener('click',stopMicrophoneTest);
 $('setupResetMicrophone').addEventListener('click',()=>resetPreferences('microphone'));
 $('rqLiveLang').addEventListener('change',()=>{
  const saved=applyPreferences({...preferences,voiceLanguage:$('rqLiveLang').value});
  setStatus('setupRehearsalStatus',saved.saved?'Voice language saved locally.':'Voice language changed for this session only.',
   saved.saved?'Idioma de voz guardado localmente.':'Idioma de voz cambiado solo para esta sesión.');
 });
 $('rqLiveMode').addEventListener('change',()=>{
  const saved=applyPreferences({...preferences,voiceMode:$('rqLiveMode').value});
  setStatus('setupRehearsalStatus',saved.saved?'Cue follow policy saved locally.':'Cue follow policy changed for this session only.',
   saved.saved?'Política de seguimiento guardada localmente.':'Política de seguimiento cambiada solo para esta sesión.');
 });
 $('setupResetRehearsal').addEventListener('click',()=>resetPreferences('rehearsal'));
 $('setupCueDensity').addEventListener('change',event=>setDensity(event.target.value));
 $('setupResetInterface').addEventListener('click',()=>setDensity('standard'));
 $('setupExportShow').addEventListener('click',()=>$('saveBundleBtn').click());
 $('setupRefreshDiagnostics').addEventListener('click',()=>void refreshDiagnostics());
 const savedDensity=readDensity();
 document.querySelector('.shell').dataset.cueDensity=
  ['compact','standard','comfortable'].includes(savedDensity)?savedDensity:'standard';
 $('setupCueDensity').value=document.querySelector('.shell').dataset.cueDensity;
 setPage(activePage);
 setOutputLabel();
 updateShowData();
 void updateAudioControls();
 document.addEventListener('runq:audio-state-change',()=>void updateAudioControls());
 document.addEventListener('runq:show-state-changed',updateShowData);
 document.addEventListener('runq:operator-preferences-changed',event=>{
  if(event.detail?.preferences){
   preferences=event.detail.preferences;
   $('setupMasterVolume').value=String(Math.round(preferences.masterVolume*100));
   $('setupMasterVolumeValue').value=Math.round(preferences.masterVolume*100)+'%';
   if(!microphoneStream)$('rqLiveDevice').value=preferences.microphoneDeviceId;
   if(!microphoneStream){$('rqLiveLang').value=preferences.voiceLanguage;$('rqLiveMode').value=preferences.voiceMode;}
   setOutputLabel();
  }
 });
 document.addEventListener('runq:workspace-changed',event=>{
  if(event.detail?.workspace!=='setup')stopMicrophoneTest();
  else updateShowData();
 });
 $('uiLocaleSelect')?.addEventListener('change',()=>{
  renderDiagnostics();setOutputLabel();
 });
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden)stopMicrophoneTest();
 });
 window.addEventListener('pagehide',stopMicrophoneTest);
 const nav=shell();
 if(nav)new MutationObserver(()=>{
  if(nav.dataset.activeWorkspace!=='setup')stopMicrophoneTest();
 }).observe(nav,{attributes:true,attributeFilter:['data-active-workspace']});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else mount();
