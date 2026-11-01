#!/usr/bin/env node
/**
 * RUNQ AI context experiment (OFFLINE, no provider, no key, no network).
 *
 * Question: when an operator asks the AI about a real-length show, does the
 * consented context that would be sent to Muse (a) pass the server validator
 * and (b) contain the script lines needed to answer?
 *
 * Variants (same seeded corpus, same questions):
 *   A_LEGACY_WINDOW  - pre-campaign builder: fixed 120-line focus window, no size budget.
 *   B0_BUDGET        - current builder without the instruction (size budget only).
 *   B_RETRIEVAL      - current builder with the instruction (L#, cue, selected-cue and keyword evidence).
 *
 * KEYWORD_PARAPHRASE shares at least one content noun with the target direction; KEYWORD_SYNONYM
 * deliberately shares none, so it exposes the limit of lexical retrieval instead of hiding it.
 *
 * This measures EVIDENCE AVAILABILITY, not Muse answer quality.
 *
 *   node tools/runq-context-retrieval-eval.mjs [--seeds 20] [--out dir] [--quiet]
 */
import {mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createNewShow} from '../src/core/workspace.mjs';
import {insertManualCue} from '../src/core/manualCues.mjs';
import {normalizeShowProject} from '../src/core/projectPersistence.mjs';
import {parseScript} from '../src/core/script.mjs';
import {AGENT_CONTEXT_MAX_CHARS, AGENT_DESIGN_WORKSPACES, buildAgentContext} from '../src/core/agentCore.mjs';

export const VARIANTS = ['A_LEGACY_WINDOW', 'B0_BUDGET', 'B_RETRIEVAL'];
export const SIZES = [80, 300, 1200, 3000];
const CUES_FOR_SIZE = {80: 8, 300: 30, 1200: 60, 3000: 80};

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];

