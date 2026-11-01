/**
 * Audio prompt compiler: Spanish stage directions -> structured, editable
 * sound proposals with an English final prompt.
 *
 * Pure and offline: no network, no persistence, no playback, no provider
 * calls. Every proposal is a DRAFT for explicit operator review; neither this
 * module nor its outputs can start a cue or submit a generation request.
 *
 * Facts come only from the original script fragment (or a separately validated
 * model-suggestion interface). Missing information stays unresolved inside
 * `uncertainties` instead of being silently promoted to confirmed data.
 * Inferring acoustic characteristics is allowed only when every inference is
 * also returned in `inferences`/`optionalDecisions`, so an operator can
 * accept, edit or discard it.
 *
 * Intentionally out of scope: sequence playback engines, automatic GO,
 * automatic Modal/provider submissions.
 */
import { parseScript } from './script.mjs';
import { annotateDramaticStructure } from './dramaticStructure.mjs';

export const COMPILER_CONTRACT_VERSION = 1;
export const COMPILE_MODES = Object.freeze(['STRICT', 'CREATIVE']);
export const PROMPT_CATEGORIES = Object.freeze(['SFX', 'ENVIRONMENT', 'MUSIC']);
export const INTENSITY_LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']);
export const ACOUSTIC_SPACES = Object.freeze([
  'UNSPECIFIED', 'INDOOR', 'OUTDOOR', 'CORRIDOR', 'LARGE_HALL', 'UNDERGROUND',
]);
/** Generation candidates reused from the existing offline generation contract. */
export const GENERATION_MODELS = Object.freeze({
  SFX: 'stabilityai/stable-audio-3-small-sfx',
  ENVIRONMENT: 'stabilityai/stable-audio-3-small-sfx',
  MUSIC: 'ACE-Step/Ace-Step1.5',
});
export const MAX_PROMPT_CHARS = 1000;
export const MAX_SEQUENCE_BEATS = 4;
export const MAX_SCAN_CANDIDATES = 250;

const MAX_FRAGMENT_CHARS = 400;
const MAX_FIELD_CHARS = 300;
const MAX_EVIDENCE_CHARS = 250;
const MIN_DURATION = 1;
const MAX_DURATION = 12;

export class SoundPromptCompilerError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'SoundPromptCompilerError';
  }
}

const LINE = /^L[1-9]\d*$/;

/* ------------------------------------------------------------------ */
/* Normalization preserving original string indexes 1:1                */
/* ------------------------------------------------------------------ */

