/**
 * RunQ V14 — Studio / Rehearsal / Live presentation.
 * A *single* original cue list (#cueList), operator queue and BrowserAudioEngine
 * remain owned by app.mjs. This module is strictly read-only except for
 * deliberate forwarding to existing, guarded command controls.
 * No new AI calls, GO handlers, audio sources, event timers or show writes.
 */
const $=id=>document.getElementById(id);
const shell=document.querySelector('.shell');
const es=()=>$('uiLocaleSelect')?.value==='es';
const tr=(spanish,english)=>es()?spanish:english;
const make=(tag,cls='',text='')=>{
 const e=document.createElement(tag);
 if(cls)e.className=cls;
 if(text)e.textContent=text;
 return e;
};
function getShow(){
 let state=null;
 document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:v=>{state=v;}}}));
 return state;
}
function getHistory(){
 let rows=[];
 document.dispatchEvent(new CustomEvent('runq:show-event-read',{detail:{respond:v=>{rows=v;}}}));
 return rows;
}
function emitAI(detail){
 document.dispatchEvent(new CustomEvent('runq:open-contextual-ia',{detail}));
}
function install(){
 const panel=document.querySelector('.rq5-show-workspace');
 const workbench=$('rq7Workbench');
 const stageBody=panel?.querySelector('.cue-workspace-body');
 const editorList=$('cueList');
 if(!shell||!panel||!stageBody||!workbench||!editorList||$('rq14StageCurrent'))return;
 document.documentElement.classList.add('rq14');
 // Stage monitoring is a SECOND view of status, not a second cue stack.
 // The original cue list is reused in both surfaces.
 const monitor=make('aside','rq14-stage-monitor');
 monitor.id='rq14StageCurrent';monitor.setAttribute('aria-label','Live cue status');
 const monHeading=make('strong','rq14-monitor-heading');
 const showLabel=make('small','rq14-show-id');
 const nowTitle=make('strong','rq14-now-title');
 const nowSub=make('span','rq14-now-sub');
 const waveform=make('canvas','rq14-live-waveform');
 waveform.id='rq14LiveWaveform';waveform.width=960;waveform.height=110;
 waveform.hidden=true;
 waveform.setAttribute('role','img');
 waveform.setAttribute('aria-label','Original source waveform, not a live level meter');
 const progress=make('div','rq14-progress-track');
 progress.setAttribute('role','progressbar');progress.setAttribute('aria-valuemin','0');
 progress.setAttribute('aria-valuemax','100');progress.setAttribute('aria-label','Cue playback progress');
 const progressFill=make('div','rq14-progress-fill');
 progress.append(progressFill);
 const clock=make('div','rq14-time');
 const previous=make('div','rq14-next-info');
 const next=make('div','rq14-next-info');
 const rehearsal=make('section','rq14-rehearsal-context');
 const rehearsalHeading=make('strong','rq14-rehearsal-head');
 const rehearsalCue=make('p','rq14-rehearsal-cue');
 const rehearsalState=make('output','rq14-rehearsal-status');
 rehearsalState.setAttribute('role','status');
 rehearsal.append(rehearsalHeading,rehearsalCue,rehearsalState);
 monitor.append(monHeading,showLabel,nowTitle,nowSub,waveform,progress,clock,previous,next,rehearsal);
 // Preserve the ORIGINAL V7 read-only cue browser/inspector with its real
 // Set NEXT control and jump navigation. Place it in Stage's right-hand
 // status column instead of allowing its old grid frame to block cue rows.
 const originalLiveInspector=$('rq7LiveInspector');
 if(originalLiveInspector)monitor.append(originalLiveInspector);
 stageBody.append(monitor);
 const events=make('section','rq14-events');
 events.id='rq14Events';
 const eventHeader=make('div','rq14-events-head');
 const eventTitle=make('strong','');
 eventTitle.id='rq14EventsTitle';
 const count=make('span','rq14-events-count');
 count.id='rq14EventsCount';
 const eventList=make('ol','rq14-events-list');
 eventList.id='rq14EventsList';
 eventList.setAttribute('aria-label','Recent show events');
 eventHeader.append(eventTitle,count);
 events.append(eventHeader,eventList);
 panel.querySelector('.rq5-transport-dock')?.after(events);
 function setEventHistory(){
  const entries=getHistory().slice(0,12);
  count.textContent=String(entries.length);
  eventList.replaceChildren();
  if(!entries.length){
   eventList.append(make('li','rq14-empty',tr('Todavía no hay eventos de operación','No operation events yet')));
   return;
  }
  for(const item of entries){
   const row=make('li','rq14-event-row');
   const time=make('time','rq14-event-time',new Date(item.at).toLocaleTimeString(es()?'es-ES':'en-GB',{hour12:false}));
   time.dateTime=new Date(item.at).toISOString();
   const types={
    CUE_STARTED:['GO confirmado','GO confirmed'],CUE_FINISHED:['Cue finalizado','Cue finished'],
    CUE_STOPPED:['Cue detenido','Cue stopped'],CUE_FADE:['Fade de parada','Stop fade'],
    NEXT_PREPARED:['NEXT preparado','NEXT prepared'],NEXT_SKIPPED:['Cue omitido','Cue skipped'],
    QUEUE_RESET:['Cola reiniciada','Queue reset'],STOP_ALL:['STOP ALL','STOP ALL'],
    AUTO_ARMED:['Autopiloto armado','Autopilot armed'],AUTO_DISARMED:['Autopiloto desarmado','Autopilot disarmed'],
    GO_REJECTED:['GO rechazado','GO rejected'],AUDIO_ERROR:['Error de audio','Audio error'],
    SHOW_OPENED:['Proyecto abierto','Show opened'],SHOW_CREATED:['Nuevo show','New show'],
   };
   const label=types[item.type]??[item.type,item.type];
   const description=make('span','rq14-event-name',tr(...label)+(item.label?' · '+item.label:'')+
      (item.detail?' · '+item.detail:''));
   row.dataset.eventType=item.type;
   row.append(time,description);eventList.append(row);
  }
 }
 function mmss(value){
  if(!Number.isFinite(value))return '—:—';
  const seconds=Math.max(0,Math.floor(value));
  return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
 }
 function sync(){
  const state=getShow();if(!state)return;
  const mode=state.workspace;
  shell.dataset.rq14Surface=mode==='operation'?'stage':mode==='rehearsal'?'rehearsal':'studio';
  monHeading.textContent=mode==='rehearsal'?tr('ENSAYO · SEGUIMIENTO','REHEARSAL · FOLLOW'):tr('REPRODUCCIÓN ACTUAL','NOW PLAYING');
  showLabel.textContent=state.name;
  const active=state.active??[];
  const current=active[0];
  const running=state.cues.find(c=>c.id===current?.cueId);
  nowTitle.textContent=running?String(running.number).padStart(3,'0')+' · '+running.label:
    tr('Sin cues en reproducción','No cues playing');
  nowSub.textContent=active.length>1?
    tr(active.length+' cues sonando simultáneamente',active.length+' cues playing simultaneously'):
    current?.stopping?tr('FADE EN PROGRESO','FADING'):
    current?.durationSeconds===null&&current?tr('BUCLE ACTIVO','LOOP ACTIVE'):
    current?tr('REPRODUCIENDO','PLAYING'):tr('TRANSPORTE DETENIDO','TRANSPORT STOPPED');
  // Only draw genuine cached PCM peaks for a currently running audio cue.
  // This is not an output meter, device-routing readout or fake waveform.
  const peaks=state.activeWaveform?.peaks;
  const hasWave=!!current&&Array.isArray(peaks)&&peaks.length>0;
  waveform.hidden=!hasWave||mode!=='operation';
  if(hasWave&&mode==='operation'){
   const ctx=waveform.getContext('2d');
   if(ctx){
    const w=waveform.width,h=waveform.height,center=h/2;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle='#0d1e29';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#364f65';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(0,center);ctx.lineTo(w,center);ctx.stroke();
    ctx.strokeStyle='#55a8db';ctx.lineWidth=Math.max(1,w/peaks.length-1);
    ctx.beginPath();
    for(let n=0;n<peaks.length;n++){
     const x=n/(peaks.length-1)*w,amplitude=Math.max(0,Math.min(1,peaks[n]))*center*.87;
     ctx.moveTo(x,center-amplitude);ctx.lineTo(x,center+amplitude);
    }
    ctx.stroke();
    const durationMs=state.activeWaveform.durationMs;
    const position=Number.isFinite(durationMs)&&durationMs>0&&Number.isFinite(current.elapsedSeconds)
      ?((current.elapsedSeconds*1000)%durationMs)/durationMs:0;
    ctx.fillStyle='#e2b568';ctx.fillRect(position*w-1,0,2,h);
   }
  }
  const percent=current?.progress;
  progress.setAttribute('aria-valuetext',percent===null&&current?tr('Bucle sin duración','Indefinite loop'):
    Number.isFinite(percent)?Math.round(percent*100)+'%':tr('Sin reproducción','Not playing'));
  if(Number.isFinite(percent))progress.setAttribute('aria-valuenow',String(Math.round(percent*100)));
  else progress.removeAttribute('aria-valuenow');
  progressFill.style.width=Number.isFinite(percent)?Math.round(percent*100)+'%':current?'100%':'0%';
  clock.textContent=current?mmss(current.elapsedSeconds)+' / '+
    (Number.isFinite(current.durationSeconds)?mmss(current.durationSeconds):'∞')+
    (Number.isFinite(current.remainingSeconds)?' · '+tr('Restan ','Remaining ')+mmss(current.remainingSeconds):''):
    tr('Esperando GO','Awaiting GO');
  const nextCue=state.cues.find(c=>c.id===state.preparedCueId);
  const idx=state.cues.findIndex(c=>c.id===state.preparedCueId);
  const after=idx>=0?state.cues[idx+1]:null;
  next.textContent=tr('SIGUIENTE · ','NEXT · ')+(nextCue?String(nextCue.number).padStart(3,'0')+' · '+nextCue.label:tr('Sin cues','No next cue'));
  previous.textContent=tr('DESPUÉS · ','AFTER · ')+(after?String(after.number).padStart(3,'0')+' · '+after.label:'—');
  rehearsalHeading.textContent=tr('PIE DE ENSAYO','REHEARSAL TRIGGER');
  rehearsalCue.textContent=nextCue?.trigger||tr('No hay pie de voz para NEXT','No speech trigger for NEXT');
  const auto=$('rqLiveArm')?.getAttribute('aria-pressed')==='true';
  const activeVoice=$('rqLiveArmStatus')?.textContent?.trim()??'';
  rehearsalState.textContent=auto?tr('AUTOPILOTO ARMADO','AUTOPILOT ARMED')+' · '+activeVoice:
    tr('GO automático desarmado','Automatic GO disarmed');
  rehearsalState.dataset.autoArmed=String(auto);
  monitor.hidden=!['rehearsal','operation'].includes(mode);
  events.hidden=!['rehearsal','operation'].includes(mode);
 }
 document.addEventListener('runq:show-state-changed',sync);
 document.addEventListener('runq:show-event',()=>{setEventHistory();sync();});
 const arm=$('rqLiveArm');
 if(arm)new MutationObserver(sync).observe(arm,{attributes:true,attributeFilter:['aria-pressed']});
 // Engine clock is read-only; this interval does not run or schedule cues.
 window.setInterval(()=>{if(['operation','rehearsal'].includes(shell.dataset.activeWorkspace))sync();},500);
 // Source-contextual AI: clicking selects a line first; a separate toolbar
 // offers review/generation, NEVER automatic submission or payment.
 const scriptPreview=$('scriptPreview');
 const scriptPanel=scriptPreview?.closest('[data-workspaces~="script"]');
 const context=make('div','rq14-script-ai');
 context.id='rq14ScriptAI';context.hidden=true;
 const contextLine=make('span','rq14-script-ref');
 const propose=make('button','btn subtle small',tr('Proponer cues con IA','Suggest cues with AI'));
 const generate=make('button','btn subtle small',tr('Generar sonido…','Generate sound…'));
 propose.type=generate.type='button';
 context.append(contextLine,propose,generate);
 const anchor=scriptPanel?.querySelector('.rq5-script-workspace')??scriptPreview;
 anchor.before(context);
 let selectedLine=null;
 scriptPreview?.addEventListener('click',event=>{
  const row=event.target.closest('[data-script-line-id]');
  if(!row||!scriptPreview.contains(row))return;
  const id=row.dataset.scriptLineId;
  if(!/^L[1-9]\d*$/.test(id))return;
  selectedLine={id,text:row.textContent.replace(/^L\d+\s*/, '').trim().slice(0,600)};
  contextLine.textContent=id+' · '+selectedLine.text.slice(0,110);
  context.hidden=false;
 });
 propose.addEventListener('click',()=>{
  if(selectedLine)emitAI({mode:'review',lineId:selectedLine.id});
 });
 generate.addEventListener('click',()=>{
  if(selectedLine)emitAI({mode:'sound',lineId:selectedLine.id,prompt:selectedLine.text});
 });
 const search=$('rq10LibrarySearch');
 const searchCount=$('rq10LibrarySearchCount');
 const searchAction=make('button','btn subtle small rq14-library-ai',tr('Generar con IA','Generate with AI'));
 searchAction.id='rq14MissingAudioAI';searchAction.type='button';searchAction.hidden=true;
 search?.parentElement?.after(searchAction);
 function showSearchAction(){
  const value=search?.value.trim()??'';
  searchAction.hidden=!value||searchCount?.textContent?.trim()?.split('/')[0]?.trim()!=='0';
 }
 search?.addEventListener('input',()=>queueMicrotask(showSearchAction));
 if(searchCount)new MutationObserver(showSearchAction).observe(searchCount,{childList:true,characterData:true});
 searchAction.addEventListener('click',()=>emitAI({mode:'sound',prompt:search.value.trim()}));
 // Localized mode controls; never changes transport behavior.
 function localize(){
  eventTitle.textContent=tr('EVENTOS RECIENTES','RECENT EVENTS');
  propose.textContent=tr('Proponer cues con IA','Suggest cues with AI');
  generate.textContent=tr('Generar sonido…','Generate sound…');
  searchAction.textContent=tr('Generar con IA','Generate with AI');
  sync();setEventHistory();
 }
 $('uiLocaleSelect')?.addEventListener('change',()=>queueMicrotask(localize));
 localize();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
