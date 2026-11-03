/**
 * RunQ V8 Studio / Stage visual composition.
 * This layer changes the visual hierarchy and dock arrangement only.
 * No playback, AI, audio, project persistence or cue ordering logic lives here.
 * The V7 functional navigation and all original control IDs are retained.
 */
const byId=id=>document.getElementById(id);
const lang=()=>byId('uiLocaleSelect')?.value==='es'?'es':'en';
const copy=(es,en)=>lang()==='es'?es:en;

function mountV8(){
  const shell=document.querySelector('.shell');
  const main=shell?.querySelector(':scope > main');
  const ribbon=byId('rq7Workbench');
  const nav=byId('workspaceNav');
  const layout=main?.querySelector('.layout');
  const voice=byId('rqvfPanel');
  if(!shell||!main||!ribbon||!nav||!layout||!voice||byId('rq8Identity'))return;
  document.documentElement.classList.add('rq8');

  // The left navigation is the one canonical tool menu. The V7 horizontal
  // tool buttons stay in the DOM for compatibility but are visually retired.
  const identity=document.createElement('div');
  identity.id='rq8Identity';
  identity.className='rq8-identity';
  const marker=document.createElement('span');
  marker.className='rq8-marker';marker.textContent='RQ';
  const label=document.createElement('span');
  label.className='rq8-identity-copy';
  const title=document.createElement('strong');
  const subtitle=document.createElement('small');
  label.append(title,subtitle);
  identity.append(marker,label);
  nav.prepend(identity);

  const ribbonTitle=document.createElement('div');
  ribbonTitle.className='rq8-ribbon-heading';
  const section=document.createElement('strong');
  const description=document.createElement('span');
  ribbonTitle.append(section,description);
  ribbon.append(ribbonTitle);

  // The rehearsal voice assistant is a dock, not the dominant workspace.
  // The actual script and real GO transport remain the main surface.
  layout.after(voice);
  voice.dataset.rq8Voice='compact';
  const head=voice.querySelector('.rqvf-primary-head');
  const toggle=document.createElement('button');
  toggle.type='button';
  toggle.id='rq8VoiceToggle';
  toggle.className='rq8-voice-toggle';
  toggle.setAttribute('aria-controls','rqLiveSettings');
  head?.append(toggle);
  toggle.addEventListener('click',()=>{
    voice.dataset.rq8Voice=voice.dataset.rq8Voice==='expanded'?'compact':'expanded';
    byId('rqLiveSettings').open=voice.dataset.rq8Voice==='expanded';
    sync();
  });
  byId('rqLiveSettings').addEventListener('toggle',()=>{
    voice.dataset.rq8Voice=byId('rqLiveSettings').open?'expanded':'compact';
    sync();
  });

  const routeNames={
    home:['Biblioteca de proyectos','Project library','Organiza y abre espectáculos','Organize and open shows'],
    script:['Guion','Script','Texto original y referencias','Original text and line references'],
    ai:['Propuestas IA','AI suggestions','Revisión antes de incorporar','Review before applying'],
    cues:['Editor de cues','Cue editor','Secuencia, sonido y propiedades','Sequence, audio and properties'],
    audio:['Sonido','Sound','Biblioteca, editor y generación integrados','Integrated library, editor and generator'],
    soundlab:['Laboratorio de sonido','Sound lab','Generación y edición','Generate and edit'],
    setup:['Comprobación','Preflight','Estado del espectáculo','Show readiness'],
    rehearsal:['Ensayo','Rehearsal','Guion y ejecución supervisada','Script and supervised playback'],
    operation:['Directo','Live operation','Control manual del espectáculo','Manual show control']
  };
  function sync(){
    const current=shell.dataset.activeWorkspace||'home';
    const data=routeNames[current]||routeNames.home;
    title.textContent='RunQ';
    subtitle.textContent=copy('ESTUDIO / ESCENA','STUDIO / STAGE');
    section.textContent=copy(data[0],data[1]);
    description.textContent=copy(data[2],data[3]);
    ribbon.dataset.rq8Mode=current==='operation'?'stage':current==='rehearsal'?'rehearsal':'studio';
    toggle.textContent=voice.dataset.rq8Voice==='expanded'
      ?copy('Contraer voz','Collapse voice')
      :copy('Configurar / ampliar voz','Voice setup / expand');
    toggle.setAttribute('aria-expanded',String(voice.dataset.rq8Voice==='expanded'));
  }
  new MutationObserver(sync).observe(shell,{attributes:true,attributeFilter:['data-active-workspace']});
  byId('uiLocaleSelect')?.addEventListener('change',sync);
  sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountV8,{once:true});
else mountV8();