function foldChar(char) {
  return char.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

/** Same-length lowercase deaccented copy so every index maps to the original. */
function fold(text) {
  if (typeof text !== 'string') {
    throw new SoundPromptCompilerError('Fragment must be a string');
  }
  return [...text].map(foldChar).join('');
}

/** Quote a matched span from the ORIGINAL text using mapped indexes. */
function spanOf(original, start, end) {
  const raw = original.slice(start, end).replace(/\s+/g, ' ').trim();
  const cleaned = raw.replace(/^[-–—:;,.\s]+/, '').replace(/[-–—:;,.\s]+$/, '').trim();
  if (!cleaned || cleaned.length > MAX_EVIDENCE_CHARS) return null;
  return cleaned;
}

function execAt(pattern, folded) {
  pattern.lastIndex = 0;
  const result = pattern.exec(folded);
  pattern.lastIndex = 0;
  return result;
}

/* ------------------------------------------------------------------ */
/* Lexicon (keys are lowercase, deaccented fragments)                  */
/* ------------------------------------------------------------------ */

const SOURCES = Object.freeze([
  { id: 'glassware', english: 'a crystal drinking glass', category: 'SFX',
    match: /\b(copas?|vasos?|botellas?|botellon(es)?|jarron(?:es)?|jarras?)\b/ },
  { id: 'window-glass', english: 'window glass', category: 'SFX', match: /\b(vidrios?|cristal(?:es)?)\b/ },
  { id: 'mirror', english: 'a mirror', category: 'SFX', match: /\bespejos?\b/ },
  { id: 'door', english: 'a wooden door', category: 'SFX', match: /\b(puertas?|porton(?:es)?|portazos?)\b/ },
  { id: 'window', english: 'a window', category: 'SFX', match: /\bventanas?\b/ },
  { id: 'footsteps', english: 'footsteps', category: 'SFX',
    match: /\b(pasos|pisadas?|tacon(?:es)?|correteos?|paso\s+de\s+[a-z]+)\b/ },
  { id: 'knock', english: 'knuckles on wood', category: 'SFX',
    match: /\b(llamada? en la puerta|llaman a la puerta|tocan a la puerta|golpes? en la puerta)\b/ },
  { id: 'impact', english: 'one blunt percussion hit', category: 'SFX',
    match: /\b(golpe seco|un golpe[s]? en|golpea[n]? (?:la|el) (?:mesa|piso|pared|brazo)|sacudida[s]?|latigazo)\b/ },
  { id: 'fall-object', english: 'an unidentified falling object', category: 'SFX',
    match: /\b(?:algo cae|cae algo|se cae|caen los\w+|se caen los\w+)\b/ },
  { id: 'phone', english: 'a telephone bell', category: 'SFX', match: /\b(telefonos?|timbres?)\b/ },
  { id: 'bell', english: 'a bell', category: 'SFX', match: /\b(campanas?|campanillas?|campanadas?|gong)\b/ },
  { id: 'clock', english: 'a mechanical clock', category: 'SFX', match: /\breloj(?:es)?\b/ },
  { id: 'clock-tick', english: 'clock ticking', category: 'ENVIRONMENT',
    match: /\b(tic[\s-]?tic){2,}|tic[\s-]?tac\b/ },
  { id: 'shot', english: 'a gunshot', category: 'SFX',
    match: /\b(?:disparos?|detonacion(?:es)?|escopetas?|pistolas?)\b/ },
  { id: 'explosion', english: 'an explosion', category: 'SFX', match: /\b(explosion(?:es)?|dinamita)\b/ },
  { id: 'thunder', english: 'a thunderclap', category: 'SFX', match: /\btruenos?\b/ },
  { id: 'lightning', english: 'a lightning strike', category: 'SFX', match: /\brayos?\b/ },
  { id: 'rain', english: 'rainfall', category: 'ENVIRONMENT',
    match: /\b(lluvia|llovizna|aguacero|diluvio)\b/ },
  { id: 'wind', english: 'wind', category: 'ENVIRONMENT',
    match: /\b(vientos?|vendaval(es)?|ventisca[s]?)\b/ },
  { id: 'water', english: 'running water', category: 'ENVIRONMENT',
    match: /\b(grifos?|cascadas?|riachuelos?|torrentes?|fuentes?|chorros? de agua|agua (?:cae|corre|fluye|corriendo))\b/ },
  { id: 'fire', english: 'a burning fire', category: 'ENVIRONMENT',
    match: /\b(hogueras?|brasas?|estufas?|chimeneas?)\b/ },
  { id: 'engine', english: 'a vehicle engine', category: 'SFX',
    match: /\b(?:motor(?:es)?|coches?|autos?|automovil\w*|carros?|camion(?:es)?|motos?|marchas? de motor)\b/ },
  { id: 'train', english: 'a railway train', category: 'SFX', match: /\b(?:tren(?:es)?|locomotoras?)\b/ },
  { id: 'furniture', english: 'a wooden piece of furniture', category: 'SFX',
    match: /\b(?:sillas?|banquetas?|taburetes?|escritorios?|armarios?|estantes?|banca)\b/ },
  { id: 'applause', english: 'applause', category: 'ENVIRONMENT', match: /\baplausos?\b/ },
  { id: 'crowd-murmur', english: 'a crowd murmur', category: 'ENVIRONMENT',
    match: /\b(murmullos?|rumor(?:es)? de (?:gente|multitud|voces)|conversaciones|charla)\b/ },
  { id: 'crowd-shout', english: 'shouting voices', category: 'SFX', match: /\b(?:gritos?|grita\w*|(?:voz|voces)\s+(?:que\s+)?(?:gritan|exigen))\b/ },
  { id: 'laughter', english: 'laughter', category: 'SFX', match: /\b(risas?|carcajadas?)\b/ },
  { id: 'breath-vocal', english: 'a human breath or vocal sound', category: 'SFX',
    match: /\b(?:suspiros?|respiracion(?:es)?|respirar|llantos?|sollozos?|jadeos?)\b/ },
  { id: 'music', english: 'music', category: 'MUSIC',
    match: /\b(musicas?|melodias?|cancion(?:es)?|vals(?:es)?|tangos?|piano|violin(?:es)?|guitarras?|orquestas?|radios?|fonografos?)\b/ },
  { id: 'generic-noise', english: 'an unspecified percussive stage event', category: 'SFX',
    match: /\b(ruidos?|estruendos?|silbidos?|chisporroteo)\b/ },
  { id: 'generic-heard', english: 'an unspecified stage sound', category: 'SFX',
    match: /\b(se oye|se oyen|se oyo|se oieron|se escuch\w*|se percibe|se siente)\b/ },
]);

const ACTIONS = {
  open: /\b(se abre|se abre[n]?|se abrio|abre|abren|abrio|abriendo)\b/,
  close: /\b(se cierra|cierra[n]?|cerrando|se cerro)\b/,
  slam: /\b(portazos?|de golpe|estremece|bate|batiendo)\b/,
  creak: /\b(?:chirri\w*|cruj\w*|rechin\w*|gruni\w*)\b/,
  knock: /\b(tocan|golpean|llaman)\b/,
  break: /\b(?:romp\w*|estall\w*|anicos|pedazos|revento|reventar)\b/,
  ring: /\b(?:suena\w*|tocan|timbra\w*|repica\w*|campanadas?)\b/,
  striking: /\b(?:estalla\w*|retumb\w*|atraviesa\w*|detona\w*)\b/,
  falling: /\b(?:cae|caen|desplom\w*|rueda\w*|derram\w*|vierte)\b/,
  approach: /\b(?:se acerca|se aproxima|acerc\w*)\b/,
  recede: /\b(?:se aleja|alej\w*|difumina\w*)\b/,
  run: /\b(corren|corriendo|correteo)\b/,
  continue: /\b(continua|continuan|sigue[n]? sonando|se mantiene|persist\w*)\b/,
  start: /\b(empieza|comienza|arranca|arrancando)\b/,
  pass: /\b(pasa[n]?|cruza|atraviesa|llega desde)\b/,
  chime: /\b(dan las|da la[s]? horas?|dando las|marcando las horas|da la una|da las (?:dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce))\b/,
};

const INTENSITY_MATCHERS = [
  { level: 'VERY_HIGH', pattern: /\b(?:atronador\w*|estruendoso\w*|desgarrantes?|paralizantes?|terrible)\b/ },
  { level: 'HIGH', pattern: /\b(?:fuertes?|gran |intensos?|estrepitoso\w*|con fuerza|vibrante)\b/ },
  { level: 'LOW', pattern: /\b(?:tenues?|suaves?|leves?|apenas perceptible|apenas se oyen|inapreciable|despacios?|lento[s]?)\b/ },
];

const OFFSTAGE_PATTERN = /\b(fuera de escena|desde fuera|en el foro|tras (?:el|la) (?:telon|bambalin\w*|cortina)|bambalinas|desde bambalina[s]?)\b/;
const FAR_PATTERN = /\b(?:a lo lejos|al fondo|desde lejos|lejanos?|lejan\w*|lejos|distantes?)\b/;
const SPACE_MATCHERS = [
  { id: 'CORRIDOR', pattern: /\b(pasillos?|corredor(?:es)?|escaleras?)\b/ },
  { id: 'OUTDOOR', pattern: /\b(calles?|bosques?|jardin(?:es)?|plazas?|montes?|patios? de fachada|estacion (?:de|->)?tren|afuera|exterior|a la intemperie)\b/ },
  { id: 'LARGE_HALL', pattern: /\b(iglesias?|catedral(?:es)?|salon(?: de )?baile|auditorios?|hangar(?:es)?)\b/ },
  { id: 'INDOOR', pattern: /\b(dentro|habitacion(?:es)?|salon|cocinas?|oficinas?|cuartos?|interior(?:es)?|apartamentos?|estudios?)\b/ },
  { id: 'UNDERGROUND', pattern: /\b(subterraneos?|subsuelos?|sotanos?|bodegas?|cuevas?)\b/ },
];

const MATERIALS = [
  { english: 'crystal', pattern: /\bde cristal\b/ },
  { english: 'wood', pattern: /\bde madera\b/ },
  { english: 'metal', pattern: /\bde metal\b/ },
  { english: 'iron', pattern: /\bde hierro\b/ },
  { english: 'marble', pattern: /\bde marmol\b/ },
];

const DEFAULT_MATERIALS = {
  door: 'wooden',
  bell: 'bronze metal',
  phone: 'vintage metal',
};

const AMBIENCE_STACK = new Set(['rain', 'wind', 'water', 'fire']);

/* Default duration/loop per source id in seconds (bounded to the SFX lab 1..12 s). */
const SOURCE_DEFAULTS = {
  door: { duration: 5, loop: false },
  glassware: { duration: 4, loop: false },
  'window-glass': { duration: 4, loop: false },
  mirror: { duration: 4, loop: false },
  window: { duration: 5, loop: false },
  footsteps: { duration: 6, loop: false },
  knock: { duration: 5, loop: false },
  impact: { duration: 3, loop: false },
  'fall-object': { duration: 4, loop: false },
  phone: { duration: 10, loop: false },
  bell: { duration: 10, loop: false },
  clock: { duration: 8, loop: false },
  'clock-tick': { duration: 12, loop: true },
  shot: { duration: 3, loop: false },
  explosion: { duration: 6, loop: false },
  thunder: { duration: 8, loop: false },
  lightning: { duration: 8, loop: false },
  rain: { duration: 12, loop: true },
  wind: { duration: 12, loop: true },
  water: { duration: 12, loop: true },
  fire: { duration: 12, loop: true },
  engine: { duration: 12, loop: false },
  train: { duration: 12, loop: false },
  furniture: { duration: 4, loop: false },
  applause: { duration: 12, loop: true },
  'crowd-murmur': { duration: 12, loop: true },
  'crowd-shout': { duration: 8, loop: false },
  laughter: { duration: 8, loop: false },
  'breath-vocal': { duration: 6, loop: false },
  music: { duration: 12, loop: true },
  'generic-noise': { duration: 4, loop: false },
  'generic-heard': { duration: 4, loop: false },
};

/* ------------------------------------------------------------------ */
/* Prompt phrase tables                                                */
/* ------------------------------------------------------------------ */

const SPACE_PHRASES = {
  INDOOR: 'Indoor room acoustics, close and slightly dry, no big hall tail.',
  OUTDOOR: 'Open-air outdoor acoustics with a light unechoed bounce.',
  CORRIDOR: 'Inside a narrow corridor, hard walls close, short focused reflections.',
  LARGE_HALL: 'Inside a large reverberant space with a church-like tail.',
  UNDERGROUND: 'Underground acoustics, dark, damp and faintly resonant.',
  UNSPECIFIED: 'Acoustic space unspecified: keep it neutral, without a strong room signature.',
};

const CATEGORY_TAILS = {
  SFX: 'Dry theatrical sound effect, no music, no voices, no background ambience.',
  ENVIRONMENT: 'Realistic theatrical ambience, no music, no voices.',
  MUSIC: 'A single cohesive music cue appropriate to the scripted scene, no sound effects.',
};

/** Creative mode only. Always surfaced as an inference in the proposal data. */
const CREATIVE_ADDITIONS = {
  glassware: 'a few stray shards are given a quick glassy tick for one second after the main burst',
  window: 'the sash gets a faint yielding shake before the movement ends',
  mirror: 'a brief shimmering tone rings out in the frame after the break',
  door: 'the door frame emits one faint sympathetic shudder as the movement stops',
  footsteps: 'the floor gives a light extra creak under the first step before the pace settles',
  knock: 'one calm pause follows the knocks before total quiet',
  bell: 'a clear metallic decay is allowed to ring out naturally after the strike',
  phone: 'the room tone dominates between rings, keeping the pattern steady',
  rain: 'the rainfall level drifts subtly up and down so the bed feels alive across the loop',
  wind: 'occasional gusts change level and texture so the ambience keeps a natural breath',
  water: 'fine bubbling detail under the main flow makes the texture convincing',
  'crowd-murmur': 'individual voices rise and fall softly, never intelligible, always a texture',
};

/** English openers and action phrasing; STRICT text (+CREATIVE variant when provided). */
const TEMPLATES = {
  glassware: {
    opener: 'A crystal drinking glass',
    break: { strict: 'shatters onto an unspecified floor in one brittle bright burst',
      creative: 'shatters onto a hard floor in one bright burst of ringing shards' },
    falling: 'falls to the floor and knocks down briefly',
    churn: 'moves with one small unspecified glass impact' },
  'window-glass': {
    opener: 'Window glass', break: 'shatters into scattered fragments' },
  mirror: { opener: 'A mirror', break: 'shatters into ragged slivers' },
  door: {
    opener: 'A wooden door',
    open: { strict: 'swings open once, hinges unspecified',
      creative: 'swings open slowly on dry hinges' },
    close: 'closes once with a firm latch',
    slam: { strict: 'slams shut in one solid impact',
      creative: 'swings shut with one heavy solid slam and a subtle frame rattle' },
    creak: { strict: 'creaks slowly while it moves on its hinges',
      creative: 'creaks slowly on dry hinges, one long drawn tone' },
    churn: 'moves once without a described action' },
  window: {
    opener: 'A window', open: 'swings open once',
    close: 'closes once', creak: 'creaks while it slides' },
  footsteps: {
    opener: 'A series of footsteps',
    approach: { strict: 'approach steadily',
      creative: 'approach steadily, closer and clearer with each step' },
    recede: { strict: 'walk away, receding step by step',
      creative: 'walk away unhurried, fading with every receding step' },
    run: { strict: 'run quickly with an urgent cadence',
      creative: 'sprint past in a hurried, uneven cadence' },
    churn: 'walk through the space with an unspecified pace' },
  knock: { opener: 'Knuckles on wood', knock: 'place a patient repeated knocking' },
  impact: { opener: 'One blunt percussion hit', churn: 'lands once, source unspecified' },
  'fall-object': {
    opener: 'An unspecified falling object',
    falling: { strict: 'drops and lands with a named-less impact',
      creative: 'drops and lands with a dull heavy impact plus a small secondary skitter' },
    churn: 'drops without described impact' },
  phone: { opener: 'A telephone bell', ring: 'rings in bright mechanical bursts', churn: 'rings brightly' },
  bell: { opener: 'A bell', ring: 'rings out one clear strike', chime: 'counts out its strikes' },
  clock: { opener: 'A mechanical clock', churn: 'sounds out once', chime: 'counts out the hour' },
  'clock-tick': { opener: 'Steady clock ticking', churn: 'keeps a mechanical ambience bed' },
  shot: { opener: 'A single gunshot', churn: 'erupts in one short blast' },
  explosion: { opener: 'An explosion', churn: 'detonates with heavy chest force' },
  thunder: { opener: 'A thunderclap', churn: 'cracks overhead with a rolling tail' },
  lightning: { opener: 'A lightning strike', churn: 'with one sharp atmospheric crack' },
  rain: {
    opener: 'Steady rainfall',
    churn: { strict: 'holds a continuous rainfall bed',
      creative: 'establishes a continuous rainfall bed with real vertical depth' } },
  wind: {
    opener: 'Steady wind',
    churn: { strict: 'sustains an ambient wind bed',
      creative: 'sustains an ambient wind bed with changing gust shapes' } },
  water: { opener: 'Running water', churn: 'flows steadily as an ambient texture' },
  fire: { opener: 'A burning fire', churn: 'hums with a gentle crackling ambient bed' },
  engine: {
    opener: 'A vehicle engine', pass: 'passes by with a rising and fading engine tone',
    start: 'starts up and settles into an idle', churn: 'hums nearby' },
  train: { opener: 'A railway train', pass: 'rolls past with mechanical rhythm', churn: 'passes in the distance' },
  furniture: {
    opener: 'A wooden piece of furniture',
    falling: { strict: 'drops onto the floor with a heavy thump',
      creative: 'drops onto the floor with a heavy wooden thump followed by a settling wobble' },
    break: 'breaks apart with a splintering crack',
    churn: 'moves with a wooden scrape' },
  applause: { opener: 'A wave of applause', churn: 'rises as an audience texture' },
  'crowd-murmur': { opener: 'A quiet crowd murmur', churn: 'settles in as an ambient bed' },
  'crowd-shout': { opener: 'Crowd voices', churn: 'rise as a scattered shout' },
  laughter: { opener: 'Laughter', churn: 'rises and falls' },
  'breath-vocal': { opener: 'A human breath or sigh', churn: 'is heard softly' },
  music: {
    opener: 'A music cue', start: 'starts playing from the indicated source',
    churn: 'plays on from the indicated source' },
  'generic-noise': { opener: 'An unspecified percussive stage event', churn: 'rings out without identified source' },
  'generic-heard': { opener: 'An unspecified stage sound', churn: 'is heard with no named source' },
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const NUMBER_WORD_VALUES = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};
const COUNT_WORDS_EN = ['once', 'twice', 'three times', 'four times', 'five times',
  'six times', 'seven times', 'eight times', 'nine times', 'ten times'];

function clampDuration(value) {
  return Math.max(MIN_DURATION, Math.min(MAX_DURATION, Math.round(value)));
}

function safeIdChunk(value, maximum = 24) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, maximum);
}

