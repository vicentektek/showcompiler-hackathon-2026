const freezeRecord = record => Object.freeze({
  ...record,
  description: Object.freeze({ ...record.description }),
  prerequisites: Object.freeze([...record.prerequisites]),
  prohibitions: Object.freeze([...record.prohibitions]),
  evidence: Object.freeze(record.evidence.map(item => Object.freeze({ ...item }))),
  tests: Object.freeze(record.tests.map(item => Object.freeze({ ...item }))),
  keywords: Object.freeze([...record.keywords]),
});

export const RUNQ_CAPABILITIES = Object.freeze([
  freezeRecord({
    id: 'project-import-export',
    description: {
      en: 'Save/load the strict v1 project JSON, or import/export a self-contained ZIP with original audio.',
      es: 'Guarda/carga JSON de proyecto v1 o importa/exporta un ZIP autocontenido con audio original.',
    },
    accessPath: 'Project persistence API; UI Project import/export → serializeShowProject, exportPortableShow, importPortableShow.',
    state: 'supported',
    prerequisites: ['Valid v1 project; ZIP export requires every registered original audio file to be loaded.'],
    prohibitions: ['JSON excludes binary audio and live transport state.', 'Invalid, oversized, missing, or tampered ZIP contents are rejected.'],
    evidence: [
      { file: 'src/core/projectPersistence.mjs', line: 3, contains: 'Stores ONLY script text' },
      { file: 'src/core/projectPersistence.mjs', line: 315, contains: 'export function serializeShowProject' },
      { file: 'src/core/showArchive.mjs', line: 50, contains: 'export async function exportPortableShow' },
      { file: 'src/core/showArchive.mjs', line: 90, contains: 'export async function importPortableShow' },
    ],
    tests: [
      { file: 'test/projectPersistence.test.mjs', name: 'save/load round trip retains script, original newline encoding, and cues' },
      { file: 'test/showArchive.test.mjs', name: 'complete original show and sound roundtrip, with stable cue line references' },
    ],
    keywords: ['project', 'save', 'load', 'import', 'export', 'json', 'zip', 'archive', 'audio', 'proyecto', 'guardar', 'cargar', 'guion'],
  }),
  freezeRecord({
    id: 'original-script-and-line-references',
    description: {
      en: 'Import original script text and navigate/search stable L# lines without replacing the source with a translation.',
      es: 'Importa el guion original y navega/busca líneas L# estables sin sustituir el original por una traducción.',
    },
    accessPath: 'Home/Show Builder → Import script; Script workspace → line selection and search.',
    state: 'supported',
    prerequisites: ['A text script is optional for manual-audio-only projects; imported scripts are parsed into numbered lines.'],
    prohibitions: ['L# identifies the line position, not a semantic locator that survives arbitrary edits.', 'Do not invent or translate source references.'],
    evidence: [
      { file: 'src/core/script.mjs', line: 5, contains: 'export function parseScript(input)' },
      { file: 'src/core/script.mjs', line: 12, contains: 'id: `L${index + 1}`' },
      { file: 'src/core/agentCore.mjs', line: 73, contains: 'sourceLineIds:[...c.sourceLineIds]' },
    ],
    tests: [
      { file: 'test/script.test.mjs', name: 'parses CRLF and preserves source line numbers and blank lines' },
      { file: 'test/agentCore.test.mjs', name: 'context builder exposes bounded, original source and stable identities' },
    ],
    keywords: ['script', 'source', 'original', 'line', 'lines', 'L#', 'reference', 'import', 'search', 'guion', 'texto', 'línea', 'linea', 'referencia', 'original'],
  }),
  freezeRecord({
    id: 'scene-analysis-review-and-bulk-audio-planning',
    description: {
      en: 'Analyze bounded script scenes for explicit and optional cue ideas, review proposals, then plan serial SFX/environment generation.',
      es: 'Analiza escenas acotadas para proponer cues explícitos u opcionales, revisa propuestas y planifica generación serial de SFX/ambiente.',
    },
    accessPath: 'Script/AI analysis → pending proposals and human review; Show Preparation → eligible audio plan/batch.',
    state: 'partial',
    prerequisites: ['Script required for theatre analysis.', 'Provider access and explicit authorization are separate from offline planning/review.'],
    prohibitions: ['Analysis output is a suggestion, not a cue or playback command.', 'Bulk audio accepts SFX/ENVIRONMENT only; it is serial, bounded, and does not create cues.'],
    evidence: [
      { file: 'src/core/theatreCueAnalysis.mjs', line: 2, contains: 'Transient, scene-aware theatre sound analysis' },
      { file: 'src/core/theatreCueAnalysis.mjs', line: 16, contains: 'THEATRE_ANALYSIS_WINDOWS_PER_REQUEST = 1' },
      { file: 'src/core/showPreparation.mjs', line: 49, contains: 'export function validateAudioBatch' },
      { file: 'src/core/showPreparation.mjs', line: 58, contains: "!['SFX', 'ENVIRONMENT'].includes(draft.kind)" },
    ],
    tests: [
      { file: 'test/theatreCueAnalysis.test.mjs', name: 'parses explicit, suggested, continuing, silence and stop classifications' },
      { file: 'test/showPreparation.test.mjs', name: 'bulk audio preserves provenance, excludes linked audio and never creates cues' },
      { file: 'test/review.test.mjs', name: 'explicit human-approved proposal becomes a draft, not a running cue' },
    ],
    keywords: ['analysis', 'bulk', 'scene', 'theatre', 'theater', 'review', 'proposal', 'suggestion', 'audio', 'planning', 'batch', 'SFX', 'environment', 'análisis', 'escena', 'revisión', 'propuesta', 'lote', 'ambiente'],
  }),
  freezeRecord({
    id: 'assistant-edit-review-and-undo',
    description: {
      en: 'Build bounded read-only context, audit project issues, stage a strict edit plan, explicitly commit it, and undo if unchanged.',
      es: 'Construye contexto acotado de solo lectura, audita problemas, prepara un plan estricto, confirma su aplicación y permite deshacer si no cambió.',
    },
    accessPath: 'RUNQ AI → context/review → staged plan → operator apply/undo.',
    state: 'partial',
    prerequisites: ['Valid project and current cue/script context; edits require the project to be editable.'],
    prohibitions: ['Model output is not executable code and never applies itself.', 'No transport, playback, or file I/O in agentCore; stale undo is rejected.'],
    evidence: [
      { file: 'src/core/agentCore.mjs', line: 2, contains: 'RUNQ Agent: read-only context' },
      { file: 'src/core/agentCore.mjs', line: 3, contains: 'NO transport, model calls, file I/O, or automatic application.' },
      { file: 'src/core/agentCore.mjs', line: 83, contains: 'export function auditAgentProject' },
      { file: 'src/core/agentCore.mjs', line: 174, contains: 'export function prepareAgentPlan' },
      { file: 'src/core/agentCore.mjs', line: 204, contains: 'export function commitAgentPlan' },
      { file: 'src/core/agentCore.mjs', line: 216, contains: 'export function undoAgentPlan' },
    ],
    tests: [
      { file: 'test/agentCore.test.mjs', name: 'atomic edit/delete/reorder, source and media preserved, undo works' },
      { file: 'test/agentCore.test.mjs', name: 'invalid batch aborts without partially changing the original' },
      { file: 'test/agentCore.test.mjs', name: 'audit detects unresolved media and missing triggers without playback' },
    ],
    keywords: ['assistant', 'agent', 'edit', 'review', 'undo', 'audit', 'context', 'apply', 'plan', 'AI', 'asistente', 'editar', 'revisar', 'deshacer', 'auditoría', 'auditoria'],
  }),
  freezeRecord({
    id: 'cue-queue-and-audio-transport',
    description: {
      en: 'Keep selected/prepared cues separate from running audio; manual GO starts an eligible draft, while STOP/FADE/STOP ALL control local playback.',
      es: 'Separa cue seleccionado/preparado del audio en curso; GO manual inicia un borrador válido y STOP/FADE/STOP ALL controlan la reproducción local.',
    },
    accessPath: 'Cue workspace/operator queue → Prepare; audio transport controls → GO, STOP, FADE, STOP ALL.',
    state: 'supported',
    prerequisites: ['Cue must be an eligible DRAFT and its referenced audio must be present and decoded.'],
    prohibitions: ['Prepare, navigation, editing, search, audition, and AI suggestions do not execute GO.', 'Unresolved or missing audio cannot play.'],
    evidence: [
      { file: 'src/core/operatorQueue.mjs', line: 2, contains: 'Manual cue sequencing only.' },
      { file: 'src/core/operatorQueue.mjs', line: 20, contains: 'export function prepareOperatorCue' },
      { file: 'src/core/browserAudio.mjs', line: 3, contains: 'Plays operator-approved DRAFT cues only after an explicit GO.' },
      { file: 'src/core/browserAudio.mjs', line: 472, contains: 'async go(cue)' },
      { file: 'src/core/browserAudio.mjs', line: 642, contains: 'stopAll()' },
    ],
    tests: [
      { file: 'test/operatorQueue.test.mjs', name: 'preparing one cue never plays audio or marks it complete' },
      { file: 'test/browserAudio.test.mjs', name: 'GO rejects missing audio, unapproved or unsupported actions' },
      { file: 'test/browserAudio.test.mjs', name: 'PARAR TODO invalidates an asynchronous GO waiting on context resume' },
    ],
    keywords: ['cue', 'cues', 'queue', 'prepared', 'prepare', 'GO', 'STOP', 'FADE', 'playback', 'audio', 'cue', 'cola', 'preparado', 'reproducir'],
  }),
  freezeRecord({
    id: 'sound-lab-modal-sfx-pilot',
    description: {
      en: 'The opt-in server-side generation pilot accepts only SFX or environment plans and records results for manual review/import.',
      es: 'El piloto opcional de generación en servidor solo acepta planes SFX o ambiente y deja los resultados para revisión/importación manual.',
    },
    accessPath: 'Sound Lab → prepare and explicitly authorize one generation; server pilot adapter → Modal SFX.',
    state: 'experimental',
    prerequisites: ['Server-side Modal adapter and valid one-request authorization; SFX/environment prompt and duration within pilot bounds.'],
    prohibitions: ['No voiceover/music generation through this pilot.', 'Never auto-submit, retry, mutate a cue, or auto-import results.'],
    evidence: [
      { file: 'src/core/modalSfxPilotClient.mjs', line: 2, contains: 'Server-only, opt-in SFX pilot transport.' },
      { file: 'src/core/modalSfxPilotClient.mjs', line: 20, contains: "!['SFX', 'ENVIRONMENT'].includes(plan.kind)" },
      { file: 'src/core/modalSfxPilotClient.mjs', line: 24, contains: 'explicitly authorized SFX or environment plan' },
      { file: 'src/core/audioGenerationPlan.mjs', line: 25, contains: 'export function prepareAudioGenerationPlan' },
      { file: 'src/core/audioGenerationPlan.mjs', line: 52, contains: 'export function recordGeneratedWav' },
    ],
    tests: [
      { file: 'test/modalSfxPilotClient.test.mjs', name: 'one explicit authorization creates one SFX pilot payload with provenance' },
      { file: 'test/modalSfxPilotClient.test.mjs', name: 'no unauthorized, long, voice or music requests can start SFX pilot' },
      { file: 'test/modalSfxPilotClient.test.mjs', name: 'status and cancellation have separate semantics and never mutate a cue' },
    ],
    keywords: ['sound', 'lab', 'SFX', 'environment', 'generation', 'Modal', 'pilot', 'audio', 'soundlab', 'ambiente', 'generación', 'generacion', 'efectos'],
  }),
  freezeRecord({
    id: 'rehearsal-voice-follow-and-live-transcription',
    description: {
      en: 'Offline rehearsal replay and live speech can suggest a matching cue/line for operator preparation; live capture is separately opt-in.',
      es: 'La repetición de ensayo offline y el habla en vivo pueden sugerir un cue/línea para preparar manualmente; la captura en vivo requiere opt-in independiente.',
    },
    accessPath: 'Rehearsal/Voice Follow → candidate suggestions; live voice route → explicit-consent transcription session.',
    state: 'partial',
    prerequisites: ['Voice matching needs an operator-confirmed focus line and stable/final transcript; live mode needs explicit consent and configured provider access.'],
    prohibitions: ['Voice match and rehearsal never issue GO or access transport.', 'Not verified as reliable voice-following or production speech recognition.'],
    evidence: [
      { file: 'src/core/voiceFollow.mjs', line: 1, contains: 'Pure Voice Follow candidate matcher.' },
      { file: 'src/core/voiceFollow.mjs', line: 29, contains: 'Candidate suggestions only; never produces an executable command.' },
      { file: 'src/core/voiceRehearsal.mjs', line: 4, contains: 'Deterministic rehearsal replay.' },
      { file: 'tools/voiceLiveRoutes.mjs', line: 4, contains: 'No player or GO access.' },
      { file: 'tools/voiceLiveRoutes.mjs', line: 60, contains: "EXPLICIT_CONSENT_REQUIRED" },
    ],
    tests: [
      { file: 'test/voiceFollow.test.mjs', name: 'exact phrase produces suggestion only' },
      { file: 'test/voiceRehearsal.test.mjs', name: 'replay suggests cue once without executing' },
      { file: 'test/voiceLiveRoute.test.mjs', name: 'unauthorized realtime requests cannot open a Muse socket' },
    ],
    keywords: ['voice', 'rehearsal', 'live', 'transcription', 'speech', 'follow', 'suggestion', 'microphone', 'ensayo', 'voz', 'transcripción', 'transcripcion', 'habla'],
  }),
  freezeRecord({
    id: 'browser-output-and-hardware-limits',
    description: {
      en: 'Local Web Audio provides real browser playback and basic transport, but device routing, isolated preview, multichannel/ASIO, and professional certification are not implemented.',
      es: 'Web Audio local ofrece reproducción real y transporte básico, pero no implementa enrutamiento de dispositivos, preescucha aislada, multicanal/ASIO ni certificación profesional.',
    },
    accessPath: 'Setup → audio output diagnostics; Browser Audio backend capability declaration.',
    state: 'experimental',
    prerequisites: ['A compatible browser audio context and user gesture/device access are needed for output.'],
    prohibitions: ['Audition shares the GO output; it is not isolated PFL.', 'Do not claim ASIO, reliable multichannel routing, native hardware integration, or live-show certification.'],
    evidence: [
      { file: 'src/core/audioBackend.mjs', line: 3, contains: 'The browser adapter is a temporary engine.' },
      { file: 'src/core/audioBackend.mjs', line: 18, contains: 'hasPhysicalDeviceSelection: false' },
      { file: 'src/core/audioBackend.mjs', line: 19, contains: 'hasIndependentPreviewBus: false' },
      { file: 'src/core/audioBackend.mjs', line: 21, contains: 'supportsAsio: false' },
      { file: 'src/core/audioBackend.mjs', line: 24, contains: 'professionallyCertified: false' },
      { file: 'src/core/browserAudio.mjs', line: 257, contains: 'shared with GO, never a private monitor bus' },
    ],
    tests: [
      { file: 'test/audioBackend.test.mjs', name: 'backend advertises truthfully unsupported native features' },
      { file: 'test/browserAudio.test.mjs', name: 'manual GO starts an approved draft cue at reduced output level' },
    ],
    keywords: ['audio', 'output', 'hardware', 'browser', 'Web Audio', 'ASIO', 'multichannel', 'PFL', 'routing', 'device', 'setup', 'salida', 'hardware', 'canales', 'dispositivo', 'enrutamiento'],
  }),
  freezeRecord({
    id: 'runtime-capability-overview',
    description: {
      en: 'The catalogue documents script/project workflows, reviewed assistant proposals, local cue transport, the opt-in SFX pilot, voice suggestions, and browser audio limits. Ask about a named workflow for its verified prerequisites and boundaries.',
      es: 'El catálogo documenta guion/proyectos, propuestas revisadas, transporte local, piloto SFX opcional, sugerencias de voz y límites de audio web. Pregunta por un flujo concreto para conocer sus requisitos y límites verificados.',
    },
    accessPath: 'Select a specific capability entry in this catalogue.',
    state: 'partial',
    prerequisites: ['Use a specific workflow question for detailed behavior.'],
    prohibitions: ['Do not infer features or guarantees not listed in a specific evidenced entry.'],
    evidence: [
      { file: 'src/core/agentCore.mjs', line: 2, contains: 'RUNQ Agent: read-only context' },
      { file: 'src/core/audioBackend.mjs', line: 18, contains: 'hasPhysicalDeviceSelection: false' },
    ],
    tests: [
      { file: 'test/agentCore.test.mjs', name: 'context builder exposes bounded, original source and stable identities' },
      { file: 'test/audioBackend.test.mjs', name: 'backend advertises truthfully unsupported native features' },
    ],
    keywords: ['catalog', 'catalogue', 'overview', 'catalogo', 'resumen'],
  }),
]);