const VOCAB = {
  es: {
    chars: ['ANA', 'LUIS', 'MARTA', 'JORGE'],
    subjects: ['Yo', 'Tú', 'Ella', 'Nosotros', 'Mi madre', 'El capitán', 'La vecina', 'Nadie'],
    verbs: ['recuerda', 'espera', 'olvida', 'promete', 'pregunta por', 'busca', 'imagina', 'teme'],
    objects: ['la carta', 'el invierno', 'tu nombre', 'la cena', 'el dinero', 'aquel verano', 'las llaves', 'la verdad', 'el viaje', 'la fiesta'],
    tails: ['antes del amanecer', 'sin decir nada', 'como siempre', 'desde hace años', 'otra vez', 'esta misma noche', 'por última vez', ''],
    directions: ['(Pausa)', '(Se miran en silencio)', '(Ella se sienta)', '(Cambio de luz)', '(Sale LUIS)', '(Entra MARTA)'],
    distractors: ['(Suena la radio del salón)', '(Se cierra la puerta principal)', '(Un coche se detiene fuera)'],
    scene: n => 'ESCENA ' + n,
    line: n => '¿Qué sonido pondrías en L' + n + '?',
    cue: n => 'Mejora el cue ' + n,
    selected: '¿Qué le falta a este cue?',
    generic: 'Resume el estado del espectáculo',
    targets: [
      ['(Suena el teléfono del despacho)', 'Propón un sonido para cuando suena el teléfono del despacho', '¿Qué efecto usarías para el teléfono que suena en el despacho?', 'ANA: Nadie contesta nunca el teléfono de este despacho', '¿Qué timbre usamos para la llamada de la oficina?'],
      ['(Campanas de la iglesia a lo lejos)', 'Necesito las campanas de la iglesia', '¿Cómo suenan las campanas lejanas?', 'LUIS: Las campanas ya no tocan los domingos', 'Necesito el repique del campanario'],
      ['(Un trueno sacude las ventanas)', 'Diseña el trueno que sacude las ventanas', 'Prepara el trueno de la tormenta', 'MARTA: Cierra las ventanas, que viene tormenta', 'Diseña la tormenta eléctrica'],
      ['(Ladra un perro en el patio)', 'Ajusta el perro que ladra en el patio', '¿Qué hacemos con los ladridos del perro?', 'JORGE: Ese perro no se calla nunca', 'El animal que aúlla fuera'],
      ['(Se rompe un vaso contra el suelo)', 'El vaso que se rompe contra el suelo', 'Sonido del vaso roto', 'ANA: No dejes el vaso tan cerca del borde', 'El cristal que se hace añicos'],
      ['(Llega un tren a la estación)', 'Ambiente del tren llegando a la estación', 'Necesito la llegada del tren', 'LUIS: El último tren sale a medianoche', 'El ferrocarril entrando en el andén'],
      ['(Golpean la puerta del sótano)', 'Los golpes en la puerta del sótano', 'Revisa lo del sótano', 'MARTA: Nunca bajes al sótano de noche', 'Alguien aporrea abajo, en la bodega'],
      ['(Una sirena de barco en el puerto)', 'La sirena del barco en el puerto', 'El barco que llega al puerto', 'JORGE: Mi padre trabajó toda la vida en el puerto', 'La bocina del buque en los muelles'],
    ],
  },
  en: {
    chars: ['ANNA', 'LEWIS', 'MARTHA', 'GEORGE'],
    subjects: ['I', 'You', 'She', 'We', 'My mother', 'The captain', 'The neighbour', 'Nobody'],
    verbs: ['remembers', 'awaits', 'forgets', 'promises', 'asks about', 'looks for', 'imagines', 'fears'],
    objects: ['the letter', 'the winter', 'your name', 'the dinner', 'the money', 'that summer', 'the keys', 'the truth', 'the journey', 'the party'],
    tails: ['before dawn', 'without a word', 'as always', 'for years', 'once again', 'this very night', 'for the last time', ''],
    directions: ['(Pause)', '(They look at each other)', '(She sits down)', '(Light change)', '(Exit LEWIS)', '(Enter MARTHA)'],
    distractors: ['(The living-room radio plays)', '(The front door closes)', '(A car stops outside)'],
    scene: n => 'SCENE ' + n,
    line: n => 'What sound would you put at L' + n + '?',
    cue: n => 'Improve cue ' + n,
    selected: 'What is this cue missing?',
    generic: 'Summarize the state of the show',
    targets: [
      ['(The office telephone rings)', 'Suggest a sound for when the office telephone rings', 'Which effect for the telephone ringing in the office?', 'ANNA: Nobody ever answers the telephone in this office', 'Which ringtone for the call at work?'],
      ['(Church bells in the distance)', 'I need the church bells', 'How should the distant bells sound?', 'LEWIS: The bells no longer ring on Sundays', 'I need the peal from the steeple'],
      ['(Thunder rattles the windows)', 'Design the thunder that rattles the windows', 'Prepare the storm thunder', 'MARTHA: Close the windows, a storm is coming', 'Design the electrical storm'],
      ['(A dog barks in the yard)', 'Adjust the dog barking in the yard', 'What about the dog?', 'GEORGE: That dog never stops', 'The hound howling outside'],
      ['(A glass shatters on the floor)', 'The glass that shatters on the floor', 'Sound of the broken glass', 'ANNA: Do not leave the glass so close to the edge', 'The tumbler smashing to pieces'],
      ['(A train arrives at the station)', 'Ambience of the train arriving at the station', 'I need the train arrival', 'LEWIS: The last train leaves at midnight', 'The locomotive pulling into the platform'],
      ['(Knocking on the cellar door)', 'The knocking on the cellar door', 'Check the cellar moment', 'MARTHA: Never go down to the cellar at night', 'Someone pounding downstairs in the basement'],
      ['(A ship horn in the harbour)', 'The ship horn in the harbour', 'The ship coming into the harbour', 'GEORGE: My father worked his whole life in the harbour', 'The vessel foghorn at the docks'],
    ],
  },
};

const NOTES = {
  es: ['Revisar nivel y fundido con el técnico antes del ensayo general.',
    'Regiduría: esperar a que el actor cierre la puerta, confirmar por intercom con sonido y luces antes de lanzar. Nivel -12 dB, fundido de entrada 3 s, nunca solapar con la música del cambio de escena ni con el aplauso.'],
  en: ['Check level and fade with the technician before dress rehearsal.',
    'Stage management: wait until the actor closes the door, confirm on intercom with sound and lighting before firing. Level -12 dB, 3 s fade in, never overlap the scene-change music or the applause.'],
};