function composeProposalId(projectId, lineId, index) {
  return ['SPC', safeIdChunk(String(projectId ?? 'private-script')), lineId ?? 'L0',
    String(index)].join('-');
}

const capitalized = value => value.charAt(0).toLocaleUpperCase() + value.slice(1);
const ORDINALS = ['first', 'second', 'third', 'fourth'];

/* ------------------------------------------------------------------ */
/* Clause splitting                                                    */
/* ------------------------------------------------------------------ */

const CONNECTOR_KEYWORDS = /\b(?:y luego|y despues|luego|despues|a continuacion|seguidas?|instantes? despues|tras (?:ello|eso|esto)|mientras(?: que)?|al mismo tiempo)\b/;
const CLAUSE_BOUNDARIES = /(?:\.)|(?:\s+(?:y luego|y despues|luego|despues|a continuacion|seguidas?|instantes? despues|tras (?:ello|eso|esto)|mientras(?: que)?|al mismo tiempo)\s*)/g;

/**
 * Ordered clauses with the connector that links them to the PREVIOUS sound
 * clause. Indexes map into the fragment so evidence quotes the verbatim text.
 */
function splitIntoClauses(fragment) {
  const folded = fold(fragment);
  const shapes = [];
  let start = 0;
  let pendingConnector = null;
  CLAUSE_BOUNDARIES.lastIndex = 0;
  let match;
  while ((match = CLAUSE_BOUNDARIES.exec(folded)) !== null) {
    const text = fragment.slice(start, match.index);
    if (text.trim().length || shapes.length === 0) {
      shapes.push({
        originalText: text,
        foldedText: folded.slice(start, match.index),
        originalStart: start,
        originalEnd: match.index,
        connector: pendingConnector,
      });
      pendingConnector = null;
    }
    pendingConnector = CONNECTOR_KEYWORDS.exec(match[0])?.[0].trim().toLocaleLowerCase() ?? null;
    start = match.index + match[0].length;
  }
  shapes.push({
    originalText: fragment.slice(start),
    foldedText: folded.slice(start),
    originalStart: start,
    originalEnd: folded.length,
    connector: pendingConnector,
  });
  return shapes.filter(shape => shape.originalText.trim().length > 0);
}

/* ------------------------------------------------------------------ */
/* Field detectors                                                     */
/* ------------------------------------------------------------------ */

function detectIntensity(folded) {
  for (const entry of INTENSITY_MATCHERS) {
    const matcher = execAt(entry.pattern, folded);
    if (matcher) return { level: entry.level, evidence: matcher[0] };
  }
  return null;
}

function detectSpace(folded) {
  for (const entry of SPACE_MATCHERS) {
    const matcher = execAt(entry.pattern, folded);
    if (matcher) return { id: entry.id, evidence: matcher[0] };
  }
  return null;
}

function detectMaterial(folded) {
  for (const entry of MATERIALS) {
    const matcher = execAt(entry.pattern, folded);
    if (matcher) return { english: entry.english, evidence: matcher[0] };
  }
  return null;
}

function detectCount(folded) {
  const matcher = execAt(
    /\b(un[ao]?|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(?:pasos|disparos?|campanadas?|golpes?|gritos?|toques?|portazos?|aplausos?|veces)\b/,
    folded,
  );
  if (!matcher) return null;
  const count = NUMBER_WORD_VALUES[matcher[1]] ?? null;
  return { count, evidence: matcher[0] };
}

function detectOffstageDistance(folded) {
  const offstage = execAt(OFFSTAGE_PATTERN, folded);
  const far = execAt(FAR_PATTERN, folded);
  return {
    offstage: Boolean(offstage),
    offstageEvidence: offstage ? offstage[0] : null,
    far: Boolean(far),
    farEvidence: far ? far[0] : null,
  };
}

/* ------------------------------------------------------------------ */
/* Single-clause detection                                             */
/* ------------------------------------------------------------------ */

// A source noun introduced as a place ("detrás de la puerta", "se acercan a la
// puerta") locates the event instead of producing it. "a/en/contra la puerta"
// after a contact verb (llaman, golpes) still names the struck object.
const LOCATIVE_BEFORE = new RegExp('\\b(?:(?:detras|delante|cerca|lejos|alrededor|encima|debajo|dentro|fuera|' +
  'al otro lado|a traves) del?|(?:junto|frente) al?|tras|hacia|desde|hasta|' +
  '(?:se )?(?:acerca|aleja|aproxima|llega|dirige|vuelve|camina|corre)n? (?:a|al|hacia|hasta|del?|desde))' +
  '\\s+(?:(?:la|el|las|los|una?|unos|unas)\\s+)?$');
const LOCATED_OBJECT_ACTIONS = ['open', 'close', 'slam', 'creak', 'knock', 'break'];

/** Compile one clause into a structured detection or `{ silent: true }`. */
function compileDetection(clause) {
  const original = clause.originalText;
  const folded = clause.foldedText;
  const matches = [];
  for (const source of SOURCES) {
    const matcher = execAt(source.match, folded);
    if (matcher) {
      matches.push({ source, start: matcher.index, end: matcher.index + matcher[0].length });
    }
  }
  if (!matches.length) return { silent: true };

  const locative = matched => LOCATIVE_BEFORE.test(folded.slice(Math.max(0, matched.start - 48), matched.start));
  // "corre a la puerta y la abre": the reached object still sounds when acted on.
  if (matches.every(locative) &&
      !LOCATED_OBJECT_ACTIONS.some(key => execAt(ACTIONS[key], folded))) return { silent: true };
  let primary = matches.find(matched => !locative(matched)) ?? matches[0];
  // Windows/panes mentioned by the rain ("lluvia sobre los cristales") are part
  // of the ambience detail, not a second percussive event.
  if (primary.source.id === 'window-glass') {
    const earlierAmbience = matches.find(matched =>
      AMBIENCE_STACK.has(matched.source.id) && matched.start < primary.start);
    if (earlierAmbience) primary = earlierAmbience;
  }
  const detection = {
    silent: false,
    source: primary.source,
    layered: [],
    actionKey: null,
    actionEvidence: null,
    sourceSpan: { start: primary.start, end: primary.end },
    sourceEvidence: spanOf(original, primary.start, primary.end),
    intensity: null,
    space: null,
    material: null,
    count: null,
    offstageDistance: { offstage: false, offstageEvidence: null, far: false, farEvidence: null },
    explicitDetail: null,
    musicSourceDetail: null,
    continuity: false,
    defaults: SOURCE_DEFAULTS[primary.source.id] ?? {
      duration: 4, loop: primary.source.category !== 'SFX',
    },
    clause,
  };
  const midpoint = (detection.sourceSpan.start + detection.sourceSpan.end) / 2;

  const actionMatches = [];
  for (const [key, pattern] of Object.entries(ACTIONS)) {
    const matcher = execAt(pattern, folded);
    if (matcher) actionMatches.push({ key, index: matcher.index, length: matcher[0].length });
  }
  if (actionMatches.length) {
    actionMatches.sort((first, second) =>
      Math.abs((first.index + first.length / 2) - midpoint) -
      Math.abs((second.index + second.length / 2) - midpoint));
    const chosen = actionMatches[0];
    detection.actionKey = chosen.key;
    detection.actionEvidence = spanOf(original, chosen.index, chosen.index + chosen.length);
  }
  const actionKeys = actionMatches.map(matched => matched.key);

  // Amberment rules: breakables and mirrors participate only with impact verbs.
  if (['glassware', 'window-glass', 'mirror', 'furniture'].includes(detection.source.id)) {
    const impactful = ['break', 'falling', 'striking'].some(key => actionKeys.includes(key));
    if (detection.source.id === 'mirror' && !actionKeys.includes('break')) return { silent: true };
    if (!impactful) return { silent: true };
  }
  if (detection.source.id === 'window' &&
      !['open', 'close', 'creak', 'break'].some(key => actionKeys.includes(key))) {
    return { silent: true };
  }
  // A clock on set ("un reloj de utilería", "un reloj roto") is a prop until it sounds.
  if (detection.source.id === 'clock' &&
      !['chime', 'ring', 'start', 'continue'].some(key => actionKeys.includes(key)) &&
      !matches.some(matched => matched.source.id === 'generic-heard')) {
    return { silent: true };
  }

  // Ambience layering: rain/wind/water/fire nouns co-listed as one bed.
  if (AMBIENCE_STACK.has(detection.source.id)) {
    for (const other of matches) {
      if (other.source !== detection.source && AMBIENCE_STACK.has(other.source.id)) {
        detection.layered.push({
          source: other.source,
          evidence: spanOf(original, other.start, other.end),
        });
      }
    }
  }

  detection.intensity = detectIntensity(folded);
  detection.space = detectSpace(folded);
  detection.material = detectMaterial(folded);
  detection.count = detectCount(folded);
  detection.offstageDistance = detectOffstageDistance(folded);
  detection.continuity = actionKeys.includes('continue');

  if (detection.source.id === 'rain') {
    const detail = execAt(/\bsobre\s+(?:l[oa]s|el|un[ao])?\s*(?:cristales|vidrios|ventanas|tejados?|techo)\b/, folded);
    detection.explicitDetail = detail ? spanOf(original, detail.index, detail.index + detail[0].length) : null;
  }
  if (detection.source.id === 'music') {
    const detail = execAt(/\b(por la radio|en la radio|de la radio)\b/, folded);
    detection.musicSourceDetail = detail ? spanOf(original, detail.index, detail.index + detail[0].length) : null;
  }
  return detection;
}

/* ------------------------------------------------------------------ */
/* Public compile entry                                                */
/* ------------------------------------------------------------------ */

export function normalizeCompileMode(value) {
  if (value === 'STRICT' || value === 'CREATIVE') return value;
  throw new SoundPromptCompilerError('Compile mode must be STRICT or CREATIVE');
}

const FRAGMENT_KINDS = Object.freeze(['STAGE_DIRECTION', 'INLINE_DIRECTION']);

/**
 * Compile one acotación (or inline parenthetical direction) into 0..4
 * structured sound proposals ordered by sequence.
 * Returns [] when nothing acoustic is documented in the fragment.
 */
export function compileSoundProposals(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new SoundPromptCompilerError('Compile input must be an object');
  }
  if (typeof input.fragment !== 'string' || !input.fragment.trim() ||
      input.fragment.length > MAX_FRAGMENT_CHARS) {
    throw new SoundPromptCompilerError(
      'Fragment missing or over ' + MAX_FRAGMENT_CHARS + ' characters');
  }
  if (input.sourceLineId !== undefined && input.sourceLineId !== null &&
      (typeof input.sourceLineId !== 'string' || !LINE.test(input.sourceLineId))) {
    throw new SoundPromptCompilerError('sourceLineId must be an L# reference or null');
  }
  if (input.projectId !== undefined && input.projectId !== null &&
      (typeof input.projectId !== 'string' || input.projectId.length > 120)) {
    throw new SoundPromptCompilerError('Invalid project identifier');
  }
  const fragmentKind = input.fragmentKind ?? 'STAGE_DIRECTION';
  if (!FRAGMENT_KINDS.includes(fragmentKind)) {
    throw new SoundPromptCompilerError('Unsupported fragmentKind');
  }
  const mode = normalizeCompileMode(input.mode ?? 'STRICT');
  return assembleProposals({
    fragment: input.fragment.trim(),
    mode,
    projectId: input.projectId ?? null,
    sourceLineId: input.sourceLineId ?? null,
    fragmentKind,
  });
}

