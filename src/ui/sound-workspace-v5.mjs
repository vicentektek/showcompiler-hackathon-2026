/**
 * RunQ Sound workspace V5 — presentation-only grouping.
 * Existing 'audio' and 'soundlab' routes own their original behavior.
 * No audio engine calls, no generation requests and no automatic cue actions.
 */
const $ = id => document.getElementById(id);
const spanish = () => $('uiLocaleSelect')?.value === 'es';
const copy = {
  en: {
    title:'Audio workspace',
    subtitle:'Import existing files or prepare a new sound. No sound is assigned to a cue automatically.',
    library:'Audio library',
    studio:'Create & review',
    navigation:'Audio workspace sections'
  },
  es: {
    title:'Espacio de sonido',
    subtitle:'Importa tus audios o prepara un sonido nuevo. Ningún sonido se asigna automáticamente a un cue.',
    library:'Biblioteca de audio',
    studio:'Crear y revisar',
    navigation:'Secciones del espacio de sonido'
  }
};
function mount(){
  const shell=document.querySelector('.shell');
  const main=shell?.querySelector('main');
  const layout=main?.querySelector('.layout');
  const nav=$('workspaceNav');
  const audioNav=nav?.querySelector('[data-workspace-nav="audio"]');
  const labNav=nav?.querySelector('[data-workspace-nav="soundlab"]');
  if(!shell||!layout||!audioNav||!labNav||$('rqSoundWorkspaceTabs'))return;

  const section=document.createElement('section');
  section.id='rqSoundWorkspaceTabs';
  section.className='rq-sound-workspace-switch';
  section.dataset.workspaces='audio soundlab';
  section.hidden=true;
  const introduction=document.createElement('div');
  introduction.className='rq-sound-switch-intro';
  const title=document.createElement('strong');
  const subtitle=document.createElement('p');
  introduction.append(title,subtitle);
  const navigation=document.createElement('nav');
  navigation.className='rq-sound-switch-actions';
  const buttons={};
  for(const [route,id] of [['audio','rqSoundLibraryBtn'],['soundlab','rqSoundGeneratorBtn']]){
    const button=document.createElement('button');
    button.id=id;
    button.type='button';
    button.className='rq-sound-switch-button';
    button.dataset.soundRoute=route;
    button.setAttribute('aria-pressed','false');
    button.addEventListener('click',()=>nav.querySelector('[data-workspace-nav="'+route+'"]')?.click());
    navigation.append(button);
    buttons[route]=button;
  }
  section.append(introduction,navigation);
  layout.before(section);
  // Hide the redundant main-menu Sound Lab entry only after both subroutes exist.
  nav.dataset.rqSoundReady='true';

  function sync(){
    const language=spanish()?'es':'en',words=copy[language];
    const current=shell.dataset.activeWorkspace;
    const inSound=current==='audio'||current==='soundlab';
    title.textContent=words.title;
    subtitle.textContent=words.subtitle;
    navigation.setAttribute('aria-label',words.navigation);
    buttons.audio.textContent=words.library;
    buttons.soundlab.textContent=words.studio;
    buttons.audio.setAttribute('aria-pressed',String(current==='audio'));
    buttons.soundlab.setAttribute('aria-pressed',String(current==='soundlab'));
    section.hidden=!inSound;
    // app.mjs marks the internal soundlab route as selected; map both to
    // the single visible primary Sound navigation entry.
    audioNav.setAttribute('aria-pressed',String(inSound));
    audioNav.classList.toggle('is-current',inSound);
  }
  new MutationObserver(sync).observe(shell,{attributes:true,attributeFilter:['data-active-workspace']});
  $('uiLocaleSelect')?.addEventListener('change',()=>queueMicrotask(sync));
  sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else mount();