const TOKEN = /[\p{L}\p{N}]+/gu;
const MAX_RESULTS = 12;
const CONTEXT_SUMMARIES = Object.freeze({
  'project-import-export': {
    en: 'Validate v1 project JSON or portable ZIP with original audio.',
    es: 'Valida JSON v1 o ZIP portable del proyecto con audio original.',
    access: 'Project import/export.',
    prerequisites: ['ZIP export needs every registered audio file.'],
    prohibitions: ['JSON excludes binary audio and live transport.'],
  },
  'original-script-and-line-references': {
    en: 'Import/search original script text using stable L# line references.',
    es: 'Importa/busca el guion original con referencias de línea L#.',
    access: 'Show Builder import; Script workspace.',
    prerequisites: ['A script is optional for audio-only projects.'],
    prohibitions: ['L# is positional; never invent or translate references.'],
  },
  'scene-analysis-review-and-bulk-audio-planning': {
    en: 'Analyze script scenes, review proposals, plan bounded SFX batches.',
    es: 'Analiza escenas, revisa propuestas y planifica lotes SFX acotados.',
    access: 'Script/AI analysis; Show Preparation.',
    prerequisites: ['Analysis needs script; provider authorization is separate.'],
    prohibitions: ['Suggestions are not cues; batches do not create cues.'],
  },
  'assistant-edit-review-and-undo': {
    en: 'Audit, stage edits, then explicitly apply or undo the plan.',
    es: 'Audita, prepara cambios y permite aplicarlos o deshacerlos.',
    access: 'RUNQ AI context, review, apply/undo.',
    prerequisites: ['Valid project; editable to commit.'],
    prohibitions: ['AI never self-applies or controls transport.'],
  },
  'cue-queue-and-audio-transport': {
    en: 'Prepare cues separately from manual local GO/STOP/FADE.',
    es: 'Prepara cues por separado de GO/STOP/FADE locales manuales.',
    access: 'Cue workspace and transport controls.',
    prerequisites: ['Eligible DRAFT and decoded audio required.'],
    prohibitions: ['Navigation, audition, and suggestions never GO.'],
  },
  'sound-lab-modal-sfx-pilot': {
    en: 'Opt-in server pilot for one reviewed SFX/environment generation.',
    es: 'Piloto opcional en servidor para generar SFX/ambiente revisable.',
    access: 'Sound Lab; server-side Modal pilot.',
    prerequisites: ['One-request authorization and bounded plan.'],
    prohibitions: ['No voice/music, retries, or automatic cue import.'],
  },
  'rehearsal-voice-follow-and-live-transcription': {
    en: 'Rehearsal/live voice may suggest cues for manual preparation.',
    es: 'La voz en ensayo/directo puede sugerir cues para preparar.',
    access: 'Rehearsal/Voice Follow; consented live route.',
    prerequisites: ['Confirmed focus; live capture needs consent/provider.'],
    prohibitions: ['Suggestions never GO; not production-certified.'],
  },
  'browser-output-and-hardware-limits': {
    en: 'Browser Web Audio supports local playback; hardware features limited.',
    es: 'Web Audio reproduce localmente; funciones de hardware limitadas.',
    access: 'Setup diagnostics; browser audio backend.',
    prerequisites: ['Compatible browser and audio context.'],
    prohibitions: ['No isolated PFL, ASIO, multichannel, or certification.'],
  },
  'runtime-capability-overview': {
    en: 'Catalogue covers scripts, cues, AI review, SFX, voice, and audio limits.',
    es: 'Catálogo: guiones, cues, revisión IA, SFX, voz y límites de audio.',
    access: 'Ask about a named catalogue capability.',
    prerequisites: ['Name a workflow for verified details.'],
    prohibitions: ['Do not infer undocumented features.'],
  },
});