function assembleProposals(context) {
  const detections = [];
  for (const clause of splitIntoClauses(context.fragment)) {
    const detection = compileDetection(clause);
    if (detection.silent) continue;
    detections.push(detection);
  }
  const beats = detections.slice(0, MAX_SEQUENCE_BEATS);
  const overflows = detections.length - beats.length;
  return beats.map((detection, index) =>
    finalizeProposal(detection, { ...context, index, total: beats.length, overflows }));
}

const ACTION_NAMES = {
  open: 'swings open once', close: 'closes once, briefly and evenly',
  slam: 'slams once with a single heavy impact', creak: 'creaks or scrapes while it moves',
  knock: 'is knocked or struck repeatedly', break: 'shatters into fragments',
  ring: 'rings out', striking: 'strikes or detonates once', falling: 'falls and lands',
  approach: 'approaches from farther away', recede: 'recedes or walks away',
  run: 'runs quickly across the space', continue: 'continues without restarting',
  start: 'starts sounding', pass: 'passes by or through', chime: 'chimes out the hour',
};

function actionLabel(detection) {
  const key = detection.actionKey;
  return key ? (ACTION_NAMES[key] ?? 'produces one acoustic event')
    : 'produces one unspecified acoustic event';
}

const INTENSITY_PHRASES = {
  VERY_HIGH: 'At a very loud, room-shaking volume',
  HIGH: 'At a clearly loud volume',
  MEDIUM: 'At moderate volume',
  LOW: 'At a soft, understated volume',
};

function finalizeProposal(detection, context) {
  const { mode, index, total, overflows, fragment, projectId, sourceLineId, fragmentKind } = context;
  const explicit = [];
  const inferences = [];
  const optionalDecisions = [];
  const uncertainties = [];

  pushEvidence(explicit, 'Fuente sonora constatada en el guion', detection.sourceEvidence);
  if (detection.actionEvidence) {
    explicit.push(`Acción constatada: «${detection.actionEvidence}»`);
  } else {
    uncertainties.push('La acción exacta no está descrita en el guion: se propuso un evento indefinido que el operador debe concretar.');
    inferences.push('El tipo de acción se infirió del sustantivo acústico, no de un verbo documentado.');
  }
  pushEvidence(explicit, 'Material declarado', detection.material?.evidence);
  pushEvidence(explicit, 'Espacio acústico declarado', detection.space?.evidence);
  if (detection.offstageDistance.offstage) {
    explicit.push(`Sonido fuera de escena: «${detection.offstageDistance.offstageEvidence}»`);
  }
  pushEvidence(explicit, 'Distancia lejana', detection.offstageDistance.farEvidence);
  pushEvidence(explicit, 'Cantidad declarada', detection.count?.evidence);
  pushEvidence(explicit, 'Detalle explicito de la escena', detection.explicitDetail);
  pushEvidence(explicit, 'Origen del contenido musical', detection.musicSourceDetail);
  for (const layer of detection.layered) {
    explicit.push(`Ambiente combinado documentado en el mismo enunciado: ${layer.evidence ?? layer.source.english}`);
  }

  const intensity = detection.intensity?.level ?? 'MEDIUM';
  if (!detection.intensity) {
    inferences.push('Se asume intensidad media por defecto; el guion no indica volumen.');
  }
  const spaceId = detection.space?.id ?? 'UNSPECIFIED';
  if (!detection.space) {
    inferences.push('Espacio acústico no documentado: se mantiene neutro y no se inventa tipo de sala.');
  }
  const durationSeconds = clampDuration(detection.defaults.duration);
  inferences.push(`Duración sugerida de ${durationSeconds} s derivada del tipo de efecto; ajústala al tempo de escena.`);
  const material = detection.material?.english ??
    (mode === 'CREATIVE' ? DEFAULT_MATERIALS[detection.source.id] ?? null : null);
  if (material && !detection.material) {
    inferences.push(`Material «${material}» propuesto por plausibilidad acústica (solo modo creativo); no figura en el guion.`);
  }
  if (detection.offstageDistance.offstage) {
    uncertainties.push('El punto exacto de origen fuera de escena no está descrito: mantén volumen y color lejanos al reproducir.');
  }
  if (['breath-vocal', 'crowd-shout'].includes(detection.source.id)) {
    uncertainties.push('Sonido humano natural: puede ser interpretado por actores o props en vivo; no es obligatorio que exista archivo.');
  }
  if (detection.continuity) {
    uncertainties.push('El texto indica continuidad: el sonido puede estar ya sonando; el operador decide si extiende un ambiente o inicia otro GO.');
  }
  if (detection.source.id === 'generic-heard' || detection.source.id === 'generic-noise' ||
      detection.source.id === 'fall-object') {
    uncertainties.push('El guion no nombra la fuente concreta del sonido: conserva la incertidumbre o decide una fuente concreta antes de generar.');
  }

  let sequence = null;
  if (total > 1) {
    const connector = detection.clause.connector ?? null;
    sequence = {
      position: index + 1,
      total,
      relation: index === 0 ? 'FIRST_IN_SEQUENCE'
        : /mientras|mismo tiempo/.test(connector ?? '') ? 'STARTS_WITH_PREVIOUS'
        : /luego|despues|continuacion|seguidas?|instantes|tras/.test(connector ?? '') ? 'SHORT_MOMENT_LATER'
        : 'AFTER_PREVIOUS_BEAT',
      anchorEvidence: connector,
    };
    optionalDecisions.push('La acotación encadena varias acciones sonoras: ensáyalas por separado y decide el solape o la pausa entre ellas.');
    if (sequence.relation === 'STARTS_WITH_PREVIOUS') {
      optionalDecisions.push('«Mientras» sugiere solape: este sonido puede empezar antes de terminar el anterior.');
    }
    if (sequence.relation === 'SHORT_MOMENT_LATER') {
      optionalDecisions.push('Conectores como «luego» o «después» sugieren un intervalo breve tras el beat previo.');
    }
  }
  if (overflows > 0) {
    uncertainties.push(`La acotación es muy extensa: se compilaron los primeros ${MAX_SEQUENCE_BEATS} eventos; ${overflows} acción(es) quedaron sin propuesta.`);
  }

  const confidence = scoreConfidence(detection);
  const proposal = {
    contractVersion: COMPILER_CONTRACT_VERSION,
    id: composeProposalId(projectId, sourceLineId, index + 1),
    projectId: projectId ?? null,
    scriptReference: sourceLineId,
    sourceLineId,
    fragmentKind,
    mode,
    originalFragment: fragment,
    fragmentEvidence: spanOf(fragment, detection.clause.originalStart, detection.clause.originalEnd) ??
      fragment.slice(0, MAX_EVIDENCE_CHARS),
    category: detection.source.category,
    soundSource: material && !detection.source.english.includes(material)
      ? `${material} ${detection.source.english}`
      : detection.source.english,
    action: actionLabel(detection),
    material,
    intensity,
    acousticSpace: { id: spaceId, label: SPACE_PHRASES[spaceId] ?? SPACE_PHRASES.UNSPECIFIED },
    offstage: detection.offstageDistance.offstage,
    offstageEvidence: detection.offstageDistance.offstageEvidence,
    sequence,
    suggestedDurationSeconds: durationSeconds,
    loop: Boolean(detection.defaults.loop) ||
      (detection.source.category === 'ENVIRONMENT' && ['rain', 'wind', 'water', 'fire', 'clock-tick', 'crowd-murmur', 'applause'].includes(detection.source.id)),
    explicitElements: explicit,
    inferences,
    optionalDecisions,
    uncertainties,
    confidence: confidence.value,
    confidenceLevel: confidence.level,
    confidenceReasons: confidence.reasons,
    prompt: null,
    promptEdited: false,
    model: GENERATION_MODELS[detection.source.category],
    fieldProvenance: {
      category: 'SCRIPT',
      soundSource: detection.sourceEvidence ? 'SCRIPT' : 'INFERRED',
      action: detection.actionEvidence ? 'SCRIPT' : 'INFERRED',
      material: detection.material ? 'SCRIPT' : 'INFERRED',
      intensity: detection.intensity ? 'SCRIPT' : 'INFERRED',
      acousticSpace: detection.space ? 'SCRIPT' : 'INFERRED',
      offstage: detection.offstageDistance.offstage ? 'SCRIPT' : 'INFERRED',
      suggestedDurationSeconds: 'INFERRED',
    },
  };
  proposal.prompt = buildFinalPrompt(proposal, detection, context);
  return proposal;
}

