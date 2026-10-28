/**
 * Voice Follow rehearsal simulator. Progressive UI; no microphone,
 * provider, queue, player, storage or automatic GO access.
 */
import { replayVoiceRehearsal } from '../core/voiceRehearsal.mjs';
import { parseScript } from '../core/script.mjs';
import { makeProjectVoiceScenario } from '../core/voiceScenario.mjs';

const $ = id => document.getElementById(id);
const lang = () => $('uiLocaleSelect')?.value === 'es' ? 'es' : 'en';
const copy = {
  en: {
    title:'VOICE FOLLOW',sub:'OFFLINE REHEARSAL SIMULATOR · NO MICROPHONE · NO GO',
    source:'Scenario',fixture:'Example scene',project:'Current show (configured triggers)',
    start:'Play',pause:'Pause',step:'Next event',reset:'Restart',loading:'Loading...',
    input:'TRANSCRIPT',result:'MATCH RESULT',history:'EVENT LOG',
    idle:'Ready. Select Play or Next event.',done:'Replay complete.',
    noProject:'No playable spoken triggers in the current show. Add a spoken trigger and L# reference to cues in Cue Editor.',
    noScript:'The current project has no script.',demo:'Independent example (not your current show)',
    show:'Simulation from current project metadata (not microphone recognition)',
    none:'No events processed',running:'Playing',paused:'Paused',finished:'Finished',
    suggest:'Cue suggested for preparation · no queue change',miss:'No reliable cue match',ambiguous:'Ambiguous · operator decision required',
    focus:'Simulated operator focus change',unfinished:'Unstable transcript ignored',
    score:'Text similarity',line:'Script position',unknown:'No associated line',noCue:'No cue suggested',
    projectChanged:'Project snapshot changed. Restart this rehearsal.',
    readOnly:'SIMULATION ONLY',error:'Replay failed safely; no cue has been executed.'
  },
  es: {
    title:'VOICE FOLLOW',sub:'SIMULADOR DE ENSAYO LOCAL · SIN MICRÓFONO · SIN GO',
    source:'Escenario',fixture:'Escena de ejemplo',project:'Espectáculo actual (pies configurados)',
    start:'Reproducir',pause:'Pausar',step:'Siguiente evento',reset:'Reiniciar',loading:'Cargando...',
    input:'TRANSCRIPCIÓN',result:'COINCIDENCIA',history:'REGISTRO DE EVENTOS',
    idle:'Preparado. Pulsa Reproducir o Siguiente evento.',done:'Ensayo simulado completado.',
    noProject:'No hay pies hablados configurados. Añade un pie de voz y una referencia L# a los cues desde el editor.',
    noScript:'El proyecto actual no contiene guion.',demo:'Ejemplo independiente (no modifica tu espectáculo)',
    show:'Simulación desde los pies configurados (no reconocimiento de micrófono)',
    none:'Todavía no hay eventos',running:'Reproduciendo',paused:'Pausado',finished:'Finalizado',
    suggest:'Cue sugerido · la cola no ha cambiado',miss:'Sin coincidencia suficientemente fiable',ambiguous:'Coincidencia ambigua · requiere intervención',
    focus:'Cambio de posición simulado por operador',unfinished:'Transcripción provisional ignorada',
    score:'Similitud de texto',line:'Posición en guion',unknown:'Sin línea asociada',noCue:'Ningún cue sugerido',
    projectChanged:'El espectáculo ha cambiado. Reinicia el ensayo.',
    readOnly:'SOLO SIMULACIÓN',error:'La simulación se ha detenido de forma segura; no se ha ejecutado ningún cue.'
  }
};
let fixture=null;
let session=null;
let stepIndex=0;
let playing=false;
let loading=false;
let unavailable=false;
let timer=null;
let lastLog=[];
let snapshotKey='';
const t = key => copy[lang()][key] || key;
const cleanTimer = () => { if(timer!==null){ clearTimeout(timer); timer=null; } };
const text = (id,value) => { const element=$(id); if(element)element.textContent=String(value); };
const formatTime = ms => {
  const seconds=Math.max(0,Math.floor(ms/1000));
  return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
};
function getProject(){
  let value=null;
  document.dispatchEvent(new CustomEvent('runq:voice-follow-read-project',{
    detail:{respond:project=>{value=project;}}
  }));
  return value;
}
function projectKey(project){
  return JSON.stringify({scriptText:project?.scriptText??'',cues:project?.cues??[]});
}
function stop(){
  cleanTimer(); playing=false;
}
function reset({keepSource=true}={}){
  stop();stepIndex=0;lastLog=[];snapshotKey='';unavailable=false;
  if(!keepSource)$('rqvfSource').value='fixture';
  session=null;render();
}
async function loadFixture(){
  if(fixture)return fixture;
  const response=await fetch('/test/fixtures/voice-rehearsal.json',{cache:'no-store'});
  if(!response.ok)throw new Error('Voice fixture unavailable');
  const data=await response.json();
  if(!Array.isArray(data.events)||!Array.isArray(data.cues))throw new Error('Voice fixture invalid');
  fixture={...data,scriptText:''};return fixture;
}
async function loadScenario(){
  if(loading)return false;
  loading=true;stop();stepIndex=0;lastLog=[];session=null;
  render();
  try{
    if($('rqvfSource').value==='fixture'){
      session=await loadFixture();snapshotKey='';
    }else{
      const project=getProject();
      session=makeProjectVoiceScenario(project);
      snapshotKey=projectKey(project);
    }
    unavailable=!session;
    return Boolean(session);
  }finally{loading=false;render();}
}
function replayCurrent(){
  if(!session)return null;
  return replayVoiceRehearsal({...session,events:session.events.slice(0,stepIndex)});
}
function processNext(){
  if(!session||stepIndex>=session.events.length){stop();render();return;}
  if($('rqvfSource').value==='project'&&projectKey(getProject())!==snapshotKey){
    stop();text('rqvfMessage',t('projectChanged'));return;
  }
  stepIndex+=1;
  const state=replayCurrent();
  lastLog=state.log;
  const event=session.events[stepIndex-1];
  if($('rqvfSource').value==='project'&&event.type==='TRANSCRIPT'){
    const found=lastLog.at(-1);
    if(found?.lineId&&/^L[1-9]\d*$/.test(found.lineId)){
      document.dispatchEvent(new CustomEvent('runq:voice-follow-highlight-line',{detail:{lineId:found.lineId}}));
    }
  }
  if(stepIndex>=session.events.length)stop();
  render();
}
function planNext(){
  if(!playing||!session)return;
  if(stepIndex>=session.events.length){stop();render();return;}
  const lastAt=stepIndex===0?0:session.events[stepIndex-1].atMs;
  const wait=Math.max(0,session.events[stepIndex].atMs-lastAt);
  timer=setTimeout(()=>{timer=null;processNext();planNext();},wait);
}
async function play(){
  if(playing||loading)return;
  try{
    if(!session||stepIndex>=session.events.length){
      if(!await loadScenario())return;
    }
    playing=true;render();planNext();
  }catch(error){stop();text('rqvfMessage',t('error'));}
}
async function next(){
  if(loading)return;
  stop();
  try{
    if(!session||stepIndex>=session.events.length){
      if(!await loadScenario())return;
    }
    processNext();
  }catch(error){text('rqvfMessage',t('error'));}
}
function describe(entry){
  if(!entry)return t('none');
  if(entry.type==='SUGGEST_PREPARE')return t('suggest');
  if(entry.type==='AMBIGUOUS')return t('ambiguous');
  if(entry.type==='FOCUS_CHANGED')return t('focus');
  if(entry.reason==='UNSTABLE_TRANSCRIPT')return t('unfinished');
  return t('miss');
}
function render(){
  if(!$('rqvfPanel'))return;
  for(const id of ['title','sub','sourceLabel','inputHeading','resultHeading','logHeading','readonly']){
    text('rqvf'+id[0].toUpperCase()+id.slice(1),t(id==='readonly'?'readOnly':id==='sub'?'sub':id==='sourceLabel'?'source':id==='inputHeading'?'input':id==='resultHeading'?'result':id==='logHeading'?'history':'title'));
  }
  const source=$('rqvfSource');
  source.options[0].textContent=t('fixture');source.options[1].textContent=t('project');
  text('rqvfPlay',loading?t('loading'):playing?t('running'):t('start'));
  text('rqvfPause',t('pause'));text('rqvfStep',t('step'));text('rqvfReset',t('reset'));
  $('rqvfPlay').disabled=playing||loading;
  $('rqvfPause').disabled=!playing;
  $('rqvfStep').disabled=loading;
  $('rqvfReset').disabled=loading;
  $('rqvfSource').disabled=loading;
  const event=session?.events[stepIndex-1];
  const entry=lastLog.at(-1);
  const currentCue=session?.cues.find(c=>c.id===entry?.cueId);
  text('rqvfClock',formatTime(event?.atMs??0));
  text('rqvfCounter',String(stepIndex)+' / '+String(session?.events.length??0));
  text('rqvfTranscript',event?.type==='TRANSCRIPT'?event.text:(event?.type==='SET_FOCUS'?t('focus'):t('none')));
  text('rqvfLine',entry?.lineId||t('unknown'));
  text('rqvfResult',entry?describe(entry):t('noCue'));
  text('rqvfCue',currentCue?String(currentCue.number??currentCue.id)+' · '+(currentCue.label??currentCue.trigger??currentCue.id):t('noCue'));
  text('rqvfScore',entry?.score!=null?t('score')+': '+Math.round(entry.score*100)+'%':t('score')+': —');
  const message=!session&&source.value==='project'&&unavailable?t('noProject'):
    !session?t('idle'):stepIndex>=session.events.length?t('done'):
    playing?t('running'):stepIndex?t('paused'):t('idle');
  text('rqvfMessage',message);
  text('rqvfOrigin',source.value==='fixture'?t('demo'):t('show'));
  const history=$('rqvfLog');history.replaceChildren();
  lastLog.slice(-5).forEach((item,i)=>{
    const li=document.createElement('li');
    const time=document.createElement('time');
    time.textContent=formatTime(item.atMs);
    const details=document.createElement('span');
    details.textContent=(item.lineId??'—')+' · '+describe(item);
    li.append(time,details);history.append(li);
  });
  if(!lastLog.length){const li=document.createElement('li');li.textContent=t('none');history.append(li);}
  const snippet=$('rqvfSnippet');snippet.replaceChildren();
  if(source.value==='fixture'){
    const examples=[['L142','GUARDIA: Nadie ha entrado en el castillo.'],['L144','REY: Pero alguien ha abierto esa puerta.'],['L149','REY: Escuchad el ruido de la tormenta.']];
    examples.forEach(([line,value])=>{
      const item=document.createElement('div');
      if(entry?.lineId===line)item.className='rqvf-current';
      item.textContent=line+' · '+value;snippet.append(item);
    });
  }else if(session?.scriptText){
    const lines=parseScript(session.scriptText);
    const current=entry?.lineId??'L'+session.initialFocusLine;
    const focus=Math.max(0,Number(current.slice(1))-1);
    lines.slice(Math.max(0,focus-1),Math.min(lines.length,focus+2)).forEach(row=>{
      const item=document.createElement('div');item.textContent=row.id+' · '+row.text;
      if(row.id===current)item.className='rqvf-current';snippet.append(item);
    });
  }else{
    const el=document.createElement('div');el.textContent=t('noScript');snippet.append(el);
  }
}
function mount(){
  if(!$('rqvfPanel'))return;
  $('rqvfPlay').addEventListener('click',()=>void play());
  $('rqvfPause').addEventListener('click',()=>{stop();render();});
  $('rqvfStep').addEventListener('click',()=>void next());
  $('rqvfReset').addEventListener('click',()=>reset());
  $('rqvfSource').addEventListener('change',()=>reset());
  $('uiLocaleSelect')?.addEventListener('change',()=>render());
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();render();}});
  const shell=document.querySelector('.shell');
  if(shell)new MutationObserver(()=>{
    if(shell.dataset.activeWorkspace!=='rehearsal'&&playing){stop();render();}
  }).observe(shell,{attributes:true,attributeFilter:['data-active-workspace']});
  render();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else mount();
