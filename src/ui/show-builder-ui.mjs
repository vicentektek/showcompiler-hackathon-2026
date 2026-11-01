import {
  assessShowBuilder,
  chooseShowBuilderSoundPlan,
  confirmShowBuilderConfiguration,
  loadShowBuilderSession,
  saveShowBuilderSession,
  SHOW_BUILDER_STAGES,
  skipShowBuilderStage,
  showBuilderProjectKey,
  updateShowBuilderStage,
} from '../core/showBuilder.mjs';
import { parseScript } from '../core/script.mjs';
import { isOperatorSoundPlaceholder } from '../core/manualCues.mjs';

const STAGE_COPY = Object.freeze({
  en: {
    project: ['Project', 'Start with the original script. RUNQ keeps its text and L# references intact.', 'Open script tools', 'Import script', 'Import a script, or continue with a blank show.'],
    cues: ['Cues', 'Ask RUNQ AI for a first draft, or create cues from selected lines. Review every proposal before it joins the show.', 'Open Cue Editor', 'Focus analysis tools', 'No script is loaded. Add cues manually or import a script first.'],
    audio: ['Sound', 'Choose whether to add sound now. Skipping keeps the show in draft; it does not make silent cues playable.', 'Open sound tools', 'Confirm sound plan', 'Choose to add sounds or leave sound design for later.'],
    configuration: ['Configuration', 'Review the settings actually stored for this show. Unsupported playback options remain inactive.', 'Open Cue Editor', 'Confirm review', 'This confirmation records your review only; it does not enable unsupported engine features.'],
    verification: ['Verification', 'Check local files and unresolved cue issues before rehearsal.', 'Open Preflight', 'Open verification', 'Preflight is advisory; it does not test speakers, venue routing, or live-show reliability.'],
    progress: ['{done} of {total} steps ready', '{done} of {total} steps ready'],
    skipped: ['Skipped for now · still incomplete', 'Skipped for now · still incomplete'],
    complete: ['Verified from the current show', 'Verified from the current show'],
    pending: ['Needs work or review', 'Needs work or review'],
    notRequired: ['Not required without a script · create cues manually if useful', 'Not required without a script · create cues manually if useful'],
    storageWarning: ['Progress can’t be saved in this browser; it will last only in this tab.', 'Progress can’t be saved in this browser; it will last only in this tab.'],
    projectSummary: ['{lines} script lines · {cues} cues · {assets} local audio references', '{lines} script lines · {cues} cues · {assets} local audio references'],
    cueSummary: ['{cues} cues · {pending} proposals awaiting human review', '{cues} cues · {pending} proposals awaiting human review'],
    audioSummary: ['{linked} cue-linked audio items · {ready} loaded audio files', '{linked} cue-linked audio items · {ready} loaded audio files'],
    configurationSummary: ['Review cue properties in Studio, then confirm the review here.', 'Review cue properties in Studio, then confirm the review here.'],
    verificationSummary: ['{ready} of {total} cues locally playable · {blockers} blockers · {warnings} warnings', '{ready} of {total} cues locally playable · {blockers} blockers · {warnings} warnings'],
    noScriptCues: ['No script is present; continue without analysis or add cues manually.', 'No script is present; continue without analysis or add cues manually.'],
    openTools: ['Open step tools', 'Open step tools'],
    askAi: ['Ask RUNQ AI', 'Ask RUNQ AI'],
    back: ['Back', 'Back'],
    continue: ['Continue', 'Continue'],
    finish: ['Review before rehearsal', 'Review before rehearsal'],
    skip: ['Skip for now', 'Skip for now'],
    reviewConfig: ['I reviewed the available cue settings', 'I reviewed the available cue settings'],
    noCuesForConfig: ['Add at least one cue before confirming configuration.', 'Add at least one cue before confirming configuration.'],
    step: ['Step {current} of {total}', 'Step {current} of {total}'],
    sourceTitle: ['Work from the original script', 'Work from the original script'],
    sourceHelp: ['Import a TXT or select original lines. Source text and L# references stay unchanged.', 'Import a TXT or select original lines. Source text and L# references stay unchanged.'],
    proposeScriptCues: ['Suggest cues to review', 'Suggest cues to review'],
    proposeScriptCuesHelp: ['RUNQ will suggest cues from the full script. Review every suggestion before adding it to the show.', 'RUNQ will suggest cues from the full script. Review every suggestion before adding it to the show.'],
    importScript: ['Import script', 'Import script'],
    replaceScript: ['Replace script', 'Replace script'],
    sourceSearch: ['Filter original lines', 'Filter original lines'],
    sourceSearchHint: ['Search by original text or L#', 'Search by original text or L#'],
    selectedCount: ['{count} lines selected · maximum 20', '{count} lines selected · maximum 20'],
    noScriptLoaded: ['No script yet. Import the original TXT for stable L# references, or continue with audio and manual cues.', 'No script yet. Import the original TXT for stable L# references, or continue with audio and manual cues.'],
    noSearchMatches: ['No original lines match this filter.', 'No original lines match this filter.'],
    showMoreLines: ['Showing {shown} of {total} matching lines. Search to find other source lines.', 'Showing {shown} of {total} matching lines. Search to find other source lines.'],
    createSelected: ['Create cues from selected lines', 'Create cues from selected lines'],
    analyzeSelected: ['Prepare selected-line analysis', 'Prepare selected-line analysis'],
    detectScript: ['Open script cue detection', 'Open script cue detection'],
    cueTaskTitle: ['Review and shape cues', 'Review and shape cues'],
    cueTaskHelp: ['Review each suggestion and its source line before adding cues. Nothing is approved or played automatically.', 'Review each suggestion and its source line before adding cues. Nothing is approved or played automatically.'],
    proposalReview: ['Review proposals', 'Review proposals'],
    proposalHelp: ['Proposals remain pending until you approve or reject them. Decisions are applied to this show.', 'Proposals remain pending until you approve or reject them. Decisions are applied to this show.'],
    approveAllProposals: ['Approve all {count} pending proposals', 'Approve all {count} pending proposals'],
    selectLinesFirst: ['Select one or more original lines first.', 'Select one or more original lines first.'],
    audioTaskTitle: ['Choose sounds for your cues', 'Choose sounds for your cues'],
    audioTaskHelp: ['Work from a cue below to keep its destination and script lines when you open the sound desk. Preview uses the configured system output; it is not isolated PFL.', 'Work from a cue below to keep its destination and script lines when you open the sound desk. Preview uses the configured system output; it is not isolated PFL.'],
    soundCueListTitle: ['Cues de este espectáculo', 'Cues in this show'],
    soundCueNeedsAudio: ['Sin audio asignado', 'No audio assigned'],
    soundCueAudioUnloaded: ['Audio vinculado · archivo no cargado', 'Audio linked · file not loaded'],
    soundCueAudioReady: ['Audio local cargado', 'Local audio loaded'],
    soundCuePrepare: ['Buscar o crear sonido', 'Find or create sound'],
    soundCueReplace: ['Cambiar sonido', 'Change sound'],
    soundCueEmpty: ['Aún no hay cues. Crea uno desde una línea del guion o continúa sin audio.', 'There are no cues yet. Create one from a script line or continue without audio.'],
    configTaskTitle: ['Review the show settings', 'Review the show settings'],
    verificationTaskTitle: ['Check this show before rehearsal', 'Check this show before rehearsal'],
    openStudio: ['Open Studio', 'Open Studio'],
    generateCues: ['Suggest more cues', 'Suggest more cues'],
    generatingCuesHelp: ['Uses the selected provider after its confirmation. Suggestions are reviewed before they become draft cues.', 'Uses the selected provider after its confirmation. Suggestions are reviewed before they become draft cues.'],
    advancedAiTools: ['Optional advanced settings', 'Optional advanced settings'],
    audioIdea: ['Sound idea', 'Sound idea'],
    audioPlanTitle: ['How do you want to handle sound?', 'How do you want to handle sound?'],
    addSounds: ['I want to choose or create sounds', 'I want to choose or create sounds'],
    skipSounds: ['Continue without sounds for now', 'Continue without sounds for now'],
    openSoundWorkspace: ['Open sound library and creator', 'Open sound library and creator'],
    soundPlanCreate: ['You chose to add sounds. They are not generated or played automatically.', 'You chose to add sounds. They are not generated or played automatically.'],
    soundPlanSkip: ['Sound design deferred. The show remains a draft until cues have valid audio.', 'Sound design deferred. The show remains a draft until cues have valid audio.'],
    soundPlanUnset: ['Choose an option to keep building. You can change this decision later.', 'Choose an option to keep building. You can change this decision later.'],
    soundDeferred: ['Sounds deferred by your choice · playback readiness is still checked separately', 'Sounds deferred by your choice · playback readiness is still checked separately'],
    openPreflight: ['Open preflight details', 'Open preflight details'],
  },
  es: {
    project: ['Proyecto', 'Empieza con el guion original. RUNQ conserva su texto y las referencias L#.', 'Abrir herramientas de guion', 'Importar guion', 'Importa un guion o continúa con un espectáculo vacío.'],
    cues: ['Cues', 'Pide a RUNQ AI un primer borrador o crea cues desde líneas seleccionadas. Revisa cada propuesta antes de incorporarla.', 'Abrir Editor de cues', 'Ir a herramientas de análisis', 'No hay guion. Puedes añadir cues manualmente o importar uno primero.'],
    audio: ['Sonido', 'Elige si quieres añadir sonido ahora. Omitirlo deja el espectáculo como borrador; no hace reproducibles los cues mudos.', 'Abrir herramientas de sonido', 'Confirmar plan de sonido', 'Elige añadir sonido o dejar el diseño para después.'],
    configuration: ['Configuración', 'Revisa los ajustes realmente guardados. Las opciones no compatibles siguen inactivas.', 'Abrir Editor de cues', 'Confirmar revisión', 'Esta confirmación registra tu revisión; no activa funciones no compatibles del motor.'],
    verification: ['Verificación', 'Comprueba archivos locales y problemas pendientes antes del ensayo.', 'Abrir Comprobación', 'Abrir verificación', 'La comprobación es orientativa; no prueba altavoces, rutas del recinto ni fiabilidad en directo.'],
    progress: ['{done} de {total} pasos listos', '{done} de {total} pasos listos'],
    skipped: ['Omitida por ahora · sigue incompleta', 'Omitida por ahora · sigue incompleta'],
    complete: ['Verificada con el espectáculo actual', 'Verificada con el espectáculo actual'],
    pending: ['Pendiente de trabajo o revisión', 'Pendiente de trabajo o revisión'],
    notRequired: ['No hace falta sin guion · puedes crear cues manualmente', 'No hace falta sin guion · puedes crear cues manualmente'],
    storageWarning: ['Este navegador no permite guardar el progreso; solo durará en esta pestaña.', 'Este navegador no permite guardar el progreso; solo durará en esta pestaña.'],
    projectSummary: ['{lines} líneas · {cues} cues · {assets} referencias de audio locales', '{lines} líneas · {cues} cues · {assets} referencias de audio locales'],
    cueSummary: ['{cues} cues · {pending} propuestas pendientes de revisión humana', '{cues} cues · {pending} propuestas pendientes de revisión humana'],
    audioSummary: ['{linked} audios vinculados a cues · {ready} archivos cargados', '{linked} audios vinculados a cues · {ready} archivos cargados'],
    configurationSummary: ['Revisa las propiedades en Studio y confirma aquí la revisión.', 'Revisa las propiedades en Studio y confirma aquí la revisión.'],
    verificationSummary: ['{ready} de {total} cues reproducibles localmente · {blockers} bloqueos · {warnings} avisos', '{ready} de {total} cues reproducibles localmente · {blockers} bloqueos · {warnings} avisos'],
    noScriptCues: ['No hay guion; continúa sin análisis o añade cues manualmente.', 'No hay guion; continúa sin análisis o añade cues manualmente.'],
    openTools: ['Abrir herramientas del paso', 'Abrir herramientas del paso'],
    askAi: ['Preguntar a RUNQ AI', 'Preguntar a RUNQ AI'],
    back: ['Volver', 'Volver'],
    continue: ['Continuar', 'Continuar'],
    finish: ['Revisar antes del ensayo', 'Revisar antes del ensayo'],
    skip: ['Omitir por ahora', 'Omitir por ahora'],
    reviewConfig: ['He revisado los ajustes disponibles', 'He revisado los ajustes disponibles'],
    noCuesForConfig: ['Añade al menos un cue antes de confirmar la configuración.', 'Añade al menos un cue antes de confirmar la configuración.'],
    step: ['Etapa {current} de {total}', 'Etapa {current} de {total}'],
    sourceTitle: ['Trabaja desde el guion original', 'Trabaja desde el guion original'],
    sourceHelp: ['Importa un TXT o selecciona líneas originales. El texto y las referencias L# se conservan.', 'Importa un TXT o selecciona líneas originales. El texto y las referencias L# se conservan.'],
    proposeScriptCues: ['Proponer cues para revisar', 'Proponer cues para revisar'],
    proposeScriptCuesHelp: ['RUNQ propondrá cues a partir del guion completo. Revisa cada propuesta antes de añadirla al espectáculo.', 'RUNQ propondrá cues a partir del guion completo. Revisa cada propuesta antes de añadirla al espectáculo.'],
    importScript: ['Importar guion', 'Importar guion'],
    replaceScript: ['Sustituir guion', 'Sustituir guion'],
    sourceSearch: ['Filtrar líneas originales', 'Filtrar líneas originales'],
    sourceSearchHint: ['Busca texto original o L#', 'Busca texto original o L#'],
    selectedCount: ['{count} líneas seleccionadas · máximo 20', '{count} líneas seleccionadas · máximo 20'],
    noScriptLoaded: ['Aún no hay guion. Importa el TXT original para conservar sus referencias L#, o continúa con audio y cues manuales.', 'Aún no hay guion. Importa el TXT original para conservar sus referencias L#, o continúa con audio y cues manuales.'],
    noSearchMatches: ['Ninguna línea original coincide con este filtro.', 'Ninguna línea original coincide con este filtro.'],
    showMoreLines: ['Se muestran {shown} de {total} líneas coincidentes. Filtra para localizar otras referencias.', 'Se muestran {shown} de {total} líneas coincidentes. Filtra para localizar otras referencias.'],
    createSelected: ['Crear cues desde líneas seleccionadas', 'Crear cues desde líneas seleccionadas'],
    analyzeSelected: ['Preparar análisis de líneas seleccionadas', 'Preparar análisis de líneas seleccionadas'],
    detectScript: ['Abrir detección de cues del guion', 'Abrir detección de cues del guion'],
    cueTaskTitle: ['Revisa y prepara cues', 'Revisa y prepara cues'],
    cueTaskHelp: ['Revisa cada propuesta y su línea de origen antes de añadir cues. Nada se aprueba ni se reproduce automáticamente.', 'Revisa cada propuesta y su línea de origen antes de añadir cues. Nada se aprueba ni se reproduce automáticamente.'],
    proposalReview: ['Revisar propuestas', 'Revisar propuestas'],
    proposalHelp: ['Las propuestas siguen pendientes hasta que las apruebes o rechaces. Las decisiones se aplican a este espectáculo.', 'Las propuestas siguen pendientes hasta que las apruebes o rechaces. Las decisiones se aplican a este espectáculo.'],
    approveAllProposals: ['Aprobar las {count} propuestas pendientes', 'Aprobar las {count} propuestas pendientes'],
    selectLinesFirst: ['Selecciona primero una o varias líneas originales.', 'Selecciona primero una o varias líneas originales.'],
    audioTaskTitle: ['Elige sonidos para tus cues', 'Elige sonidos para tus cues'],
    audioTaskHelp: ['Elige un cue para conservar su destino y las líneas del guion al abrir Sonido. La preescucha usa la salida configurada; no es PFL aislada.', 'Elige un cue para conservar su destino y las líneas del guion al abrir Sonido. La preescucha usa la salida configurada; no es PFL aislada.'],
    soundCueListTitle: ['Cues de este espectáculo', 'Cues de este espectáculo'],
    soundCueNeedsAudio: ['Sin audio asignado', 'Sin audio asignado'],
    soundCueAudioUnloaded: ['Audio vinculado · archivo no cargado', 'Audio vinculado · archivo no cargado'],
    soundCueAudioReady: ['Audio local cargado', 'Audio local cargado'],
    soundCuePrepare: ['Buscar o crear sonido', 'Buscar o crear sonido'],
    soundCueReplace: ['Cambiar sonido', 'Cambiar sonido'],
    soundCueEmpty: ['Aún no hay cues. Crea uno desde una línea del guion o continúa sin audio.', 'Aún no hay cues. Crea uno desde una línea del guion o continúa sin audio.'],
    configTaskTitle: ['Revisa los ajustes del espectáculo', 'Revisa los ajustes del espectáculo'],
    verificationTaskTitle: ['Comprueba el espectáculo antes del ensayo', 'Comprueba el espectáculo antes del ensayo'],
    openStudio: ['Abrir Studio', 'Abrir Studio'],
    generateCues: ['Sugerir más cues', 'Sugerir más cues'],
    generatingCuesHelp: ['Usa el proveedor seleccionado después de la confirmación. Las sugerencias se revisan antes de convertirse en cues borrador.', 'Usa el proveedor seleccionado después de la confirmación. Las sugerencias se revisan antes de convertirse en cues borrador.'],
    advancedAiTools: ['Ajustes avanzados opcionales', 'Ajustes avanzados opcionales'],
    audioIdea: ['Idea de sonido', 'Idea de sonido'],
    audioPlanTitle: ['¿Qué quieres hacer con el sonido?', '¿Qué quieres hacer con el sonido?'],
    addSounds: ['Quiero elegir o crear sonidos', 'Quiero elegir o crear sonidos'],
    skipSounds: ['Continuar sin sonidos por ahora', 'Continuar sin sonidos por ahora'],
    openSoundWorkspace: ['Abrir biblioteca y creador de sonido', 'Abrir biblioteca y creador de sonido'],
    soundPlanCreate: ['Has elegido añadir sonidos. No se generan ni reproducen automáticamente.', 'Has elegido añadir sonidos. No se generan ni reproducen automáticamente.'],
    soundPlanSkip: ['Diseño de sonido aplazado. El espectáculo sigue como borrador hasta asignar audio válido a los cues.', 'Diseño de sonido aplazado. El espectáculo sigue como borrador hasta asignar audio válido a los cues.'],
    soundPlanUnset: ['Elige una opción para continuar. Puedes cambiarla más adelante.', 'Elige una opción para continuar. Puedes cambiarla más adelante.'],
    soundDeferred: ['Sonidos aplazados por decisión tuya · la comprobación de reproducción sigue siendo independiente', 'Sonidos aplazados por decisión tuya · la comprobación de reproducción sigue siendo independiente'],
    openPreflight: ['Abrir detalles de comprobación', 'Abrir detalles de comprobación'],
  },
});