function pushEvidence(list, label, evidence) {
  if (evidence) list.push(`${label}: «${evidence}»`);
}

function scoreConfidence(detection) {
  let value = 0.95;
  const reasons = [];
  if (['generic-heard', 'generic-noise', 'fall-object'].includes(detection.source.id)) {
    value = 0.55;
    reasons.push('fuente acústica no identificada en el texto');
  }
  if (!detection.actionEvidence) {
    value = Math.min(value, 0.75);
    reasons.push('acción de la fuente inferida');
  }
  if (!detection.intensity) {
    value = Math.min(value, 0.85);
    reasons.push('volumen no especificado');
  }
  if (!detection.space) {
    value = Math.min(value, 0.9);
    reasons.push('espacio acústico no especificado');
  }
  const level = value >= 0.85 ? 'HIGH' : value >= 0.65 ? 'MEDIUM' : 'LOW';
  return { value: Math.round(value * 100) / 100, level, reasons };
}

/* ------------------------------------------------------------------ */
/* English prompt assembly                                             */
/* ------------------------------------------------------------------ */

const DETAIL_ENGLISH = {
  cristales: 'the windowpanes', vidrios: 'the window glass', ventanas: 'the windowpanes',
  tejado: 'the roof', tejados: 'the roof', techo: 'the roof',
};

function detailEnglish(evidence) {
  const match = /\b(cristales|vidrios|ventanas|tejado|tejados|techo)\b/.exec(fold(evidence));
  return match ? DETAIL_ENGLISH[match[1]] ?? evidence : evidence;
}

function buildFinalPrompt(proposal, detection, context) {
  const { mode } = context;
  const template = TEMPLATES[detection.source.id] ??
    { opener: detection.source.english, churn: 'is heard in the scene' };
  const entry = detection.actionKey && template[detection.actionKey]
    ? template[detection.actionKey]
    : template.churn ?? 'is heard in the scene';
  const isModeEntry = entry && typeof entry === 'object';
  const actionPhrase = isModeEntry ? entry[mode === 'CREATIVE' ? 'creative' : 'strict'] ??
    entry.strict ?? Object.values(entry)[0] : entry;

  let first = `${template.opener} ${actionPhrase}`;
  if (detection.layered.length) {
    const layers = detection.layered.map(layer =>
      (TEMPLATES[layer.source.id]?.opener ?? layer.source.english));
    first += `, layered with ${layers.join(' and ')}`;
  }
  if (detection.explicitDetail) {
    first += `. In the scripted scene the ${template.opener.toLowerCase()} strikes ${detailEnglish(detection.explicitDetail)}`;
  }
  if (detection.musicSourceDetail) {
    first += ', delivered as if coming from a radio';
  }
  let lead = first.trim();
  if (!/[.!?]$/.test(lead)) lead += '.';

  const parts = [lead];
  const intensityText = INTENSITY_PHRASES[proposal.intensity];
  if (intensityText) parts.push(`${intensityText}.`);
  if (detection.offstageDistance.far) parts.push('It reaches the room from a distant position.');
  if (proposal.offstage) parts.push('It is heard from offstage and spills into the room with fading presence.');
  parts.push(SPACE_PHRASES[proposal.acousticSpace.id] ?? SPACE_PHRASES.UNSPECIFIED);
  if (proposal.sequence && proposal.sequence.position > 1) {
    parts.push(`This is the ${ORDINALS[proposal.sequence.position - 1]} of ${proposal.sequence.total} scripted sound beats` +
      (proposal.sequence.anchorEvidence ? ` (${proposal.sequence.anchorEvidence}).` : '.'));
  }
  if (detection.count) {
    const times = detection.count.count && COUNT_WORDS_EN[detection.count.count - 1];
    parts.push(detection.count.count === 1
      ? 'The script specifies a single occurrence; do not repeat it.'
      : times
      ? `The script repeats the event ${times}.`
      : `The script mentions a repeated count (${detection.count.evidence}); confirm the exact number.`);
  }
  const creative = mode === 'CREATIVE' ? CREATIVE_ADDITIONS[detection.source.id] : null;
  const creativeText = creative
    ? ` Suggested acoustic enrichment (inferred; verify on audition): ${creative}.`
    : '';
  let text = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!/[.]$/.test(text)) text += '.';
  text = `${text} ${CATEGORY_TAILS[proposal.category] ?? CATEGORY_TAILS.SFX}`;
  if (proposal.offstage) {
    text += ' Keep it a distant offstage source, never a foreground event.';
  }
  text = trimPromptToLimit(`${text}${creativeText}`.replace(/\s{2,}/g, ' '));
  return text;
}

function trimPromptToLimit(text) {
  if (text.length <= MAX_PROMPT_CHARS) return text;
  return text.slice(0, MAX_PROMPT_CHARS - 1).replace(/[^.]*$/, '') + '.';
}

/* ------------------------------------------------------------------ */
/* Show scanning (reuses annotateDramaticStructure; no second parser)   */
/* ------------------------------------------------------------------ */

function extractInlineSpans(text) {
  if (typeof text !== 'string') return [];
  const spans = [];
  const matcher = /\(([^()]{2,240})\)/g;
  let match;
  while ((match = matcher.exec(text)) !== null) spans.push(match[1].trim());
  return spans;
}

function probeFragment(fragment) {
  const folded = fold(fragment.slice(0, MAX_FRAGMENT_CHARS));
  for (const source of SOURCES) {
    if (execAt(source.match, folded)) return source.english;
  }
  return null;
}

const SOURCE_EVIDENCE_PREFIX = 'Fuente sonora constatada en el guion: «';
const SOURCE_STOPWORDS = new Set(['the', 'and', 'with', 'from', 'unidentified', 'sound', 'noise', 'heard', 'some',
  'del', 'las', 'los', 'una', 'unos', 'unas', 'por', 'con', 'que']);

function ideaNamesSoundSource(idea, proposal) {
  const ideaWords = fold(idea).split(/[^a-z0-9ñ]+/).filter(Boolean);
  const evidence = proposal.explicitElements
    .find(item => item.startsWith(SOURCE_EVIDENCE_PREFIX))
    ?.slice(SOURCE_EVIDENCE_PREFIX.length, -1) ?? '';
  const stems = fold(`${proposal.soundSource ?? ''} ${evidence}`)
    .split(/[^a-z0-9ñ]+/)
    .filter(word => word.length >= 3 && !SOURCE_STOPWORDS.has(word))
    .map(word => word.replace(/(?:es|s)$/, ''))
    .filter(stem => stem.length >= 3);
  return stems.some(stem => ideaWords.some(word => word.startsWith(stem)));
}

/*
 * Approved-idea fidelity. The deterministic compiler renders source, action, count,
 * distance and intensity; other approved descriptors (tempo, texture, material,
 * place...) would otherwise vanish from the English prompt. A general sound-design
 * lexicon carries them over; words it cannot translate are reported, not dropped.
 */
const IDEA_STOPWORDS = new Set(('el la los las lo le les un una uno unos unas de del al a en con sin sobre entre por para ' +
  'que y o u e ni se su sus muy mas menos poco como cuando desde hasta tras contra hacia ante bajo durante mientras ' +
  'otro otra este esta estos estas ese esa aquel aquella cada todo toda hay es son estan ser sonido sonidos efecto ' +
  'efectos ruido cue the an and or of to in on at by for from with without into onto over under between through that ' +
  'this these those then very some its it is are be sound sounds effect one two three four five six seven eight nine ' +
  'ten once twice times seguido seguida luego despues antes entonces algo alguien').split(' '));
// Transport/production vocabulary describes how the cue is operated, not how it sounds.
const IDEA_OPERATIONAL = new Set(('reproducir reproduce lanzar lanza ejecutar ejecuta iniciar inicia comienza empieza ' +
  'detener detiene cortar corta parar para disparar dispara dispararla dispararlo volver vuelve permanece mantiene ' +
  'continua sigue termina acaba activa activo fade loop bucle fundido entrada salida segundo segundos minuto minutos ' +
  'vez veces sola solo unica unico grabado grabada pregrabado pregrabada efecto sonoro sonora anadido anadida ' +
  'fisicamente real utileria senal compas final nivel pista volumen oye escucha suena sonar mediante hace pide debe nuevo nueva ' +
  'sfx stop play cue wav mp3 audio start starts stops plays trigger triggered recorded prerecorded looped seconds ' +
  'second minutes single level track volume heard hear').split(' '));