function compactCapability(capability) {
  const summary = CONTEXT_SUMMARIES[capability.id];
  return {
    id: capability.id,
    state: capability.state,
    description: { en: summary.en, es: summary.es },
    accessPath: summary.access,
    prerequisites: summary.prerequisites,
    prohibitions: summary.prohibitions,
    evidence: capability.evidence.slice(0, 2).map(({ file, line }) => ({ file, line })),
  };
}

function tokens(value) {
  return new Set(String(value ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().match(TOKEN) ?? []);
}

function isGuidedWorkflowQuestion(queryTokens) {
  const stepByStep = (queryTokens.has('step') && queryTokens.has('by')) ||
    (queryTokens.has('paso') && queryTokens.has('a'));
  const guide = ['guide', 'guiame', 'guia', 'walk', 'acompaname'].some(token => queryTokens.has(token));
  return stepByStep && guide;
}

function isWholeCatalogueQuestion(queryTokens) {
  const catalogueTerms = ['catalog', 'catalogue', 'overview', 'catalogo'];
  const allTerms = ['all', 'todas'];
  const capabilityTerms = ['capability', 'capabilities', 'capacidades', 'funciones'];
  return ['everything', ...catalogueTerms]
    .some(token => queryTokens.has(token)) ||
    (allTerms.some(token => queryTokens.has(token)) &&
      capabilityTerms.some(token => queryTokens.has(token))) ||
    (queryTokens.has('what') && queryTokens.has('can') && queryTokens.has('runq')) ||
    (queryTokens.has('que') && queryTokens.has('puede') && queryTokens.has('runq')) ||
    isGuidedWorkflowQuestion(queryTokens);
}

export function retrieveCapabilities(prompt, limit = 5) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_RESULTS) {
    throw new RangeError(`limit must be an integer from 1 to ${MAX_RESULTS}`);
  }
  const queryTokens = tokens(prompt);
  if (!queryTokens.size) return [];
  const wholeCatalogue = isWholeCatalogueQuestion(queryTokens);
  const promptText = String(prompt ?? '');
  const sourceLineReference = /\bL[1-9]\d*\b/i.test(promptText) ||
    ['line', 'lines', 'source', 'reference', 'references', 'linea']
      .some(token => queryTokens.has(token));
  const ranked = RUNQ_CAPABILITIES.map((capability, index) => {
    const keywordScore = capability.keywords.reduce((total, keyword) =>
      total + (queryTokens.has(tokens(keyword).values().next().value) ? 1 : 0), 0);
    const score = keywordScore +
      (sourceLineReference && capability.id === 'original-script-and-line-references' ? 5 : 0);
    return { capability, index, score };
  }).filter(item => wholeCatalogue || item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  if (!wholeCatalogue && !ranked.length &&
      ['help', 'ayuda', 'assist', 'support'].some(token => queryTokens.has(token))) {
    return [RUNQ_CAPABILITIES.find(item => item.id === 'runtime-capability-overview')];
  }
  const resultLimit = wholeCatalogue && arguments.length < 2
    ? Math.min(MAX_RESULTS, RUNQ_CAPABILITIES.length) : limit;
  return ranked.slice(0, resultLimit).map(({ capability }) => compactCapability(capability));
}