const ROUTE_COPY = Object.freeze({
  en: {
    title: 'Start anywhere',
    help: 'Choose a way to work. Every path stays in this show.',
    routes: [
      ['script', 'From the script', 'Import it or select original lines'],
      ['cue', 'From a cue', 'Create, review or shape cue ideas'],
      ['audio', 'From audio', 'Find, import or create a sound'],
      ['assistant', 'Ask RUNQ AI', 'Describe a change and review it first'],
    ],
    contextTitle: 'Show context',
    contextHelp: 'Selection and navigation never change NEXT or start playback.',
    show: 'Show',
    selectedCue: 'Selected cue',
    selectedLines: 'Selected lines',
    cueWork: 'Cue work',
    source: 'Original script',
    audio: 'Audio links',
    noShow: 'Untitled show',
    noCue: 'No cue selected',
    selectedLineCount: '{count} selected',
    noSelectedLines: 'None selected',
    noScript: 'No script imported',
    cueCount: '{cues} cues · {pending} proposals to review',
    sourceCount: '{lines} original lines',
    audioCount: '{count} linked audio items',
    openAssistant: 'Ask RUNQ AI · optional',
  },
  es: {
    title: 'Empieza por donde quieras',
    help: 'Elige cómo trabajar. Todas las rutas conservan este espectáculo.',
    routes: [
      ['script', 'Desde el guion', 'Impórtalo o selecciona líneas originales'],
      ['cue', 'Desde un cue', 'Crea, revisa o edita propuestas'],
      ['audio', 'Desde un audio', 'Busca, importa o crea un sonido'],
      ['assistant', 'Preguntar a RUNQ AI', 'Describe un cambio y revísalo antes'],
    ],
    contextTitle: 'Contexto del espectáculo',
    contextHelp: 'La selección y la navegación no cambian NEXT ni inician audio.',
    show: 'Espectáculo',
    selectedCue: 'Cue seleccionado',
    selectedLines: 'Líneas seleccionadas',
    cueWork: 'Trabajo de cues',
    source: 'Guion original',
    audio: 'Vínculos de audio',
    noShow: 'Espectáculo sin título',
    noCue: 'Ningún cue seleccionado',
    selectedLineCount: '{count} seleccionadas',
    noSelectedLines: 'Ninguna',
    noScript: 'No hay guion importado',
    cueCount: '{cues} cues · {pending} propuestas por revisar',
    sourceCount: '{lines} líneas originales',
    audioCount: '{count} audios vinculados',
    openAssistant: 'Preguntar a RUNQ AI · opcional',
  },
});