/** Seeded realistic show: dialogue, directions, distractors, planted acoustic targets and cues with notes. */
export function buildShow({size, locale, seed}) {
  const r = rng(seed), v = VOCAB[locale];
  const text = [];
  for (let i = 0; i < size; i++) {
    if (i % 60 === 0) { text.push(v.scene(i / 60 + 1)); continue; }
    if (r() < 0.07) { text.push(r() < 0.3 ? pick(r, v.distractors) : pick(r, v.directions)); continue; }
    const tail = pick(r, v.tails);
    text.push(pick(r, v.chars) + ': ' + pick(r, v.subjects) + ' ' + pick(r, v.verbs) + ' ' + pick(r, v.objects) + (tail ? ' ' + tail : '') + '.');
  }
  const targetCount = size >= 300 ? 6 : 3;
  const order = [...v.targets.keys()].sort(() => r() - 0.5).slice(0, targetCount);
  const used = new Set(), targets = [];
  const freeSlot = () => { for (;;) { const i = 1 + Math.floor(r() * (size - 2)); if (i % 60 && !used.has(i)) { used.add(i); return i; } } };
  for (const k of order) {
    const [line, direct, paraphrase, mention, synonym] = v.targets[k];
    const at = freeSlot(); text[at] = line;
    text[freeSlot()] = mention;
    targets.push({lineId: 'L' + (at + 1), direct, paraphrase, synonym});
  }
  let project = createNewShow({id: `ctx-${locale}-${size}-${seed}`, name: 'Context ' + size, scriptText: text.join('\n')});
  const cueCount = CUES_FOR_SIZE[size];
  for (let i = 0; i < cueCount; i++) project = insertManualCue(project, {label: (locale === 'es' ? 'Efecto ' : 'Effect ') + (i + 1)}).project;
  const anchors = [...new Set(Array.from({length: cueCount}, () => 2 + Math.floor(r() * (size - 2))))].sort((x, y) => x - y);
  project = normalizeShowProject({...project, cues: project.cues.map((cue, i) => ({
    ...cue, sourceLineIds: ['L' + (anchors[i % anchors.length])],
    trigger: r() < 0.5 ? (locale === 'es' ? 'cuando llegue el momento' : 'when the moment comes') : '',
    notes: (x => x < 0.4 ? '' : x < 0.8 ? NOTES[locale][0] : NOTES[locale][1])(r()),
  }))});
  return {project, targets};
}

/** Exact replica of buildAgentContext before the campaign fix (commit 912eb1f). */
export function legacyAgentContext(project, {focusLineId = null, selectedCueId = null} = {}) {
  const p = normalizeShowProject(project), maxCues = 80, maxScriptLines = 120;
  const boundedCues = p.cues.slice(0, maxCues);
  const selectedCue = selectedCueId === null ? null : p.cues.find(c => c.id === selectedCueId);
  if (selectedCue && !boundedCues.some(c => c.id === selectedCueId)) { boundedCues[maxCues - 1] = selectedCue; boundedCues.sort((a, b) => a.number - b.number); }
  const lines = parseScript(p.scriptText);
  const focus = Number(/^L([1-9]\d*)$/.exec(focusLineId ?? '')?.[1]) || 1;
  const first = Math.max(0, Math.min(focus - 1 - Math.floor(maxScriptLines / 2), Math.max(0, lines.length - maxScriptLines)));
  return {
    projectId: p.id, projectName: p.name, workspace: 'ai', mode: 'design-manual', selectedCueId,
    counts: {cues: p.cues.length, assets: p.assets.length, scriptLines: lines.length},
    truncated: {cues: p.cues.length > maxCues, script: lines.length > maxScriptLines},
    cues: boundedCues.map(c => ({id: c.id, number: c.number, label: c.label, trigger: c.trigger ?? '', notes: c.notes ?? '',
      sourceLineIds: [...c.sourceLineIds], playback: c.playback ?? {},
      assetIds: [...c.actions.filter(a => a.type === 'PLAY').map(a => a.assetId), ...(c.audioTracks ?? []).map(t => t.assetId)],
      unresolved: c.actions.some(a => a.type === 'PLAN_AUDIO')})),
    assets: p.assets.map(a => ({id: a.id, name: a.name, available: null})),
    lines: lines.slice(first, first + maxScriptLines).map(l => ({id: l.id, text: l.text.slice(0, 350)})),
  };
}