const IDEA_IDIOMS = Object.freeze([
  ['de golpe', 'slammed abruptly'], ['en mil pedazos', 'shattering'], ['de al lado', 'next door'],
  ['sala de espera', 'waiting room'],
  ['golpe de viento', 'gust'], ['rafaga de viento', 'gust'], ['golpe de mar', 'surge'],
  ['cuna publicitaria', 'advert'], ['cuna de radio', 'advert'], ['de fondo', 'background'],
  ['a lo lejos', 'distant'], ['fuera de escena', 'offstage'], ['en off', 'offstage'],
  ['sirena de niebla', 'foghorn'], ['maquina de escribir', 'typewriter'], ['caja de musica', 'music box'],
  ['reloj de pared', 'wall clock'], ['apenas audible', 'barely audible'], ['sala de maquinas', 'engine room'],
  ['fuegos artificiales', 'fireworks'], ['piso de arriba', 'upstairs'], ['llamada a la puerta', 'knock at the door'],
  ['reloj de arena', 'hourglass'], ['reloj de cuco', 'cuckoo clock'], ['vias del tren', 'railway tracks'],
]);
const IDEA_GLOSSARY = Object.freeze({
  lento: 'slow', lentamente: 'slowly', despacio: 'slowly', rapido: 'fast', rapidamente: 'quickly', veloz: 'fast',
  deprisa: 'hurried', apresurado: 'hurried', pausado: 'unhurried', ritmico: 'rhythmic', irregular: 'irregular',
  constante: 'steady', continuo: 'continuous', intermitente: 'intermittent', repetido: 'repeated', breve: 'brief',
  corto: 'short', largo: 'long', sostenido: 'sustained', creciente: 'swelling', progresivo: 'gradual',
  fuerte: 'loud', suave: 'soft', violento: 'violent', brusco: 'abrupt', seco: 'dry', sordo: 'muffled',
  ahogado: 'muffled', amortiguado: 'muffled', debil: 'faint', tenue: 'faint', leve: 'faint', intenso: 'intense',
  estruendoso: 'thunderous', atronador: 'thunderous', potente: 'powerful', delicado: 'delicate', claro: 'clear',
  nitido: 'crisp', limpio: 'clean', subito: 'sudden', repentino: 'sudden',
  grave: 'low-pitched', agudo: 'high-pitched', metalico: 'metallic', hueco: 'hollow', aspero: 'rough',
  estridente: 'shrill', chillon: 'shrill', apagado: 'dull', brillante: 'bright', profundo: 'deep',
  cristalino: 'crystalline', resonante: 'resonant', vibrante: 'vibrant', ronco: 'hoarse',
  madera: 'wood', metal: 'metal', hierro: 'iron', acero: 'steel', cristal: 'glass', vidrio: 'glass', piedra: 'stone',
  grava: 'gravel', arena: 'sand', nieve: 'snow', barro: 'mud', tela: 'cloth', papel: 'paper', cuero: 'leather',
  hoja: 'leaves', viejo: 'old', antiguo: 'antique', oxidado: 'rusty', nuevo: 'new', roto: 'broken', mojado: 'wet',
  humedo: 'damp', pesado: 'heavy', ligero: 'light',
  cruje: 'creaking', crujir: 'creaking', crujido: 'creaking', chirria: 'creaking', chirrido: 'creaking',
  retumba: 'rumbling', eco: 'echo', reverberacion: 'reverberation', resuena: 'resonating', vibra: 'vibrating',
  arrastra: 'dragging', golpea: 'knocking', gotea: 'dripping', goteo: 'dripping', silba: 'whistling',
  zumba: 'buzzing', zumbido: 'buzzing', abre: 'opening', cierra: 'closing', cae: 'falling', rompe: 'breaking',
  estalla: 'bursting', toque: 'strikes', golpe: 'knocks', grito: 'scream', ladrido: 'barking', aplauso: 'applause',
  lluvia: 'rain', viento: 'wind', trueno: 'thunder', tormenta: 'storm', campana: 'bell', puerta: 'door',
  paso: 'footsteps', perro: 'dog', telefono: 'telephone', reloj: 'clock', tren: 'train', coche: 'car', barco: 'ship',
  sirena: 'siren', agua: 'water', fuego: 'fire', ola: 'waves', pajaro: 'bird', multitud: 'crowd', disparo: 'gunshot',
  vaso: 'glass', musica: 'music', radio: 'radio', piano: 'piano',
  lejano: 'distant', lejos: 'distant', cercano: 'close', cerca: 'close', proximo: 'nearby', fuera: 'outside',
  exterior: 'outdoor', interior: 'indoor', sala: 'hall', salon: 'living room', pasillo: 'corridor', sotano: 'cellar',
  escalera: 'staircase', iglesia: 'church', calle: 'street', bosque: 'forest', campo: 'countryside',
  puerto: 'harbour', faro: 'lighthouse', estacion: 'station', cueva: 'cave', patio: 'courtyard', jardin: 'garden',
  cocina: 'kitchen', habitacion: 'room', despacho: 'office', biblioteca: 'library', mar: 'sea', playa: 'beach',
  rio: 'river', ciudad: 'city', pueblo: 'village', tejado: 'roof', ventana: 'window',
  inquietante: 'unsettling', tenso: 'tense', amenazante: 'menacing', alegre: 'cheerful', triste: 'sad',
  misterioso: 'mysterious', lugubre: 'gloomy', silencioso: 'quiet', tranquilo: 'calm', nocturno: 'night-time',
  noche: 'night', altavoz: 'loudspeaker', megafonia: 'public address', recepcion: 'reception', timbre: 'bell',
  procesado: 'processed', distorsionado: 'distorted', filtrado: 'filtered',
  // Common sound sources and actions (weather, animals, household, transport, nautical, human).
  gato: 'cat', caballo: 'horse', gallo: 'rooster', vaca: 'cow', oveja: 'sheep', lobo: 'wolf', buho: 'owl',
  cuervo: 'crow', grillo: 'crickets', rana: 'frogs', abeja: 'bees', mosca: 'flies', insecto: 'insects',
  paloma: 'pigeons', gaviota: 'gulls', maulla: 'meowing', maullido: 'meowing', aulla: 'howling', aullido: 'howling',
  relincha: 'neighing', relincho: 'neighing', ladra: 'barking', ulula: 'hooting', ruge: 'roaring', rugido: 'roar',
  canta: 'singing', grita: 'shouting', llora: 'crying', llanto: 'crying', risa: 'laughter', susurro: 'whispers',
  susurra: 'whispering', murmullo: 'murmur', murmura: 'murmuring', respiracion: 'breathing', respira: 'breathing',
  jadeo: 'panting', latido: 'heartbeat', corazon: 'heart', tos: 'cough', tose: 'coughing', suspiro: 'sigh',
  palmada: 'clap', voz: 'voices', conversacion: 'conversation', gente: 'people', publico: 'audience', nino: 'children',
  entusiasta: 'enthusiastic', ovacion: 'ovation', abucheo: 'booing',
  llave: 'keys', cerradura: 'lock', cajon: 'drawer', silla: 'chair', mesa: 'table', plato: 'plates', taza: 'cup',
  cubierto: 'cutlery', botella: 'bottle', copa: 'wine glass', tetera: 'kettle', grifo: 'tap', ducha: 'shower',
  interruptor: 'switch', maquina: 'machine', ventilador: 'fan', nevera: 'fridge', televisor: 'television',
  cortina: 'curtain', persiana: 'blinds', tictac: 'ticking', campanada: 'bell toll', alarma: 'alarm', pitido: 'beep',
  timbrazo: 'ring', chispa: 'sparks', electrico: 'electric', estatica: 'static', interferencia: 'interference',
  trafico: 'traffic', bocina: 'horn', claxon: 'horn', motor: 'engine', frenazo: 'screeching brakes', freno: 'brakes',
  rueda: 'rolling', carruaje: 'carriage', moto: 'motorbike', avion: 'aeroplane', helicoptero: 'helicopter',
  tranvia: 'tram', vapor: 'steam', martillo: 'hammer', taladro: 'drill', engranaje: 'gears', arranca: 'starting',
  acerca: 'approaching', aleja: 'receding', pasa: 'passing', muelle: 'pier', casco: 'hull', lona: 'canvas',
  ancla: 'anchor', cadena: 'chain', cuerda: 'rope', remo: 'oars', cubierta: 'deck', niebla: 'fog', marea: 'tide',
  oleaje: 'swell', rama: 'branches', arbol: 'trees', hierba: 'grass', cascada: 'waterfall', arroyo: 'stream',
  fuente: 'fountain', gota: 'drops', granizo: 'hail', relampago: 'lightning', chimenea: 'fireplace', hoguera: 'bonfire',
  brasa: 'embers', crepita: 'crackling', chisporrotea: 'crackling', rasca: 'scratching', rasga: 'tearing',
  frota: 'rubbing', salpica: 'splashing', burbujea: 'bubbling', hierve: 'boiling', sopla: 'blowing',
  ondea: 'flapping', aletea: 'flapping', tiembla: 'trembling', choca: 'crashing', choque: 'crash',
  explosion: 'explosion', explota: 'exploding', derrumba: 'collapsing', desliza: 'sliding', rebota: 'bouncing',
  tintinea: 'tinkling', tintineo: 'tinkling', repica: 'pealing', repique: 'pealing', chasquido: 'click',
  portazo: 'door slam', aldabonazo: 'knocker', corre: 'running', camina: 'walking', salta: 'jumping', sube: 'climbing',
  baja: 'descending', pisa: 'stepping', teclea: 'typing', rendija: 'cracks',
  guitarra: 'guitar', violin: 'violin', tambor: 'drum', trompeta: 'trumpet', organo: 'organ', flauta: 'flute',
  acordeon: 'accordion', orquesta: 'orchestra', melodia: 'melody', cancion: 'song', vals: 'waltz', himno: 'anthem',
  distante: 'distant', remoto: 'remote', audible: 'audible', arriba: 'above', abajo: 'below', encima: 'overhead',
  izquierda: 'left', derecha: 'right', detras: 'behind', delante: 'in front', alrededor: 'around',
  siniestro: 'sinister', oscuro: 'dark', ominoso: 'ominous', festivo: 'festive', solemne: 'solemn', epico: 'epic',
  romantico: 'romantic', melancolico: 'melancholic', nostalgico: 'nostalgic', angustioso: 'distressing',
  dramatico: 'dramatic', sutil: 'subtle', ambiente: 'ambience', denso: 'dense', fino: 'fine', espeso: 'thick',
  amanecer: 'dawn', atardecer: 'dusk', madrugada: 'small hours', invierno: 'winter', verano: 'summer',
  otono: 'autumn', primavera: 'spring', taberna: 'tavern', mercado: 'market', plaza: 'square', estadio: 'stadium',
  teatro: 'theatre', hospital: 'hospital', oficina: 'office', fabrica: 'factory', granja: 'farm', establo: 'stable',
  castillo: 'castle', palacio: 'palace', prision: 'prison', celda: 'cell', tunel: 'tunnel', desierto: 'desert',
  montana: 'mountain', selva: 'jungle', isla: 'island', lago: 'lake', pantano: 'swamp', roca: 'rocks',
  plastico: 'plastic', carton: 'cardboard', laton: 'brass', cobre: 'copper', porcelana: 'porcelain',
  ceramica: 'ceramic', lata: 'tin can', goma: 'rubber', alfombra: 'carpet', suelo: 'floor', pared: 'wall',
  techo: 'ceiling', tabla: 'boards', baldosa: 'tiles', adoquin: 'cobblestones', asfalto: 'asphalt', hielo: 'ice',
  charco: 'puddle', insistente: 'insistent', vacio: 'empty', callejon: 'alley', tacon: 'high heels', marmol: 'marble',
  vestibulo: 'lobby', corredera: 'sliding', enfurecido: 'angry', furioso: 'furious', chapa: 'sheet metal',
  sigiloso: 'stealthy', helado: 'icy', motocicleta: 'motorcycle', acelera: 'accelerating', frena: 'braking',
  derrapa: 'skidding', traqueteo: 'clattering', via: 'tracks', piso: 'floor', boda: 'wedding', llamada: 'call',
  timido: 'timid', grune: 'growling', grunido: 'growl', grazna: 'cawing', chapoteo: 'splashing', cuco: 'cuckoo',
  frigorifico: 'fridge', ambulancia: 'ambulance', cementerio: 'cemetery', abandonado: 'abandoned',
  oscuridad: 'darkness', bota: 'boots', resquebraja: 'cracking', rie: 'laughing', golpetea: 'tapping',
  tamborilea: 'drumming', palpita: 'pulsing', retumbo: 'rumble', estruendo: 'din', estrepito: 'clatter',
  alboroto: 'commotion', bullicio: 'bustle', silencio: 'silence', calma: 'calm', quietud: 'stillness',
  sereno: 'serene', inquieto: 'restless', nervioso: 'nervous', frenetico: 'frantic', enorme: 'huge',
  grande: 'large', pequeno: 'small', diminuto: 'tiny', lleno: 'full',
});
const SPANISH_IDEA = /[áéíóúñ¿¡]|\b(?:el|la|los|las|un|una|unos|unas|de|del|que|se|su|sobre|y|con|en|al)\b/i;
function glossIdeaWord(word) {
  // Plural nouns/adjectives, feminine forms and the verb forms an idea typically uses
  // (gerund, 3rd-person plural, infinitive + se) all resolve to one lexicon entry.
  const forms = [word, word.replace(/es$/, ''), word.replace(/s$/, ''), word.replace(/ando$/, 'a'),
    word.replace(/[iy]endo$/, 'e'), word.replace(/an$/, 'a'), word.replace(/en$/, 'e'),
    word.replace(/ar(?:se)?$/, 'a'), word.replace(/[ei]r(?:se)?$/, 'e'), word.replace(/amente$/, 'o'),
    word.replace(/ad[oa]s?$/, 'a'), word.replace(/id[oa]s?$/, 'e'),
    word.replace(/mente$/, '')];
  for (const form of [...forms, ...forms.map(item => item.replace(/as?$/, 'o'))]) {
    if (Object.hasOwn(IDEA_GLOSSARY, form)) return IDEA_GLOSSARY[form];
  }
  return null;
}
const renderedIn = (text, word) => {
  const stem = word.replace(/(?:ing|ly|ed|es|s)$/, '');
  return new RegExp(`\\b${(stem.length >= 3 ? stem : word).replace(/[^a-z -]/g, '')}`).test(text);
};

