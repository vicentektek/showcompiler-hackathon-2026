/**
 * Voice V5: real existing voice tools, grouped by work task.
 * Rehearsal is a lean console; Voice owns setup, source triggers, simulator
 * and diagnostics. This module does NOT own playback or mic streams.
 */
import {rehearsalArmState} from '../core/rehearsalArmSession.mjs';
const $=id=>document.getElementById(id);
const es=()=>$('uiLocaleSelect')?.value==='es';
const tr=(en,spanish)=>es()?spanish:en;
const el=(tag,cls,text)=>{
 const e=document.createElement(tag);
 if(cls)e.className=cls;
 if(text!=null)e.textContent=text;
 return e;
};
let currentVoiceTab='configure';
const tabs={
 configure:['Configure','Configurar'],
 triggers:['Script triggers','Pies del guion'],
 simulator:['Simulation','Simulación'],
 diagnostics:['Diagnostics','Diagnóstico'],
};
function readShow(){
 let show=null;
 document.dispatchEvent(new CustomEvent('runq:voice-follow-read-project',{
  detail:{respond:value=>{show=value;}}
 }));
 return show;
}
function route(name){
 document.querySelector('[data-workspace-nav="'+name+'"]')?.click();
}
function selectVoiceTab(value){
 if(!tabs[value])return;
 currentVoiceTab=value;
 for(const tab of document.querySelectorAll('[data-rq-voice-tab]')){
  const active=tab.dataset.rqVoiceTab===value;
  tab.setAttribute('aria-selected',String(active));
  tab.tabIndex=active?0:-1;
 }
 for(const pane of document.querySelectorAll('[data-rq-voice-pane]'))
  pane.hidden=pane.dataset.rqVoicePane!==value;
 if(value!=='simulator'&&!$('rqvfPause')?.disabled)$('rqvfPause').click();
 if(value==='triggers')renderTriggers();
}
function renderTriggers(){
 const root=$('rqVoiceTriggersList');if(!root)return;
 root.replaceChildren();
 const show=readShow(),cues=show?.cues??[];
 const valid=cues.filter(c=>String(c.trigger||'').trim().length>=3);
 $('rqVoiceTriggerStats').textContent=tr(
  valid.length+' configured of '+cues.length+' cues',
  valid.length+' configurados de '+cues.length+' cues'
 );
 if(!cues.length){
  root.append(el('p','rq-voice-empty',tr(
   'No cues yet. Create them in Cue Editor; add a spoken trigger and source line.',
   'Todavía no hay cues. Créelos en el Editor y asigna un pie hablado y una línea.'
  )));
  return;
 }
 for(const cue of cues.slice(0,150)){
  const row=el('div','rq-voice-trigger-row');
  const left=el('div','rq-voice-trigger-info');
  left.append(el('strong','',String(cue.number??'—').padStart(2,'0')+' · '+cue.label));
  const source=(cue.sourceLineIds??[]).find(v=>/^L[1-9]\d*$/.test(v))??null;
  left.append(el('small','',source?source+' · '+(cue.trigger||tr('Trigger missing','Sin pie hablado')):
   tr('No source line · Configure in Cue Editor','Sin línea de guion · Configurar en Editor')));
  const button=el('button','btn subtle small',tr('Edit trigger','Editar pie'));
  button.type='button';
  button.addEventListener('click',()=>document.dispatchEvent(
   new CustomEvent('runq:voice-open-cue',{detail:{cueId:cue.id}})));
  row.append(left,button);root.append(row);
 }
 if(cues.length>150)root.append(el('p','rq-voice-empty',tr(
  'Showing first 150 cues. Use Cue Editor search for the rest.',
  'Se muestran los primeros 150 cues. Utiliza la búsqueda del Editor para el resto.'
 )));
}
function buildVoiceWorkspace(){
 const root=$('rqvfPanel');if(!root||root.dataset.rqV5Built)return;
 root.dataset.rqV5Built='true';
 const live=$('rqLivePanel'),mic=$('rqMicPanel');
 const replayNodes=[...root.children].filter(n=>n!==live&&n!==mic);
 const mast=el('div','rq-voice-mast');
 const title=el('div','rq-voice-headline');
 title.append(el('span','rq-voice-eyebrow','RUNQ / VOICE ENGINE'),
  el('h2','',tr('Voice & Follow','Voz y seguimiento')),
  el('p','',tr('Configure and test recognition here; rehearse from the Rehearsal desk.',
   'Configura y prueba aquí el reconocimiento; ensaya desde la consola de Ensayo.')));
 mast.append(title);
 const goRehearsal=el('button','btn accent',tr('Open rehearsal','Abrir ensayo'));
 goRehearsal.type='button';goRehearsal.id='rqVoiceOpenRehearsal';
 goRehearsal.addEventListener('click',()=>route('rehearsal'));mast.append(goRehearsal);
 const bar=el('div','rq-voice-tabs');
 bar.setAttribute('role','tablist');bar.setAttribute('aria-label','Voice tools');
 const panes=el('div','rq-voice-panes');
 const paneElements={};
 for(const [id,names] of Object.entries(tabs)){
  const b=el('button','rq-voice-tab',tr(...names));
  b.type='button';b.dataset.rqVoiceTab=id;b.dataset.rqLabel=id;
  b.setAttribute('role','tab');b.setAttribute('aria-controls','rqVoicePane_'+id);
  b.addEventListener('click',()=>selectVoiceTab(id));bar.append(b);
  const panel=el('section','rq-voice-pane');
  panel.id='rqVoicePane_'+id;panel.dataset.rqVoicePane=id;
  panel.setAttribute('role','tabpanel');
  panes.append(panel);paneElements[id]=panel;
 }
 root.replaceChildren(mast,bar,panes);
 // Move original nodes, preserving their exact IDs, event listeners,
 // provider consent and backend ownership.
 if(live)paneElements.configure.append(live);
 if(mic)paneElements.diagnostics.append(mic);
 const configHint=el('p','rq-voice-note',tr(
  'Choose microphone, spoken language and optional context. Start only after consent. Automatic GO can only be armed in Rehearsal.',
  'Selecciona micrófono, idioma y contexto opcional. Inicia con autorización. GO automático solo se arma desde Ensayo.'
 ));
 paneElements.configure.prepend(configHint);
 const triggerIntro=el('div','rq-voice-trigger-head');
 triggerIntro.append(el('h3','',tr('Spoken cue triggers','Pies hablados de cues')));
 const stats=el('span','rq-voice-trigger-stats');stats.id='rqVoiceTriggerStats';
 triggerIntro.append(stats);paneElements.triggers.append(triggerIntro);
 paneElements.triggers.append(el('p','rq-voice-note',tr(
  'Each phrase is attached to a cue and a script line. Similar repeated phrases may be ambiguous. Edit the real cue in its Inspector.',
  'Cada frase se vincula a un cue y a una línea. Los pies parecidos pueden ser ambiguos. Edita el cue real en el inspector.'
 )));
 const list=el('div','rq-voice-trigger-list');list.id='rqVoiceTriggersList';
 paneElements.triggers.append(list);
 const replayNotice=el('p','rq-voice-note',tr(
  'Simulation only. Transcripts below are synthetic, not proof of microphone accuracy, and can never prepare or execute GO.',
  'Solo simulación. Las transcripciones son sintéticas, no miden la precisión del micrófono y nunca pueden preparar ni ejecutar GO.'
 ));
 paneElements.simulator.append(replayNotice,...replayNodes);
 paneElements.diagnostics.prepend(el('p','rq-voice-note',tr(
  'Record up to 10 seconds locally, listen, and explicitly authorize any remote transcription. Never starts show audio.',
  'Graba hasta 10 segundos localmente, escucha y autoriza expresamente cada transcripción remota. Nunca reproduce cues.'
 )));
 // The real auto-arm control is retained as a DOM target for the controller.
 // Only the compact Rehearsal UI exposes a user-facing arming action.
 if($('rqLiveArm'))$('rqLiveArm').classList.add('rq-voice-internal-arm');
 document.getElementById('rqvfSub').textContent=tr(
  'SIMULATED TRANSCRIPT REPLAY · NO GO','REPRODUCCIÓN SIMULADA · SIN GO');
 selectVoiceTab(currentVoiceTab);
}
function syncRehearsal(){
 if(!$('rqRehearsalDeck'))return;
 const mic=!!(document.body.dataset.runqVoiceCapture==='live');
 const gate=rehearsalArmState();
 const auto=gate.armed;
 const mode=$('rqRehMode')?.value??'manual';
 const liveMode=$('rqLiveMode')?.value??'assist';
 const status=$('rqLiveStatus')?.textContent?.trim()??'';
 $('rqRehMicState').textContent=mic?tr('MIC LIVE','MICRÓFONO ACTIVO'):tr('MIC OFF','MICRÓFONO APAGADO');
 $('rqRehAutoState').textContent=auto?tr('AUTO ARMED','AUTO ARMADO'):
  mode==='assist'?tr('ASSISTED','ASISTIDO'):tr('MANUAL','MANUAL');
 $('rqRehearsalDeck').dataset.armed=String(auto);
 $('rqRehearsalDeck').dataset.listening=String(mic);
 $('rqRehearsalDeck').dataset.mode=mode;
 $('rqRehStart').disabled=mode==='manual'||mic||!$('rqLiveStart')||$('rqLiveStart').disabled;
 $('rqRehStop').disabled=!mic||$('rqLiveStop').disabled;
 $('rqRehArm').disabled=mode!=='auto'||!mic||auto||$('rqLiveArm')?.disabled;
 $('rqRehArm').setAttribute('aria-pressed',String(auto));
 $('rqRehDisarm').disabled=!auto;
 $('rqRehPrepare').disabled=mode!=='assist'||!mic||$('rqLivePrepare')?.disabled;
 $('rqRehDismiss').disabled=mode!=='assist'||!mic||$('rqLiveDismiss')?.disabled;
 const transcript=$('rqLiveTranscript')?.textContent?.trim();
 $('rqRehTranscript').textContent=transcript||'—';
 const cue=$('rqLiveCue')?.textContent?.trim();
 $('rqRehCandidate').textContent=cue||tr('No suggestion','Sin sugerencia');
 const copy=mode==='manual'?tr(
  'Manual show cues. No voice automation.','Cues bajo control manual. Sin automatización de voz.'
 ):mode==='assist'?tr(
  'Listening suggests cues. Only your explicit actions prepare and fire GO.',
  'La voz sugiere cues. Preparar y GO necesitan acciones manuales.'
 ):auto?tr(
  'Rehearsal only: verified spoken triggers may fire GO. DISARM or STOP ALL immediately.',
  'Solo ensayo: los pies reconocidos pueden disparar GO. DESARMAR o PARAR TODO.'
 ):tr(
  'Automatic mode selected but DISARMED. Start listening and arm deliberately.',
  'Modo automático seleccionado y DESARMADO. Inicia escucha y arma expresamente.'
 );
 $('rqRehDescription').textContent=copy+(status?' · '+status:'');
 if(mode!=='manual'&&mode!=='auto'&&liveMode==='auto'){
  // No automatic arming from display or language switches.
 }
}
function changeMode(){
 const mode=$('rqRehMode').value,liveMode=$('rqLiveMode');
 if(rehearsalArmState().armed&&mode!=='auto')
  document.dispatchEvent(new CustomEvent('runq:rehearsal-auto-disarm',
   {detail:{reason:'mode_changed'}}));
 if(liveMode){
  const value=mode==='auto'?'auto':'assist';
  if(liveMode.value!==value){
   liveMode.value=value;
   liveMode.dispatchEvent(new Event('change',{bubbles:true}));
  }
 }
 if(mode==='manual'&&document.body.dataset.runqVoiceCapture==='live')
  $('rqLiveStop')?.click();
 syncRehearsal();
}
function localized(){
 const root=$('rqRehearsalDeck');if(!root)return;
 $('rqRehTitle').textContent=tr('Rehearsal desk','Consola de ensayo');
 $('rqRehIntro').textContent=tr(
  'Script, cue queue and transport. Voice control is optional.',
  'Guion, secuencia y transporte. El control por voz es opcional.');
 $('rqRehModeLabel').textContent=tr('Control mode','Modo de control');
 const opts=$('rqRehMode').options;
 opts[0].textContent=tr('Manual','Manual');
 opts[1].textContent=tr('Voice assisted','Asistido por voz');
 opts[2].textContent=tr('Automatic rehearsal','Ensayo automático');
 $('rqRehStart').textContent=tr('Start listening','Iniciar escucha');
 $('rqRehStop').textContent=tr('Stop listening','Detener escucha');
 $('rqRehArm').textContent=tr('ARM AUTO GO','ARMAR GO AUTO');
 $('rqRehDisarm').textContent=tr('DISARM','DESARMAR');
 $('rqRehConfigure').textContent=tr('Configure voice','Configurar voz');
 $('rqRehPrepare').textContent=tr('Set suggested NEXT','Preparar NEXT sugerido');
 $('rqRehDismiss').textContent=tr('Ignore','Ignorar');
 $('rqRehTranscriptLabel').textContent=tr('LAST TRANSCRIPT','ÚLTIMA TRANSCRIPCIÓN');
 $('rqRehCueLabel').textContent=tr('VOICE CUE','CUE RECONOCIDO');
 $('rqRehConsentLabel').textContent=tr(
  'I authorize sending this microphone session to Meta Muse (max 3 min).',
  'Autorizo enviar esta sesión de micrófono a Meta Muse (máximo 3 min).');
 const title=$('rqvfPanel')?.querySelector('.rq-voice-headline');
 if(title){
  title.querySelector('h2').textContent=tr('Voice & Follow','Voz y seguimiento');
  title.querySelector('p').textContent=tr(
   'Configure and test recognition here; rehearse from the Rehearsal desk.',
   'Configura y prueba aquí el reconocimiento; ensaya desde la consola de Ensayo.');
 }
 for(const b of document.querySelectorAll('[data-rq-voice-tab]')){
  b.textContent=tr(...tabs[b.dataset.rqVoiceTab]);
 }
 if($('rqVoiceOpenRehearsal'))$('rqVoiceOpenRehearsal').textContent=tr('Open rehearsal','Abrir ensayo');
 syncRehearsal();
}
function mount(){
 if(!$('rqvfPanel')||!$('rqRehearsalDeck'))return;
 buildVoiceWorkspace();
 $('rqRehMode').addEventListener('change',changeMode);
 $('rqRehConfigure').addEventListener('click',()=>{route('voice');selectVoiceTab('configure');});
 $('rqRehStart').addEventListener('click',()=>{
  $('rqLiveConsent').checked=$('rqRehConsent').checked;
  $('rqLiveStart')?.click();
  syncRehearsal();
 });
 $('rqRehStop').addEventListener('click',()=>{$('rqLiveStop')?.click();syncRehearsal();});
 $('rqRehArm').addEventListener('click',()=>{$('rqLiveArm')?.click();syncRehearsal();});
 $('rqRehDisarm').addEventListener('click',()=>{
  document.dispatchEvent(new CustomEvent('runq:rehearsal-auto-disarm',{detail:{reason:'operator'}}));
  syncRehearsal();
 });
 $('rqRehPrepare').addEventListener('click',()=>{$('rqLivePrepare')?.click();syncRehearsal();});
 $('rqRehDismiss').addEventListener('click',()=>{$('rqLiveDismiss')?.click();syncRehearsal();});
 $('uiLocaleSelect')?.addEventListener('change',localized);
 const shell=document.querySelector('.shell');
 if(shell)new MutationObserver(()=>{
  if(shell.dataset.activeWorkspace==='voice')renderTriggers();
  // A listening session started in Voice continues into rehearsal as
  // ASSISTED, never invisibly under a label saying MANUAL.
  if(shell.dataset.activeWorkspace==='rehearsal'&&
     document.body.dataset.runqVoiceCapture==='live'&&
     $('rqRehMode').value==='manual'){
     $('rqRehMode').value='assist';
     changeMode();
  }
  syncRehearsal();
 }).observe(shell,{attributes:true,attributeFilter:['data-active-workspace']});
 for(const id of ['rqLiveStart','rqLiveStop','rqLiveArm','rqLivePrepare','rqLiveDismiss',
     'rqLiveStatus','rqLiveTranscript','rqLiveCue','rqLiveArmStatus']){
  const target=$(id);if(!target)continue;
  new MutationObserver(syncRehearsal).observe(target,{
    attributes:true,attributeFilter:['disabled','aria-pressed'],
    childList:true,characterData:true,subtree:true
  });
 }
 document.addEventListener('runq:voice-live-ready',syncRehearsal);
 document.addEventListener('runq:voice-live-stopping',()=>{
  $('rqRehConsent').checked=false;
  queueMicrotask(syncRehearsal);
 });
 document.addEventListener('runq:rehearsal-auto-state',syncRehearsal);
 const consent=$('rqRehConsent');
 consent?.addEventListener('change',()=>{$('rqLiveConsent').checked=consent.checked;});
 localized();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else mount();