/** Same structural checks as tools/agentRoutes.mjs before any provider access. The UI separately refuses truncated cue lists. */
export function serverAccepts(context) {
  return Array.isArray(context.cues) && Array.isArray(context.lines) && context.cues.length <= 80 && context.lines.length <= 120 &&
    AGENT_DESIGN_WORKSPACES.includes(context.workspace) && context.mode === 'design-manual' &&
    (context.selectedCueId === null || context.cues.some(c => c.id === context.selectedCueId)) &&
    JSON.stringify(context).length <= AGENT_CONTEXT_MAX_CHARS;
}

export function questionsFor({project, targets}, locale, r) {
  const v = VOCAB[locale], total = parseScript(project.scriptText).length, qs = [];
  for (let k = 0; k < 3; k++) { const n = 1 + Math.floor(r() * total); qs.push({type: 'LINE_REF', instruction: v.line(n), gold: ['L' + n]}); }
  for (let k = 0; k < 3; k++) { const cue = pick(r, project.cues); qs.push({type: 'CUE_REF', instruction: v.cue(cue.number), gold: [...cue.sourceLineIds]}); }
  for (const t of targets.slice(0, 2)) {
    qs.push({type: 'KEYWORD_DIRECT', instruction: t.direct, gold: [t.lineId]});
    qs.push({type: 'KEYWORD_PARAPHRASE', instruction: t.paraphrase, gold: [t.lineId]});
    qs.push({type: 'KEYWORD_SYNONYM', instruction: t.synonym, gold: [t.lineId]});
  }
  for (let k = 0; k < 2; k++) { const cue = pick(r, project.cues); qs.push({type: 'SELECTED_CUE', instruction: v.selected, selectedCueId: cue.id, gold: [...cue.sourceLineIds]}); }
  qs.push({type: 'GENERIC', instruction: v.generic, gold: []});
  return qs;
}

function contextFor(variant, project, q) {
  const focusLineId = q.selectedCueId ? project.cues.find(c => c.id === q.selectedCueId)?.sourceLineIds[0] ?? null : null;
  const selectedCueId = q.selectedCueId ?? null;
  if (variant === 'A_LEGACY_WINDOW') return legacyAgentContext(project, {focusLineId, selectedCueId});
  return buildAgentContext(project, {focusLineId, selectedCueId, ...(variant === 'B_RETRIEVAL' ? {instruction: q.instruction} : {})});
}

export function runContextRetrievalEval({seeds = 20, sizes = SIZES, locales = ['es', 'en']} = {}) {
  const rows = [];
  for (const size of sizes) for (const locale of locales) for (let s = 0; s < seeds; s++) {
    const seed = 20261101 + size * 1000 + s * 7 + (locale === 'en' ? 3 : 0);
    const show = buildShow({size, locale, seed});
    const r = rng(seed ^ 0x5bd1e995);
    for (const q of questionsFor(show, locale, r)) for (const variant of VARIANTS) {
      const context = contextFor(variant, show.project, q);
      const accepted = serverAccepts(context);
      const uiBlocked = context.truncated.cues === true;
      const ids = new Set(context.lines.map(l => l.id));
      const evidence = q.gold.every(id => ids.has(id));
      rows.push({variant, size, locale, seed, type: q.type, accepted, uiBlocked, evidence,
        usable: accepted && !uiBlocked && evidence, chars: JSON.stringify(context).length, lines: context.lines.length, cues: context.cues.length});
    }
  }
  return rows;
}