/**
 * Which content words of an approved cue idea the English prompt does not render.
 * `add`: English descriptors to append; `untranslated`: Spanish words with no
 * gloss that the compiler did not consume (evidence spans in `explicitElements`).
 */
export function approvedDetailCoverage(idea, prompt, explicitElements = []) {
  // Idea-independent boilerplate (e.g. the generic "Dry theatrical sound effect") is not evidence.
  const promptText = fold([...Object.values(CATEGORY_TAILS), SPACE_PHRASES.UNSPECIFIED]
    .reduce((text, phrase) => text.split(phrase).join(' '), String(prompt ?? '')));
  const consumed = fold(explicitElements.map(item => /«([^»]*)»/.exec(item)?.[1] ?? '').join(' '));
  const text = String(idea ?? '');
  const spanish = SPANISH_IDEA.test(text);
  const add = [], untranslated = [], rendered = [];
  // Mixed-case ideas write character names in capitals ("JULIO cierra la puerta").
  const names = /[a-zà-ÿ]/.test(text) ? new Set(fold((text.match(/\b[A-ZÁÉÍÓÚÑ]{2,}\b/g) ?? []).join(' ')).split(' ')) : new Set();
  let folded = fold(text);
  if (spanish) {
    for (const [phrase, english] of IDEA_IDIOMS) {
      if (!folded.includes(phrase)) continue;
      folded = folded.split(phrase).join(' ');
      if (!renderedIn(promptText, english) && !add.includes(english)) add.push(english);
    }
  }
  for (const word of new Set(folded.match(/[a-zñ]{3,}/g) ?? [])) {
    if (IDEA_STOPWORDS.has(word) || IDEA_OPERATIONAL.has(word) || names.has(word) || Object.hasOwn(NUMBER_WORD_VALUES, word)) continue;
    const english = spanish ? glossIdeaWord(word) : word;
    if (english) {
      if (renderedIn(promptText, english)) rendered.push(word);
      else if (!add.includes(english)) add.push(english);
    } else if (!new RegExp(`\\b${word}\\b`).test(consumed)) {
      untranslated.push(word);
    }
  }
  return { add, untranslated, rendered };
}

export function prepareCueSoundDraft({ cue, scriptText = '', sourceLines = [] } = {}) {
  if (!cue || typeof cue !== 'object' || Array.isArray(cue) ||
      typeof cue.id !== 'string' || typeof cue.label !== 'string' ||
      !Array.isArray(cue.actions) || typeof scriptText !== 'string' ||
      !Array.isArray(sourceLines)) {
    throw new SoundPromptCompilerError('A cue and its original script are required');
  }
  const lines = parseScript(scriptText);
  const cueLineIds = Array.isArray(cue.sourceLineIds) ? cue.sourceLineIds : [];
  const sourceLine = lines.find(line => cueLineIds.includes(line.id)) ??
    sourceLines.find(line => line && cueLineIds.includes(line.id) &&
      typeof line.text === 'string' && /^L[1-9]\d*$/.test(line.id)) ?? null;
  const sourceLineId = sourceLine?.id ?? null;
  const plannedPrompt = cue.actions.find(action =>
    action?.type === 'PLAN_AUDIO' && typeof action.prompt === 'string')?.prompt?.trim() ?? '';
  const cueIdea = /^operator sound selection pending$/i.test(plannedPrompt)
    ? ''
    : plannedPrompt;
  const ideaIsLabel = cueIdea === cue.label.trim();
  const fragments = [...new Set([cueIdea, sourceLine?.text ?? '']
    .map(fragment => fragment.trim())
    .filter(fragment => fragment.length > 0 && fragment.length <= MAX_FRAGMENT_CHARS))];
  let proposal = null;
  for (const fragment of fragments) {
    const candidate = compileSoundProposals({
      fragment,
      sourceLineId,
      projectId: cue.id,
      fragmentKind: 'STAGE_DIRECTION',
      mode: 'STRICT',
    }).find(item => item.category === 'SFX' || item.category === 'ENVIRONMENT') ?? null;
    if (!candidate) continue;
    // An approved cue idea the compiler cannot parse must not be silently
    // replaced by a different sound described elsewhere on the script line.
    if (fragment !== cueIdea && cueIdea && !ideaIsLabel &&
        !ideaNamesSoundSource(cueIdea, candidate)) break;
    proposal = candidate;
    break;
  }

  const direction = cueIdea || sourceLine?.text?.trim() || cue.label.trim();
  const ambient = proposal?.category === 'ENVIRONMENT' ||
    (!proposal && /\b(ambience|ambient|atmospher(?:e|ic)|background|continuous|rain|wind|fire|water|crowd|ambiente|lluvia|viento|fuego|agua|multitud|continuo)\b/i.test(direction));
  const kind = ambient ? 'ENVIRONMENT' : 'SFX';
  const durationSeconds = proposal?.suggestedDurationSeconds ?? (ambient ? 12 : 8);
  const requiresTranslation = !proposal &&
    /[áéíóúñ¿¡]|\b(?:el|la|los|las|un|una|unos|unas|de|del|que|se|su|sobre|puerta|pasos|lluvia|viento|biblioteca|misterio|misteriosa|silencio|sombra|pasillo|bosque|habitación|habitacion|jardín|jardin)\b/i.test(direction);
  const cueReference = `Cue ${String(cue.number ?? cue.id).trim()}` +
    (sourceLineId ? `, script reference ${sourceLineId}` : '');
  const coverage = proposal && cueIdea && !ideaIsLabel
    ? approvedDetailCoverage(cueIdea, proposal.prompt, proposal.explicitElements)
    : { add: [], untranslated: [] };
  const basePrompt = proposal
    ? `${cueReference}. ${proposal.prompt}` +
      (coverage.add.length ? ` Approved cue detail to preserve: ${coverage.add.join(', ')}.` : '')
    : `${cueReference}. Create a clean, isolated theatrical ${kind === 'ENVIRONMENT' ? 'ambience' : 'sound effect'} based on this approved cue idea: "${direction}". Do not add dialogue, music, or unrelated sounds.`;
  const durationPrompt = kind === 'ENVIRONMENT'
    ? ` Sustain as a consistent atmospheric bed for approximately ${durationSeconds} seconds.`
    : ` Complete the described event with a natural decay within approximately ${durationSeconds} seconds.`;

  return {
    prompt: trimPromptToLimit(`${basePrompt}${durationPrompt}`),
    kind,
    durationSeconds,
    sourceLineId,
    interpretation: proposal ? 'SCRIPT_COMPILER' : 'CUE_BRIEF',
    requiresTranslation,
    untranslatedDetail: coverage.untranslated,
  };
}

