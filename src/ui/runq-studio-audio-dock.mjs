/**
 * RUNQ Studio: dock the ORIGINAL cue playback form, never copy its controls.
 * The form retains its waveform, its raw millisecond inputs, its event
 * listeners and its connection to stagedPreviewCue()/Save in app.mjs.
 * This module changes only where the form is displayed while Studio is open.
 */
const STORAGE_KEY='runq.studio.audioDock.v1';
const byId=id=>document.getElementById(id);

function installStudioAudioDock(){
 const shell=document.querySelector('.shell');
 const desk=document.querySelector('.rq5-show-workspace .rq5-desk');
 const stageBody=desk?.querySelector('.rq5-stage-body');
 const inspector=byId('cueInspector');
 if(!shell||!desk||!stageBody||!inspector||byId('rqStudioAudioDock'))return;

 const dock=document.createElement('section');
 dock.id='rqStudioAudioDock';
 dock.className='rq-studio-bottom-dock';
 dock.setAttribute('aria-label','Studio audio properties and waveform');
 const bar=document.createElement('header');
 bar.className='rq-studio-bottom-bar';
 const heading=document.createElement('strong');
 heading.className='rq-studio-bottom-heading';
 const inspectorHeader=desk.querySelector('.rq5-inspector-heading');
 const openButton=document.createElement('button');
 openButton.type='button';
 openButton.id='rqStudioAudioDockOpen';
 openButton.className='rq-studio-dock-open';
 openButton.textContent='▤';
 openButton.title='Open bottom audio editor';
 openButton.setAttribute('aria-label','Open waveform and audio editor below');
 inspectorHeader?.append(openButton);
 const toggle=document.createElement('button');
 toggle.type='button';
 toggle.id='rqStudioAudioDockToggle';
 toggle.className='rq-studio-bottom-toggle';
 toggle.setAttribute('aria-controls','rqStudioAudioDockContent');
 const content=document.createElement('div');
 content.className='rq-studio-bottom-content';
 content.id='rqStudioAudioDockContent';
 bar.append(heading,toggle);
 dock.append(bar,content);
 stageBody.after(dock);

 let enabled;
 try {
  const stored=localStorage.getItem(STORAGE_KEY);
  // On a large desktop the waveform deserves permanent visual space.
  enabled=stored==='true'||(stored===null&&innerWidth>=1600&&innerHeight>=850);
 }catch{enabled=innerWidth>=1600&&innerHeight>=850;}
 let anchor=null;
 let scheduled=false;

 const isStudio=()=>shell.dataset.activeWorkspace==='cues';
 const audioSelected=()=>inspector.querySelector('#cueInspectorTab-audio')?.getAttribute('aria-selected')==='true';
 const language=()=>byId('uiLocaleSelect')?.value==='es'?'es':'en';
 const say=(en,es)=>language()==='es'?es:en;

 // The original form is only moved while the audio inspector tab is active.
 // If Studio is left or another tab is selected, return it to its original
 // location before any subsequent render/selection transition.
 function restoreForm(){
  const form=content.querySelector('#cuePlaybackForm');
  if(!form){anchor=null;return;}
  if(anchor?.isConnected && anchor.parentNode)anchor.replaceWith(form);
  else if(isStudio()&&audioSelected()){
   inspector.querySelector('#cueInspectorPanel')?.prepend(form);
  } else form.remove();
  anchor=null;
 }
 function sync(){
  const eligible=isStudio()&&audioSelected();
  const candidate=inspector.querySelector('#cuePlaybackForm');
  const docked=content.querySelector('#cuePlaybackForm');
  // The inspector is fully regenerated on cue changes. Prefer its newest
  // form over any previously docked form to avoid stale cue IDs / handlers.
  if(candidate&&docked&&candidate!==docked){
   docked.remove();anchor=null;
  }
  const hasForm=!!candidate||!!content.querySelector('#cuePlaybackForm');
  // Keep the collapsed editor completely out of the flex layout.
  // The compact open button lives on the existing inspector heading instead.
  dock.hidden=!eligible||!hasForm||!enabled;
  openButton.hidden=!eligible||!hasForm||enabled;
  openButton.setAttribute('aria-label',say('Open waveform and audio editor below','Abrir forma de onda y editor inferior'));
  openButton.title=openButton.getAttribute('aria-label');
  if(!eligible||!hasForm){
   desk.dataset.rqStudioAudioExpanded='false';
   restoreForm();content.hidden=true;return;
  }
  const title=inspector.querySelector('.inspector-title strong')?.textContent?.trim()||'';
  heading.textContent=say('AUDIO EDITOR · ','EDITOR DE AUDIO · ')+title;
  toggle.textContent=enabled?say('Return editor to inspector','Devolver editor al inspector'):
   say('Open waveform and audio editor below','Abrir forma de onda y editor inferior');
  toggle.setAttribute('aria-label',toggle.textContent);
  toggle.setAttribute('aria-expanded',String(enabled));
  content.hidden=!enabled;
  dock.dataset.expanded=String(enabled);
  desk.dataset.rqStudioAudioExpanded=String(enabled&&eligible);
  if(enabled){
   const live=inspector.querySelector('#cuePlaybackForm');
   if(live){
    anchor=document.createComment('RUNQ original playback form dock position');
    live.replaceWith(anchor);
    content.replaceChildren(live);
   }
  }else{
   restoreForm();
  }
 }
 function queueSync(){
  if(scheduled)return;
  scheduled=true;
  queueMicrotask(()=>{scheduled=false;sync();});
 }
 function setEnabled(next){
  if(!isStudio()||!audioSelected())return;
  enabled=Boolean(next);
  try{localStorage.setItem(STORAGE_KEY,String(enabled));}catch{}
  sync();
 }
 openButton.addEventListener('click',()=>setEnabled(true));
 toggle.addEventListener('click',()=>setEnabled(false));
 new MutationObserver(queueSync).observe(inspector,{childList:true,subtree:true});
 new MutationObserver(queueSync).observe(shell,{attributes:true,attributeFilter:['data-active-workspace']});
 byId('uiLocaleSelect')?.addEventListener('change',queueSync);
 sync();
}
if(document.readyState==='loading')
 document.addEventListener('DOMContentLoaded',installStudioAudioDock,{once:true});
else installStudioAudioDock();