export function summarize(rows) {
  const groups = {};
  const add = (key, row) => { const g = groups[key] ??= {n: 0, accepted: 0, blocked: 0, usable: 0, gold: 0, chars: 0};
    g.n++; g.accepted += row.accepted; g.blocked += row.uiBlocked; g.chars += row.chars; if (row.type !== 'GENERIC') { g.gold++; g.usable += row.usable; } };
  for (const row of rows) { add(row.variant, row); add(row.variant + '|' + row.type, row); add(row.variant + '|size=' + row.size, row); }
  const out = {};
  for (const [key, g] of Object.entries(groups)) out[key] = {n: g.n, acceptedRate: g.accepted / g.n, uiBlockedRate: g.blocked / g.n,
    usableEvidenceRate: g.gold ? g.usable / g.gold : null, meanChars: Math.round(g.chars / g.n)};
  return out;
}

const pct = x => x === null ? '—' : (100 * x).toFixed(1) + '%';

async function main() {
  const args = process.argv.slice(2), opt = {seeds: 20, out: 'artifacts/context-retrieval-eval', quiet: false};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--seeds') opt.seeds = Math.max(1, Number(args[++i]) || 1);
    else if (args[i] === '--out') opt.out = args[++i];
    else if (args[i] === '--quiet') opt.quiet = true;
    else throw new Error('UNKNOWN_OPTION ' + args[i]);
  }
  const rows = runContextRetrievalEval({seeds: opt.seeds});
  const summary = summarize(rows);
  const types = [...new Set(rows.map(r => r.type))], sizes = [...new Set(rows.map(r => r.size))];
  const md = ['# RUNQ AI context experiment (offline)', '',
    'Evidence availability in the consented context sent to the model; **not** Muse answer quality. No provider requests.', '',
    '| Variant | Server accepts | UI blocks (cue list cut) | Usable evidence | Mean chars |', '|---|---:|---:|---:|---:|',
    ...VARIANTS.map(v => `| ${v} | ${pct(summary[v].acceptedRate)} | ${pct(summary[v].uiBlockedRate)} | ${pct(summary[v].usableEvidenceRate)} | ${summary[v].meanChars} |`), '',
    '| Question type | ' + VARIANTS.join(' | ') + ' |', '|---|' + VARIANTS.map(() => '---:').join('|') + '|',
    ...types.map(t => `| ${t} | ` + VARIANTS.map(v => t === 'GENERIC' ? 'accept ' + pct(summary[v + '|' + t].acceptedRate) : pct(summary[v + '|' + t].usableEvidenceRate)).join(' | ') + ' |'), '',
    '| Script lines | ' + VARIANTS.join(' | ') + ' |', '|---|' + VARIANTS.map(() => '---:').join('|') + '|',
    ...sizes.map(s => `| ${s} | ` + VARIANTS.map(v => pct(summary[v + '|size=' + s].usableEvidenceRate)).join(' | ') + ' |'), ''];
  const dir = resolve(opt.out);
  await mkdir(dir, {recursive: true});
  await writeFile(join(dir, 'cases.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  await writeFile(join(dir, 'summary.json'), JSON.stringify({version: 1, providerRequests: 0, cases: rows.length / VARIANTS.length, rows: rows.length, summary}, null, 2) + '\n');
  await writeFile(join(dir, 'report.md'), md.join('\n'));
  if (!opt.quiet) console.log(md.join('\n'));
  const b = summary.B_RETRIEVAL;
  const exact = ['LINE_REF', 'CUE_REF', 'SELECTED_CUE'].every(t => summary['B_RETRIEVAL|' + t].usableEvidenceRate === 1);
  const failed = rows.filter(r => r.variant === 'B_RETRIEVAL' && (!r.accepted || r.uiBlocked || (['LINE_REF', 'CUE_REF', 'SELECTED_CUE'].includes(r.type) && !r.evidence))).length;
  console.log(`CONTEXT RETRIEVAL EVAL unique=${rows.length / VARIANTS.length} trials=${rows.length} checks=${rows.length * 2} failed=${failed} ` +
    `B_accept=${pct(b.acceptedRate)} B_evidence=${pct(b.usableEvidenceRate)} A_evidence=${pct(summary.A_LEGACY_WINDOW.usableEvidenceRate)} providerRequests=0`);
  if (failed || b.acceptedRate !== 1 || !exact) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error('CONTEXT_EVAL_ERROR', error.message); process.exitCode = 1; });
}