/**
 * Deterministic offline scan of the ORIGINAL script text. Reuses
 * `annotateDramaticStructure` so L# references and role segregation stay the
 * single source of truth:
 *  - STAGE_DIRECTION/TECHNICAL_DIRECTION lines are compileable,
 *  - inline parenthetical directions inside dialogue lines are compileable,
 *  - spoken dialogue mentioning sounds is NEVER compiled (documented skip).
 */
export function buildShowSoundCandidates(scriptText) {
  if (typeof scriptText !== 'string') {
    throw new SoundPromptCompilerError('Script must be a string');
  }
  const lines = parseScript(scriptText);
  const structure = annotateDramaticStructure(scriptText);
  const candidates = [];
  const skipped = [];
  for (let index = 0; index < structure.lines.length && index < lines.length; index += 1) {
    const annotation = structure.lines[index];
    const line = lines[index];
    const role = annotation.role;
    if (role === 'STAGE_DIRECTION' || role === 'TECHNICAL_DIRECTION') {
      const fragment = line.text.replace(/^\W+|\W+$/g, '').trim() || line.text.trim();
      const probe = probeFragment(fragment);
      if (!probe) {
        skipped.push({ lineId: line.id, role, reason: 'NO_ACOUSTIC_EXPRESSION' });
        continue;
      }
      candidates.push({ lineId: line.id, role, text: line.text.trim(), soundSummary: probe });
      continue;
    }
    let found = false;
    for (const piece of extractInlineSpans(line.text)) {
      const probe = probeFragment(piece);
      if (probe) {
        candidates.push({ lineId: line.id, role: 'INLINE_DIRECTION', text: piece, soundSummary: probe });
        found = true;
      }
    }
    if (found) continue;
    if (role === 'DIALOGUE') {
      skipped.push({ lineId: line.id, role, reason: 'DIALOGUE_MENTION_NOT_STAGE_AUDIO' });
      continue;
    }
    skipped.push({ lineId: line.id, role, reason: 'NOT_SOUND_RELEVANT' });
  }
  const truncated = candidates.length > MAX_SCAN_CANDIDATES;
  return {
    candidates: truncated ? candidates.slice(0, MAX_SCAN_CANDIDATES) : candidates,
    truncated,
    totalCandidates: candidates.length,
    skipped,
  };
}

/* ------------------------------------------------------------------ */
/* Recompile (mode switch / restore original)                          */
/* ------------------------------------------------------------------ */

function isProposalShaped(proposal) {
  return Boolean(proposal && typeof proposal === 'object' && !Array.isArray(proposal) &&
    typeof proposal.originalFragment === 'string' && proposal.originalFragment.trim());
}

/**
 * Rebuild the structured proposal from the stored fragment with a possibly
 * new mode, preserving the id and script reference lineage. Used by the UI
 * for STRICT/CREATIVE switches and restoring the compiled original.
 */
export function recompileProposal(proposal, { mode } = {}) {
  if (!isProposalShaped(proposal)) {
    throw new SoundPromptCompilerError('Not a compiled sound proposal');
  }
  const nextMode = normalizeCompileMode(mode ?? proposal.mode);
  const proposals = assembleProposals({
    fragment: proposal.originalFragment,
    mode: nextMode,
    projectId: proposal.projectId,
    sourceLineId: proposal.scriptReference,
    fragmentKind: proposal.fragmentKind ?? 'STAGE_DIRECTION',
  });
  if (!proposals.length) {
    throw new SoundPromptCompilerError('Fragment no longer detects any audio element');
  }
  const desiredIndex = proposal.sequence?.position ? proposal.sequence.position - 1 : 0;
  const selected = proposals.length > desiredIndex ? proposals[desiredIndex] : proposals[0];
  return { ...selected, id: proposal.id };
}

/* ------------------------------------------------------------------ */
/* Operator edits                                                      */
/* ------------------------------------------------------------------ */

const ALLOWED_EDITS = new Set([
  'category', 'soundSource', 'action', 'material', 'intensity',
  'acousticSpace', 'offstage', 'suggestedDurationSeconds', 'loop', 'prompt',
]);
const STRUCTURE_PROMPT_KEYS = new Set([
  'category', 'soundSource', 'action', 'material', 'intensity',
  'acousticSpace', 'offstage', 'suggestedDurationSeconds',
]);

/**
 * Apply operator edits to a compiled proposal. Every edited field switches to
 * OPERATOR provenance. Unless the operator hand-wrote the final prompt, the
 * prompt regenerates deterministically from the edited structured fields.
 */
export function applyProposalEdits(proposal, edits = {}) {
  if (!isProposalShaped(proposal)) {
    throw new SoundPromptCompilerError('Not a compiled sound proposal');
  }
  if (!edits || typeof edits !== 'object' || Array.isArray(edits)) {
    throw new SoundPromptCompilerError('Edits must be an object');
  }
  const unknown = Object.keys(edits).filter(key => !ALLOWED_EDITS.has(key));
  if (unknown.length) {
    throw new SoundPromptCompilerError('Unsupported proposal edits: ' + unknown.join(', '));
  }
  const next = { ...proposal };
  const provenance = { ...proposal.fieldProvenance };
  let promptRelevant = false;
  for (const [key, value] of Object.entries(edits)) {
    switch (key) {
      case 'category': {
        if (!PROMPT_CATEGORIES.includes(value)) {
          throw new SoundPromptCompilerError('Invalid proposal category');
        }
        if (value !== next.category) promptRelevant = true;
        next.category = value;
        next.model = GENERATION_MODELS[value];
        break;
      }
      case 'soundSource':
      case 'action':
      case 'material': {
        if (typeof value !== 'string' || value.length > MAX_FIELD_CHARS) {
          throw new SoundPromptCompilerError('Invalid proposal field: ' + key);
        }
        const trimmed = value.trim();
        if ((next[key] ?? null) !== (trimmed.length ? trimmed : null)) promptRelevant = true;
        next[key] = trimmed.length ? trimmed : null;
        break;
      }
      case 'intensity': {
        if (value !== null && !INTENSITY_LEVELS.includes(value)) {
          throw new SoundPromptCompilerError('Invalid proposal intensity level');
        }
        if (value !== next.intensity) promptRelevant = true;
        next.intensity = value;
        break;
      }
      case 'acousticSpace': {
        if (!ACOUSTIC_SPACES.includes(value)) {
          throw new SoundPromptCompilerError('Invalid proposal acoustic space');
        }
        if (value !== next.acousticSpace?.id) promptRelevant = true;
        next.acousticSpace = { id: value, label: SPACE_PHRASES[value] ?? SPACE_PHRASES.UNSPECIFIED };
        break;
      }
      case 'offstage': {
        if (typeof value !== 'boolean') {
          throw new SoundPromptCompilerError('Invalid offstage flag');
        }
        if (value !== next.offstage) promptRelevant = true;
        next.offstage = value;
        break;
      }
      case 'suggestedDurationSeconds': {
        if (typeof value !== 'number' || !Number.isFinite(value) ||
            value < MIN_DURATION || value > MAX_DURATION) {
          throw new SoundPromptCompilerError(
            `Duration must be ${MIN_DURATION}..${MAX_DURATION} seconds`);
        }
        next.suggestedDurationSeconds = Math.round(value);
        break;
      }
      case 'loop': {
        if (typeof value !== 'boolean') {
          throw new SoundPromptCompilerError('Invalid loop flag');
        }
        next.loop = value;
        break;
      }
      case 'prompt': {
        if (typeof value !== 'string' || !value.trim() || value.length > MAX_PROMPT_CHARS) {
          throw new SoundPromptCompilerError(
            `Prompt must be 1..${MAX_PROMPT_CHARS} characters`);
        }
        next.prompt = value.trim();
        next.promptEdited = true;
        break;
      }
      default:
        break;
    }
    if (STRUCTURE_PROMPT_KEYS.has(key)) provenance[key] = 'OPERATOR';
  }
  next.fieldProvenance = provenance;
  next.operatorEdited = true;
  if (!next.promptEdited && promptRelevant) {
    next.prompt = buildPromptFromFields(next);
  }
  return next;
}

/** Prompt regeneration after structured (non-prompt) edits. */
export function buildPromptFromFields(proposal) {
  let source = (proposal.soundSource ?? 'an unspecified stage event').trim();
  if (/^(?:a|an|the)\s+/i.test(source)) {
    source = source.replace(/^(?:a|an|the)\s+/i, '');
  }
  const massNouns = new Set([
    'footsteps', 'applause', 'laughter', 'rainfall', 'wind', 'running water',
    'rain', 'thunderclap', 'music', 'crowd murmur', 'clock ticking', 'silence',
  ]);
  const opener = massNouns.has(source.toLowerCase())
    ? `A sound of ${source}`
    : /^[aeiou]/i.test(source) ? `An ${source}` : `A ${source}`;
  const lead = proposal.action
    ? `${opener} ${proposal.action}`
    : `${opener} is heard once in the scene`;
  let leadPart = capitalized(lead);
  if (!/[.!?]$/.test(leadPart)) leadPart += '.';
  const parts = [leadPart];
  const intensityText = INTENSITY_PHRASES[proposal.intensity];
  if (intensityText) parts.push(`${intensityText}.`);
  if (proposal.offstage) {
    parts.push('It is heard from offstage and spills into the room with fading presence.');
  }
  parts.push(SPACE_PHRASES[proposal.acousticSpace?.id] ?? SPACE_PHRASES.UNSPECIFIED);
  if (proposal.sequence && proposal.sequence.position > 1) {
    parts.push(`This is the ${ORDINALS[Math.min(proposal.sequence.position - 1, ORDINALS.length - 1)]}` +
      ` of ${proposal.sequence.total} scripted sound beats.`);
  }
  const tail = CATEGORY_TAILS[proposal.category] ?? CATEGORY_TAILS.SFX;
  let text = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!/[.]$/.test(text)) text += '.';
  return trimPromptToLimit(`${text} ${tail}`);
}