const $ = id => document.getElementById(id);
const make = (tag, className = '', text = '') => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
};

function getShowState() {
  let state = null;
  document.dispatchEvent(new CustomEvent('runq:agent-read', {
    detail: { respond: value => { state = value; } },
  }));
  return state;
}

function getSelectedScriptLines() {
  let lineIds = [];
  document.dispatchEvent(new CustomEvent('runq:script-selection-read', {
    detail: { respond: value => { lineIds = Array.isArray(value) ? value : []; } },
  }));
  return lineIds;
}

function fill(template, values = {}) {
  return template.replace(/\{([a-z]+)\}/g, (_, key) => String(values[key] ?? ''));
}

function readStorage() {
  try { return window.localStorage; }
  catch { return null; }
}

export function mountShowBuilder(panel, welcome, steps) {
  if (!panel || !welcome || !steps || panel.querySelector('#rqShowBuilder')) return;

  const container = make('section', 'rq16-show-builder');
  container.id = 'rqShowBuilder';
  container.setAttribute('aria-labelledby', 'rqShowBuilderTitle');

  const heading = make('div', 'rq16-builder-heading');
  const title = make('h2', '', 'Build your show');
  title.id = 'rqShowBuilderTitle';
  const progress = make('p', 'rq16-builder-progress');
  progress.id = 'rqShowBuilderProgress';
  progress.setAttribute('role', 'status');
  progress.setAttribute('aria-live', 'polite');
  const askAssistant = make('button', 'btn subtle small');
  askAssistant.id = 'rqShowBuilderAskAssistant';
  askAssistant.type = 'button';
  askAssistant.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('runq:show-builder-ask-ai'));
  });
  heading.append(title, progress, askAssistant);

  const step = make('p', 'rq16-builder-step');
  step.id = 'rqShowBuilderStep';
  const stageTitle = make('h3', 'rq16-builder-stage-title');
  const description = make('p', 'rq16-builder-description');
  const summary = make('p', 'rq16-builder-summary');
  const status = make('p', 'rq16-builder-stage-status');
  status.id = 'rqShowBuilderStatus';
  status.setAttribute('role', 'status');
  const details = make('div', 'rq16-builder-details');
  details.append(step, stageTitle, description, summary, status);
  const actions = make('div', 'rq16-builder-actions');
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', 'Wizard navigation');
  const toolActions = make('div', 'rq16-builder-tool-actions');
  const navigationActions = make('div', 'rq16-builder-nav-actions');

  const reviewConfig = make('button', 'btn subtle small');
  reviewConfig.id = 'rqShowBuilderReviewConfig';
  reviewConfig.type = 'button';
  reviewConfig.hidden = true;
  const back = make('button', 'btn subtle small rq16-builder-back');
  back.id = 'rqShowBuilderBack';
  back.type = 'button';
  const skip = make('button', 'btn subtle small rq16-builder-skip');
  skip.id = 'rqShowBuilderSkip';
  skip.type = 'button';
  const next = make('button', 'btn accent small rq16-builder-next');
  next.id = 'rqShowBuilderNext';
  next.type = 'button';
  toolActions.append(reviewConfig);
  navigationActions.append(back, skip, next);
  actions.append(toolActions, navigationActions);

  const contextual = make('aside', 'rq16-builder-contextual');
  contextual.setAttribute('aria-labelledby', 'rqShowBuilderContextTitle');
  const contextTitle = make('h3', 'rq16-builder-context-title');
  contextTitle.id = 'rqShowBuilderContextTitle';
  const contextHelp = make('p', 'rq16-builder-task-help');
  const contextSummary = make('dl', 'rq16-builder-context-summary');
  const contextRows = new Map();
  for (const key of ['show', 'selectedCue', 'selectedLines', 'cueWork', 'source', 'audio']) {
    const row = make('div', 'rq16-builder-context-row');
    const label = make('dt');
    const value = make('dd');
    value.dataset.contextValue = key;
    row.append(label, value);
    contextSummary.append(row);
    contextRows.set(key, { label, value });
  }
  const assistantDisclosure = make('details', 'rq16-builder-ai-help');
  assistantDisclosure.id = 'rqShowBuilderAiHelp';
  const assistantSummary = make('summary');
  const assistant = $('rqAgentWorkspace');
  if (assistant) assistantDisclosure.append(assistantSummary, assistant);
  contextual.append(contextTitle, contextHelp, contextSummary, assistantDisclosure);

  const routes = make('nav', 'rq16-builder-routes');
  routes.setAttribute('aria-labelledby', 'rqShowBuilderRoutesTitle');
  const routesTitle = make('h3', 'rq16-builder-routes-title');
  routesTitle.id = 'rqShowBuilderRoutesTitle';
  const routesHelp = make('p', 'rq16-builder-task-help');
  const routeList = make('div', 'rq16-builder-route-list');
  const routeButtons = new Map();
  for (const [routeId] of ROUTE_COPY.en.routes) {
    const button = make('button', 'rq16-builder-route');
    button.type = 'button';
    button.dataset.builderRoute = routeId;
    const label = make('strong');
    const help = make('small');
    button.append(label, help);
    button.addEventListener('click', () => {
      if (routeId === 'assistant') {
        document.dispatchEvent(new CustomEvent('runq:show-builder-ask-ai'));
        return;
      }
      const stageId = routeId === 'script' ? 'project' : routeId === 'cue' ? 'cues' : 'audio';
      if (!currentShow) return;
      selectedRoute = routeId;
      saveSession(currentShow.project, updateShowBuilderStage(session, stageId));
      render();
    });
    routeButtons.set(routeId, { button, label, help });
    routeList.append(button);
  }
  routes.append(routesTitle, routesHelp, routeList);

  const taskCanvas = make('div', 'rq16-builder-canvas');
  taskCanvas.id = 'rqShowBuilderCanvas';
  const diagnostics = make('div', 'rq16-builder-diagnostics');
  diagnostics.id = 'rqShowBuilderDiagnostics';
  const metaStatus = $('metaStatus');
  const checkMetaStatus = $('checkMetaStatusBtn');
  if (metaStatus) diagnostics.append(metaStatus);
  if (checkMetaStatus) diagnostics.append(checkMetaStatus);
  const builderMessage = make('p', 'rq16-builder-task-help');
  builderMessage.id = 'rqShowBuilderMessage';
  builderMessage.setAttribute('role', 'status');
  builderMessage.setAttribute('aria-live', 'polite');
  diagnostics.append(builderMessage);
  const sourceTask = make('section', 'rq16-builder-task');
  sourceTask.id = 'rqShowBuilderSourceTask';
  sourceTask.setAttribute('aria-labelledby', 'rqShowBuilderSourceTitle');
  const sourceTitle = make('h4', 'rq16-builder-task-title');
  sourceTitle.id = 'rqShowBuilderSourceTitle';
  const sourceHelp = make('p', 'rq16-builder-task-help');
  const importScript = make('button', 'btn accent');
  importScript.id = 'rqShowBuilderImportScript';
  importScript.type = 'button';
  const proposeScriptCues = make('button', 'btn accent');
  proposeScriptCues.id = 'rqShowBuilderProposeCues';
  proposeScriptCues.type = 'button';
  const proposeScriptCuesHelp = make('p', 'rq16-builder-task-help');
  proposeScriptCuesHelp.id = 'rqShowBuilderProposeCuesHelp';
  const sourceSearch = make('input', 'rq16-builder-source-search');
  sourceSearch.id = 'rqShowBuilderSourceSearch';
  sourceSearch.type = 'search';
  const sourceSearchLabel = make('label', 'rq16-builder-source-search-label');
  sourceSearchLabel.htmlFor = sourceSearch.id;
  const sourceList = make('div', 'rq16-builder-source-list');
  sourceList.id = 'rqShowBuilderSourceLines';
  sourceList.setAttribute('role', 'group');
  sourceList.setAttribute('aria-label', 'Original script lines');
  const selectionStatus = make('p', 'rq16-builder-selection-status');
  selectionStatus.id = 'rqShowBuilderSelectionStatus';
  selectionStatus.setAttribute('role', 'status');
  selectionStatus.setAttribute('aria-live', 'polite');
  const sourceActions = make('div', 'rq16-builder-actions');
  const createSelected = make('button', 'btn accent small');
  createSelected.id = 'rqShowBuilderCreateSelected';
  createSelected.type = 'button';
  const analyzeSelected = make('button', 'btn subtle small');
  analyzeSelected.id = 'rqShowBuilderAnalyzeSelected';
  analyzeSelected.type = 'button';
  const detectScript = make('button', 'btn subtle small');
  detectScript.id = 'rqShowBuilderDetectScript';
  detectScript.type = 'button';
  sourceActions.append(createSelected, analyzeSelected, detectScript);
  sourceTask.append(sourceTitle, sourceHelp, importScript, proposeScriptCues, proposeScriptCuesHelp, sourceSearchLabel, sourceSearch,
    sourceList, selectionStatus, sourceActions);

  const cueTask = make('section', 'rq16-builder-task');
  cueTask.id = 'rqShowBuilderCueTask';
  cueTask.setAttribute('aria-labelledby', 'rqShowBuilderCueTaskTitle');
  const cueTaskTitle = make('h4', 'rq16-builder-task-title');
  cueTaskTitle.id = 'rqShowBuilderCueTaskTitle';
  const cueTaskHelp = make('p', 'rq16-builder-task-help');
  const generateSuggestions = make('button', 'btn accent small');
  generateSuggestions.id = 'rqShowBuilderGenerateCues';
  generateSuggestions.type = 'button';
  const aiControls = make('details', 'rq16-builder-ai-controls');
  aiControls.id = 'rqShowBuilderAiControls';
  const aiSummary = make('summary');
  const proposalReview = make('section', 'rq16-builder-proposal-review');
  proposalReview.setAttribute('aria-labelledby', 'rqShowBuilderProposalTitle');
  const proposalTitle = make('h5', 'rq16-builder-proposal-title');
  proposalTitle.id = 'rqShowBuilderProposalTitle';
  const proposalHelp = make('p', 'rq16-builder-task-help');
  const approveAllProposals = make('button', 'btn accent small');
  approveAllProposals.id = 'rqShowBuilderApproveAllProposals';
  approveAllProposals.type = 'button';
  aiControls.append(aiSummary);
  proposalReview.append(proposalTitle, proposalHelp, approveAllProposals);
  cueTask.append(cueTaskTitle, cueTaskHelp, generateSuggestions, aiControls, proposalReview);

  const audioTask = make('section', 'rq16-builder-task');
  audioTask.id = 'rqShowBuilderAudioTask';
  const audioTitle = make('h4', 'rq16-builder-task-title');
  const audioHelp = make('p', 'rq16-builder-task-help');
  const audioPlanTitle = make('h5', 'rq16-builder-proposal-title');
  const audioPlan = make('div', 'rq16-builder-audio-plan');
  audioPlan.setAttribute('role', 'group');
  audioPlan.setAttribute('aria-labelledby', 'rqShowBuilderAudioPlanTitle');
  audioPlanTitle.id = 'rqShowBuilderAudioPlanTitle';
  const cueSoundTitle = make('h5', 'rq16-builder-proposal-title');
  cueSoundTitle.id = 'rqShowBuilderCueSoundTitle';
  const cueSoundList = make('div', 'rq16-builder-cue-sound-list');
  cueSoundList.id = 'rqShowBuilderCueSoundList';
  cueSoundList.setAttribute('role', 'list');
  cueSoundList.setAttribute('aria-labelledby', cueSoundTitle.id);
  const addSounds = make('button', 'btn subtle small');
  addSounds.id = 'rqShowBuilderAddSounds';
  addSounds.type = 'button';
  const skipSounds = make('button', 'btn subtle small');
  skipSounds.id = 'rqShowBuilderSkipSounds';
  skipSounds.type = 'button';
  const soundPlanStatus = make('p', 'rq16-builder-task-help');
  soundPlanStatus.id = 'rqShowBuilderSoundPlanStatus';
  soundPlanStatus.setAttribute('role', 'status');
  const openSoundWorkspace = make('button', 'btn accent small');
  openSoundWorkspace.id = 'rqShowBuilderOpenSoundWorkspace';
  openSoundWorkspace.type = 'button';
  audioPlan.append(addSounds, skipSounds);
  audioTask.append(audioTitle, audioHelp, cueSoundTitle, cueSoundList, audioPlanTitle, audioPlan, soundPlanStatus,
    openSoundWorkspace);
  const configurationTask = make('section', 'rq16-builder-task');
  configurationTask.id = 'rqShowBuilderConfigurationTask';
  const configurationTitle = make('h4', 'rq16-builder-task-title');
  const openConfiguration = make('button', 'btn subtle small');
  openConfiguration.id = 'rqShowBuilderOpenConfiguration';
  openConfiguration.type = 'button';
  configurationTask.append(configurationTitle, openConfiguration);
  const verificationTask = make('section', 'rq16-builder-task');
  verificationTask.id = 'rqShowBuilderVerificationTask';
  const verificationTitle = make('h4', 'rq16-builder-task-title');
  const openPreflight = make('button', 'btn subtle small');
  openPreflight.id = 'rqShowBuilderOpenPreflight';
  openPreflight.type = 'button';
  verificationTask.append(verificationTitle, openPreflight);
  const stageTasks = [
    ['project', sourceTask],
    ['cues', cueTask],
    ['audio', audioTask],
    ['configuration', configurationTask],
    ['verification', verificationTask],
  ].map(([stageId, task]) => {
    const card = make('section', 'rq16-builder-stage-card');
    card.dataset.builderStage = stageId;
    card.append(task);
    return card;
  });
  cueTask.insertBefore(diagnostics, proposalReview);
  taskCanvas.append(details, ...stageTasks);
  container.append(heading, steps, actions, routes, taskCanvas, contextual);
  welcome.after(container);

  const metaPanel = panel.querySelector('.meta-panel');
  const manualProposalForm = $('proposalForm');
  const proposalList = $('proposalList');
  const proposalWorkspace = proposalList?.closest('.rq5-ai-review');
  const proposalListTitle = [...panel.querySelectorAll('.subheading')]
    .find(element => element.dataset.i18n === 'proposals.reviewHeading');
  const legacyHelp = panel.querySelector(':scope > .help');
  const legacySeparator = panel.querySelector(':scope > .separator');
  const legacyAiGrid = panel.querySelector(':scope > .rq5-ai-grid');
  if (metaPanel) {
    metaPanel.querySelector('#metaStatus')?.remove();
    metaPanel.querySelector('#checkMetaStatusBtn')?.remove();
    aiControls.append(metaPanel.closest('.rq5-ai-engine') || metaPanel);
  }
  if (manualProposalForm) aiControls.append(manualProposalForm);
  if (proposalListTitle) proposalReview.append(proposalListTitle);
  if (proposalWorkspace) proposalReview.append(proposalWorkspace);
  else if (proposalList) proposalReview.append(proposalList);
  if (legacyHelp) legacyHelp.hidden = true;
  if (legacySeparator) legacySeparator.hidden = true;
  if (legacyAiGrid) legacyAiGrid.hidden = true;

  let session = null;
  let projectKey = null;
  let persistenceAvailable = true;
  let assessment = null;
  let currentShow = null;
  let taskMessage = '';
  let selectedRoute = null;
  const stageCards = new Map([...container.querySelectorAll('[data-builder-stage]')]
    .map(card => [card.dataset.builderStage, card]));

  function routeForStage(stageId) {
    return stageId === 'project' ? 'script' : stageId === 'cues' ? 'cue'
      : stageId === 'audio' ? 'audio' : null;
  }

  function saveSession(project, nextSession) {
    session = nextSession;
    persistenceAvailable = saveShowBuilderSession(readStorage(), project, session);
  }

  function openWorkspace(workspace) {
    const button = document.querySelector(`[data-workspace-nav="${workspace}"]`);
    if (!button) throw new Error('Show Builder workspace is unavailable: ' + workspace);
    button.click();
  }

  function render() {
    currentShow = getShowState();
    if (!currentShow?.project || !Array.isArray(currentShow.assets)) return;
    const currentProjectKey = showBuilderProjectKey(currentShow.project);
    if (!session || projectKey !== currentProjectKey) {
      const loaded = loadShowBuilderSession(readStorage(), currentShow.project);
      session = loaded.session;
      projectKey = loaded.session.projectKey;
      persistenceAvailable = loaded.persistenceAvailable;
      assistantDisclosure.open = false;
      selectedRoute = routeForStage(session.currentStage);
    }
    assessment = assessShowBuilder(currentShow.project, currentShow.assets, session);

    const locale = $('uiLocaleSelect')?.value === 'es' ? 'es' : 'en';
    const copy = STAGE_COPY[locale];
    const routeCopy = ROUTE_COPY[locale];
    const currentIndex = SHOW_BUILDER_STAGES.indexOf(session.currentStage);
    const completeCount = SHOW_BUILDER_STAGES.filter(id => assessment.stages[id].complete).length;
    title.textContent = locale === 'es' ? 'Diseña tu espectáculo' : 'Build your show';
    contextTitle.textContent = routeCopy.contextTitle;
    contextual.dataset.assistantOpen = String(assistantDisclosure.open);
    askAssistant.textContent = locale === 'es' ? 'Abrir asistente' : 'Open assistant';
    contextHelp.textContent = routeCopy.contextHelp;
    routesTitle.textContent = routeCopy.title;
    routesHelp.textContent = routeCopy.help;
    assistantSummary.textContent = routeCopy.openAssistant;
    for (const [routeId, route] of routeButtons) {
      const [, label, help] = routeCopy.routes.find(([id]) => id === routeId);
      route.label.textContent = label;
      route.help.textContent = help;
      route.button.setAttribute('aria-current',
        (assistantDisclosure.open ? 'assistant' : selectedRoute ?? routeForStage(session.currentStage)) === routeId
          ? 'page' : 'false');
    }
    actions.setAttribute('aria-label', locale === 'es' ? 'Navegación del asistente' : 'Wizard navigation');
    progress.textContent = fill(copy.progress[0], {
      done: completeCount,
      total: SHOW_BUILDER_STAGES.length,
    });
    step.textContent = fill(copy.step[0], {
      current: currentIndex + 1,
      total: SHOW_BUILDER_STAGES.length,
    });
    steps.setAttribute('aria-label', locale === 'es' ? 'Etapas del Show Builder' : 'Show Builder stages');

    for (const [index, stageId] of SHOW_BUILDER_STAGES.entries()) {
      const listItem = steps.children[index];
      if (!listItem) continue;
      const button = listItem.querySelector('button');
      if (!button) continue;
      const stageState = assessment.stages[stageId];
      const wasSkipped = session.skippedStages.includes(stageId) && !stageState.complete;
      const stepLabel = button.querySelector('.rq16-builder-stage-label');
      if (stepLabel) stepLabel.textContent = copy[stageId][0];
      else button.textContent = `${index + 1}. ${copy[stageId][0]}`;
      button.setAttribute('aria-current', stageId === session.currentStage ? 'step' : 'false');
      button.setAttribute('aria-label', locale === 'es'
        ? `Paso ${index + 1} de ${SHOW_BUILDER_STAGES.length}: ${copy[stageId][0]}`
        : `Step ${index + 1} of ${SHOW_BUILDER_STAGES.length}: ${copy[stageId][0]}`);
      button.dataset.complete = String(stageState.complete);
      button.dataset.skipped = String(wasSkipped);
      listItem.dataset.complete = String(stageState.complete);
      listItem.dataset.skipped = String(wasSkipped);
    }

    const stageId = session.currentStage;
    const stageState = assessment.stages[stageId];
    const stageCopy = copy[stageId];
    stageTitle.textContent = stageCopy[0];
    description.textContent = stageCopy[1];
    back.textContent = copy.back[0];
    skip.textContent = copy.skip[0];
    next.textContent = currentIndex === SHOW_BUILDER_STAGES.length - 1
      ? copy.finish[0] : copy.continue[0];
    sourceTitle.textContent = copy.sourceTitle[0];
    sourceHelp.textContent = copy.sourceHelp[0];
    proposeScriptCues.textContent = copy.proposeScriptCues[0];
    proposeScriptCuesHelp.textContent = copy.proposeScriptCuesHelp[0];
    importScript.textContent = currentShow.project.scriptText.trim()
      ? copy.replaceScript[0] : copy.importScript[0];
    importScript.classList.toggle('subtle', Boolean(currentShow.project.scriptText.trim()));
    importScript.classList.toggle('accent', !currentShow.project.scriptText.trim());
    sourceSearchLabel.textContent = copy.sourceSearch[0];
    sourceSearch.placeholder = copy.sourceSearchHint[0];
    sourceSearch.setAttribute('aria-label', copy.sourceSearch[0]);
    createSelected.textContent = copy.createSelected[0];
    analyzeSelected.textContent = copy.analyzeSelected[0];
    detectScript.textContent = copy.detectScript[0];
    generateSuggestions.textContent = copy.generateCues[0];
    cueTaskTitle.textContent = copy.cueTaskTitle[0];
    cueTaskHelp.textContent = copy.cueTaskHelp[0];
    aiSummary.textContent = copy.advancedAiTools[0];
    proposalTitle.textContent = copy.proposalReview[0];
    proposalHelp.textContent = copy.proposalHelp[0];
    approveAllProposals.textContent = fill(copy.approveAllProposals[0], {
      count: currentShow.project.proposals.filter(proposal => proposal.status === 'PENDING').length,
    });
    audioTitle.textContent = copy.audioTaskTitle[0];
    audioHelp.textContent = copy.audioTaskHelp[0];
    cueSoundTitle.textContent = copy.soundCueListTitle[0];
    audioPlanTitle.textContent = copy.audioPlanTitle[0];
    addSounds.textContent = copy.addSounds[0];
    skipSounds.textContent = copy.skipSounds[0];
    openSoundWorkspace.textContent = copy.openSoundWorkspace[0];
    openConfiguration.textContent = locale === 'es'
      ? 'Revisar propiedades en Studio'
      : 'Review cue properties in Studio';
    openPreflight.textContent = copy.openPreflight[0];
    configurationTitle.textContent = copy.configTaskTitle[0];
    verificationTitle.textContent = copy.verificationTaskTitle[0];
    builderMessage.textContent = taskMessage;
    taskCanvas.dataset.activeTask = stageId;
    for (const [cardStage, card] of stageCards) {
      card.dataset.active = String(cardStage === stageId);
      card.hidden = cardStage !== stageId;
    }
    const pendingProposalCount = currentShow.project.proposals
      .filter(proposal => proposal.status === 'PENDING').length;
    approveAllProposals.hidden = pendingProposalCount < 2;
    const selectedCue = currentShow.project.cues.find(cue => cue.id === currentShow.selectedCueId);
    const selectedLineCount = getSelectedScriptLines().length;
    const linkedAudioCount = currentShow.project.cues.reduce((count, cue) =>
      count + cue.actions.filter(action => action.type === 'PLAY').length +
        (cue.audioTracks ?? []).length, 0);
    const contextValues = {
      show: currentShow.project.name || routeCopy.noShow,
      selectedCue: selectedCue ? `${selectedCue.number} · ${selectedCue.label}` : routeCopy.noCue,
      selectedLines: selectedLineCount
        ? fill(routeCopy.selectedLineCount, { count: selectedLineCount })
        : routeCopy.noSelectedLines,
      cueWork: fill(routeCopy.cueCount, {
        cues: currentShow.project.cues.length,
        pending: pendingProposalCount,
      }),
      source: currentShow.project.scriptText.trim()
        ? fill(routeCopy.sourceCount, { lines: parseScript(currentShow.project.scriptText).length })
        : routeCopy.noScript,
      audio: fill(routeCopy.audioCount, { count: linkedAudioCount }),
    };
    for (const [key, row] of contextRows) {
      row.label.textContent = routeCopy[key];
      row.value.textContent = contextValues[key];
    }
    diagnostics.hidden = stageId !== 'cues' && !aiControls.open;
    if (proposalListTitle) proposalListTitle.textContent = copy.proposalReview[0];
    const lines = currentShow.project.scriptText.trim()
      ? parseScript(currentShow.project.scriptText) : [];
    const selectedIds = new Set(getSelectedScriptLines());
    const query = sourceSearch.value.trim().toLocaleLowerCase();
    const matchingLines = lines.filter(line =>
      !query || line.id.toLocaleLowerCase().includes(query) ||
        line.text.toLocaleLowerCase().includes(query));
    const visibleLines = matchingLines.slice(0, 120);
    sourceList.replaceChildren();
    if (!lines.length) {
      sourceList.append(make('p', 'rq16-builder-task-help', copy.noScriptLoaded[0]));
    } else if (!visibleLines.length) {
      sourceList.append(make('p', 'rq16-builder-task-help', copy.noSearchMatches[0]));
    } else {
      for (const line of visibleLines) {
        const label = make('label', 'rq16-builder-source-line');
        const checkbox = make('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.builderLineSelect = line.id;
        checkbox.checked = selectedIds.has(line.id);
        checkbox.disabled = !checkbox.checked && selectedIds.size >= 20;
        checkbox.addEventListener('change', () => {
          const nextIds = new Set(getSelectedScriptLines());
          if (checkbox.checked) nextIds.add(line.id);
          else nextIds.delete(line.id);
          document.dispatchEvent(new CustomEvent('runq:script-selection-set', {
            detail: { lineIds: [...nextIds] },
          }));
        });
        const reference = make('span', 'rq16-builder-source-ref', line.id);
        const text = make('span', 'rq16-builder-source-text', line.text || ' ');
        label.append(checkbox, reference, text);
        sourceList.append(label);
      }
      if (matchingLines.length > visibleLines.length) {
        sourceList.append(make('p', 'rq16-builder-task-help', fill(copy.showMoreLines[0], {
          shown: visibleLines.length,
          total: matchingLines.length,
        })));
      }
    }
    selectionStatus.textContent = fill(copy.selectedCount[0], { count: selectedIds.size });
    const hasScript = lines.length > 0;
    sourceSearch.hidden = !hasScript;
    sourceSearchLabel.hidden = !hasScript;
    sourceActions.hidden = !hasScript;
    selectionStatus.hidden = !hasScript;
    proposeScriptCues.hidden = !hasScript;
    proposeScriptCuesHelp.hidden = !hasScript;
    proposeScriptCues.disabled = !hasScript;
    createSelected.disabled = selectedIds.size === 0;
    analyzeSelected.disabled = selectedIds.size === 0;
    detectScript.disabled = !hasScript;
    generateSuggestions.disabled = !hasScript;
    proposalReview.dataset.pendingCount = String(pendingProposalCount);
    back.disabled = currentIndex <= 0;
    skip.disabled = stageState.complete;
    reviewConfig.hidden = stageId !== 'configuration' ||
      stageState.complete || currentShow.project.cues.length === 0;
    reviewConfig.textContent = stageCopy[3];
    reviewConfig.title = stageCopy[4];
    addSounds.setAttribute('aria-pressed', String(session.soundDecision === 'create'));
    skipSounds.setAttribute('aria-pressed', String(session.soundDecision === 'skip'));
    openSoundWorkspace.hidden = false;

    if (stageId === 'project') {
      const lineCount = currentShow.project.scriptText
        ? currentShow.project.scriptText.split(/\r\n|\n|\r/).length
        : 0;
      summary.textContent = fill(copy.projectSummary[0], {
        lines: lineCount,
        cues: currentShow.project.cues.length,
        assets: currentShow.project.assets.length,
      });
    } else if (stageId === 'cues') {
      const pending = currentShow.project.proposals.filter(proposal => proposal.status === 'PENDING').length;
      summary.textContent = fill(copy.cueSummary[0], {
        cues: currentShow.project.cues.length,
        pending,
      });
    } else if (stageId === 'audio') {
      const audioSummary = fill(copy.audioSummary[0], {
        linked: assessment.linkedAudioCount,
        ready: currentShow.assets.filter(asset => asset.ready).length,
      });
      summary.textContent = session.soundDecision === 'skip' && !assessment.linkedAudioCount
        ? copy.soundDeferred[0]
        : audioSummary;
    } else if (stageId === 'configuration') {
      summary.textContent = copy.configurationSummary[0];
    } else {
      const report = assessment.readiness;
      summary.textContent = fill(copy.verificationSummary[0], {
        ready: report.readyCues,
        total: report.totalCues,
        blockers: report.blockerCount,
        warnings: report.warningCount,
      });
    }

    status.classList.toggle('is-complete', stageState.complete);
    status.classList.toggle('is-pending', !stageState.complete);
    status.classList.toggle('is-not-required', stageState.notRequired && !stageState.complete);
    status.classList.toggle('is-guidance', stageId === 'project' && !stageState.complete);
    if (stageId === 'audio' && session.soundDecision === 'skip' && !assessment.linkedAudioCount) {
      status.textContent = copy.soundPlanSkip[0];
    } else if (stageState.complete) status.textContent = copy.complete[0];
    else if (stageState.notRequired) status.textContent = copy.notRequired[0];
    else if (session.skippedStages.includes(stageId)) status.textContent = copy.skipped[0];
    else if (stageId === 'project') status.textContent = stageCopy[4];
    else if (stageId === 'cues' && !currentShow.project.scriptText.trim()) status.textContent = copy.noScriptCues[0];
    else if (stageId === 'audio') status.textContent = stageCopy[4];
    else if (stageId === 'configuration') status.textContent = currentShow.project.cues.length
      ? stageCopy[4]
      : copy.noCuesForConfig[0];
    else if (stageId === 'verification') status.textContent = stageCopy[4];
    else status.textContent = copy.pending[0];
    if (!persistenceAvailable) status.textContent += ' ' + copy.storageWarning[0];
    soundPlanStatus.textContent = session.soundDecision === 'skip'
      ? copy.soundPlanSkip[0]
      : session.soundDecision === 'create' ? copy.soundPlanCreate[0] : copy.soundPlanUnset[0];
    cueSoundList.replaceChildren();
    if (!currentShow.project.cues.length) {
      cueSoundList.append(make('p', 'rq16-builder-task-help', copy.soundCueEmpty[0]));
    } else {
      for (const cue of currentShow.project.cues) {
        const row = make('article', 'rq16-builder-cue-sound');
        row.dataset.builderSoundCue = cue.id;
        row.setAttribute('role', 'listitem');
        const identity = make('div', 'rq16-builder-cue-sound-identity');
        const cueName = make('strong', '', `${cue.number} · ${cue.label}`);
        const source = make('small', '', cue.sourceLineIds.join(', ') ||
          (locale === 'es' ? 'Sin referencia al guion' : 'No script reference'));
        identity.append(cueName, source);
        const audioPlanAction = cue.actions.find(action =>
          action.type === 'PLAN_AUDIO' && !isOperatorSoundPlaceholder(action.prompt));
        if (audioPlanAction) {
          identity.append(make('small', 'rq16-builder-sound-idea',
            `${copy.audioIdea[0]}: ${audioPlanAction.prompt}`));
        }
        const audioIds = [
          ...cue.actions.filter(action => action.type === 'PLAY').map(action => action.assetId),
          ...(cue.audioTracks ?? []).map(track => track.assetId),
        ];
        const linkedAudio = audioIds.length > 0;
        const loadedAudio = audioIds.some(id => currentShow.assets.some(asset =>
          asset.id === id && asset.ready));
        const cueStatus = make('span', 'rq16-builder-cue-sound-status',
          linkedAudio
            ? loadedAudio ? copy.soundCueAudioReady[0] : copy.soundCueAudioUnloaded[0]
            : copy.soundCueNeedsAudio[0]);
        cueStatus.dataset.audioState = !linkedAudio ? 'missing' : loadedAudio ? 'ready' : 'unloaded';
        const openSound = make('button', 'btn subtle small', linkedAudio
          ? copy.soundCueReplace[0] : copy.soundCuePrepare[0]);
        openSound.type = 'button';
        openSound.dataset.builderOpenCueSound = cue.id;
        openSound.addEventListener('click', () => {
          document.dispatchEvent(new CustomEvent('runq:context-open-cue-sound', {
            detail: { cueId: cue.id },
          }));
        });
        row.append(identity, cueStatus, openSound);
        cueSoundList.append(row);
      }
    }
  }

  for (const [index, stageId] of SHOW_BUILDER_STAGES.entries()) {
    const item = steps.children[index] || make('li');
    const button = make('button', 'rq16-builder-stage');
    button.type = 'button';
    button.dataset.stage = stageId;
    const number = make('span', 'rq16-builder-step-number', String(index + 1).padStart(2, '0'));
    number.setAttribute('aria-hidden', 'true');
    const label = make('span', 'rq16-builder-stage-label');
    button.append(number, label);
    button.addEventListener('click', () => {
      if (!currentShow) return;
      selectedRoute = routeForStage(stageId);
      saveSession(currentShow.project, updateShowBuilderStage(session, stageId));
      render();
    });
    item.replaceChildren(button);
    if (!item.isConnected) steps.append(item);
  }

  importScript.addEventListener('click', () => {
    taskMessage = '';
    document.dispatchEvent(new Event('runq:show-builder-import-script'));
  });
  sourceSearch.addEventListener('input', render);
  createSelected.addEventListener('click', () => {
    const lineIds = getSelectedScriptLines();
    if (!lineIds.length) {
      taskMessage = STAGE_COPY[$('uiLocaleSelect')?.value === 'es' ? 'es' : 'en'].selectLinesFirst[0];
      render();
      return;
    }
    document.dispatchEvent(new CustomEvent('runq:create-cue-from-script-lines', {
      detail: { lineIds, source: 'show-builder' },
    }));
  });
  analyzeSelected.addEventListener('click', () => $('rq16AnalyzeScriptSelection')?.click());
  detectScript.addEventListener('click', () => $('rq16DetectScriptCues')?.click());
  proposeScriptCues.addEventListener('click', () => {
    if (!currentShow || !currentShow.project.scriptText.trim()) return;
    selectedRoute = 'cue';
    saveSession(currentShow.project, updateShowBuilderStage(session, 'cues'));
    render();
    generateSuggestions.click();
  });
  generateSuggestions.addEventListener('click', () => {
    const analyzeButton = $('analyzeMetaBtn');
    if (!analyzeButton || analyzeButton.disabled) {
      aiControls.open = true;
      diagnostics.hidden = false;
      $('checkMetaStatusBtn')?.focus();
      return;
    }
    analyzeButton.click();
  });
  approveAllProposals.addEventListener('click', () => {
    if (!currentShow) return;
    const proposalIds = currentShow.project.proposals
      .filter(proposal => proposal.status === 'PENDING')
      .map(proposal => proposal.id);
    if (proposalIds.length < 2) return;
    document.dispatchEvent(new CustomEvent('runq:proposal-batch-approve', {
      detail: { proposalIds },
    }));
  });
  aiControls.addEventListener('toggle', () => {
    diagnostics.hidden = session?.currentStage !== 'cues' && !aiControls.open;
  });
  addSounds.addEventListener('click', () => {
    if (!currentShow) return;
    saveSession(currentShow.project, chooseShowBuilderSoundPlan(session, 'create'));
    render();
  });
  skipSounds.addEventListener('click', () => {
    if (!currentShow) return;
    saveSession(currentShow.project, chooseShowBuilderSoundPlan(session, 'skip'));
    render();
  });
  openSoundWorkspace.addEventListener('click', () => {
    if (!currentShow) return;
    saveSession(currentShow.project, chooseShowBuilderSoundPlan(session, 'create'));
    openWorkspace('soundlab');
  });
  openConfiguration.addEventListener('click', () => openWorkspace('cues'));
  openPreflight.addEventListener('click', () => openWorkspace('preflight'));
  assistantDisclosure.addEventListener('toggle', () => {
    selectedRoute = assistantDisclosure.open
      ? 'assistant'
      : routeForStage(session?.currentStage);
    render();
    if (!assistantDisclosure.open) return;
    const prompt = $('rqAgentPrompt');
    prompt?.scrollIntoView({ block: 'center' });
    prompt?.focus();
  });
  document.addEventListener('runq:show-builder-ask-ai', () => {
    selectedRoute = 'assistant';
    assistantDisclosure.open = true;
    render();
    const prompt = $('rqAgentPrompt');
    prompt?.scrollIntoView({ block: 'center' });
    prompt?.focus();
  });
  reviewConfig.addEventListener('click', () => {
    if (!currentShow) return;
    saveSession(currentShow.project, confirmShowBuilderConfiguration(currentShow.project, session));
    render();
  });
  back.addEventListener('click', () => {
    if (!currentShow || SHOW_BUILDER_STAGES.indexOf(session.currentStage) <= 0) return;
    const previous = SHOW_BUILDER_STAGES[SHOW_BUILDER_STAGES.indexOf(session.currentStage) - 1];
    selectedRoute = routeForStage(previous);
    saveSession(currentShow.project, updateShowBuilderStage(session, previous));
    render();
  });
  skip.addEventListener('click', () => {
    if (!currentShow) return;
    const index = SHOW_BUILDER_STAGES.indexOf(session.currentStage);
    let updated = skipShowBuilderStage(session, session.currentStage);
    const nextStage = index < SHOW_BUILDER_STAGES.length - 1
      ? SHOW_BUILDER_STAGES[index + 1] : session.currentStage;
    selectedRoute = routeForStage(nextStage);
    if (index < SHOW_BUILDER_STAGES.length - 1) {
      updated = updateShowBuilderStage(updated, nextStage);
    }
    saveSession(currentShow.project, updated);
    render();
  });
  next.addEventListener('click', () => {
    if (!currentShow) return;
    const index = SHOW_BUILDER_STAGES.indexOf(session.currentStage);
    if (index < SHOW_BUILDER_STAGES.length - 1) {
      const nextStage = SHOW_BUILDER_STAGES[index + 1];
      selectedRoute = routeForStage(nextStage);
      saveSession(currentShow.project, updateShowBuilderStage(session, nextStage));
      render();
    } else {
      selectedRoute = null;
      render();
    }
  });

  document.addEventListener('runq:show-state-changed', render);
  document.addEventListener('runq:audio-state-change', render);
  document.addEventListener('runq:cue-chat-selection', render);
  document.addEventListener('runq:script-selection-changed', event => {
    const locale = $('uiLocaleSelect')?.value === 'es' ? 'es' : 'en';
    taskMessage = event.detail?.rejected
      ? locale === 'es' ? 'Puedes seleccionar como máximo 20 líneas.' : 'Select up to 20 lines.'
      : '';
    render();
  });
  $('uiLocaleSelect')?.addEventListener('change', render);
  render();
}
